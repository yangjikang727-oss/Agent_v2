/**
 * ReAct 引擎 - Skill 驱动版
 * 
 * 基于 Qoder Skill 渐进式披露机制：
 * 第一层：加载所有 SKILL.md 元数据，LLM 动态识别日程类型
 * 第二层：加载匹配 Skill 的指令，LLM 提取参数
 * 第三层：按 Skill 声明的 action 弹出预填充表单
 */

import type { LLMConfig } from '../core/llmCore'
import { callLLMRaw } from '../core/llmCore'
import { toolRegistry, type ToolContext, type ToolResult } from './toolRegistry'
import { REACT_PROMPTS, parseReActResponse, formatObservation, type ReActStep } from './reactPrompts'
import { skillStore } from './skills/skillStore'
import type { BrainState } from '../../types'

// ==================== ReAct引擎配置 ====================

export interface ReActConfig {
  maxSteps: number        // 最大推理步数
  maxRetries: number      // 工具调用最大重试次数
  timeout: number         // 单次调用超时时间(ms)
  enableLogging: boolean  // 是否启用详细日志
}

const DEFAULT_CONFIG: ReActConfig = {
  maxSteps: 8,
  maxRetries: 3,
  timeout: 60000,
  enableLogging: true
}

// ==================== ReAct引擎核心类 ====================

export class ReActEngine {
  private config: ReActConfig
  private llmConfig: LLMConfig
  
  constructor(llmConfig: LLMConfig, config: Partial<ReActConfig> = {}) {
    this.llmConfig = llmConfig
    this.config = { ...DEFAULT_CONFIG, ...config }
  }
  
  /**
   * 处理用户查询的主入口 - Skill 驱动版
   * 
   * 渐进式披露流程：
   * 1. [第一层] 加载所有 Skill 元数据 → LLM 动态匹配日程类型
   * 2. [第二层] 加载匹配 Skill 的指令 → LLM 提取参数
   * 3. [第三层] 按 Skill 声明的 action → 弹出预填充表单
   */
  async processQuery(
    query: string,
    context: {
      userId: string
      currentDate: string
      scheduleStore: any
      taskStore: any
      brainState?: BrainState
      conversationHistory?: Array<{role: string, content: string}>
    }
  ): Promise<{
    finalAnswer: string
    steps: ReActStep[]
    success: boolean
    error?: string
  }> {
    const steps: ReActStep[] = []
    const toolContext: ToolContext = {
      userId: context.userId,
      currentDate: context.currentDate,
      scheduleStore: context.scheduleStore,
      taskStore: context.taskStore,
      config: this.config
    }
    
    try {
      // 确保 Skill 系统已初始化（Skill 作为工具注册到 toolRegistry）
      skillStore.loadAllSkills()
      
      // ==================== ReAct 推理循环 ====================
      this.log('[ReAct] 开始推理循环')
      
      const toolsSummary = toolRegistry.getToolsSummary()
      const historyContext = context.conversationHistory && context.conversationHistory.length > 0
        ? this.buildHistoryContext(context.conversationHistory)
        : ''
      
      let currentPrompt = REACT_PROMPTS.THINK(toolsSummary, context.currentDate, query, historyContext)
      let llmResponse = ''
      
      for (let step = 0; step < this.config.maxSteps; step++) {
        this.log(`[Step ${step + 1}] 发送提示词到LLM`)
        
        const response = await this.callLLMWithTimeout(currentPrompt)
        if (!response) {
          throw new Error('LLM调用超时或失败')
        }
        
        llmResponse = response
        this.log(`[Step ${step + 1}] LLM响应: ${llmResponse}`)
        
        const parsedStep = parseReActResponse(llmResponse)
        steps.push(parsedStep)
        
        if (parsedStep.finalAnswer) {
          this.log('获得最终答案')
          return { finalAnswer: parsedStep.finalAnswer, steps, success: true }
        }
        
        if (parsedStep.action && parsedStep.action !== 'Final Answer') {
          this.log(`执行工具: ${parsedStep.action}`)
          
          const toolResult = await this.executeToolWithRetry(
            parsedStep.action,
            parsedStep.actionInput || {},
            toolContext
          )
          
          const observation = formatObservation(parsedStep.action, toolResult)
          this.log(`工具执行结果: ${observation}`)
          
          const lastIndex = steps.length - 1
          if (lastIndex >= 0 && steps[lastIndex]) {
            steps[lastIndex].observation = observation
          }
          
          // 检查是否是 Skill 工具（返回的 data 中包含 action 字段）
          if (toolResult.success && toolResult.data && toolResult.data.action) {
            this.log(`✔ 检测到 Skill 工具触发 UI 动作: ${toolResult.data.action}`)
            
            // 构建包含 UI动作的 step
            const uiActionStep: ReActStep = {
              thought: `执行技能: ${toolResult.data.skillName}`,
              action: toolResult.data.action,  // UI 动作名（如 open_create_meeting_modal）
              actionInput: {
                formData: toolResult.data.params,  // 表单数据
                taskId: toolResult.data.taskId     // 任务ID
              },
              observation: toolResult.data.message
            }
            
            steps.push(uiActionStep)
            
            // 直接返回，不再继续 ReAct 循环
            return {
              finalAnswer: ' ',  // 空格，确保前端能检测到响应
              steps,
              success: true
            }
          }
          
          currentPrompt = REACT_PROMPTS.OBSERVE(observation, toolsSummary)
        } else {
          const finalAnswer = this.extractFinalAnswer(llmResponse)
          if (finalAnswer) {
            return { finalAnswer, steps, success: true }
          }
          
          currentPrompt = REACT_PROMPTS.OBSERVE('请继续思考或给出最终答案', toolsSummary)
        }
      }
      
      return { finalAnswer: '超过最大推理步数', steps, success: false, error: '超过最大推理步数' }
      
    } catch (error) {
      this.log(`ReAct执行出错: ${error}`)
      return {
        finalAnswer: `处理过程中出现错误: ${(error as Error).message}`,
        steps,
        success: false,
        error: (error as Error).message
      }
    }
  }

  // ==================== 工具执行方法 ====================

  private async executeToolWithRetry(
    toolName: string,
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const tool = toolRegistry.getTool(toolName)
        if (!tool) {
          return {
            success: false,
            error: `未找到工具: ${toolName}`
          }
        }
        
        const result = await tool.execute(params, context)
        return result
        
      } catch (error) {
        lastError = error as Error
        this.log(`工具执行失败 (尝试 ${attempt + 1}/${this.config.maxRetries + 1}): ${(error as Error).message}`)
        
        if (attempt < this.config.maxRetries) {
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }
    
    return {
      success: false,
      error: `工具执行失败，已重试${this.config.maxRetries}次: ${lastError?.message || '未知错误'}`
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * JSON 解析辅助
   */
  private parseJSON<T>(response: string): T | null {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      let jsonStr = (jsonMatch && jsonMatch[1]) ? jsonMatch[1] : response
      if (!jsonStr) return null
      const jsonStart = jsonStr.indexOf('{')
      const jsonEnd = jsonStr.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) return null
      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1)
      return JSON.parse(jsonStr) as T
    } catch {
      this.log('JSON 解析失败')
      return null
    }
  }

  private buildHistoryContext(history: Array<{role: string, content: string}>): string {
    if (history.length === 0) return ''
    
    const recentHistory = history.slice(-3) // 只取最近3轮对话
    return recentHistory
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n')
  }

  private extractFinalAnswer(response: string): string | null {
    // 尝试从响应中提取最终答案
    const finalAnswerMatch = response.match(/Final Answer:\s*(.+)$/i)
    if (finalAnswerMatch && finalAnswerMatch[1]) {
      return finalAnswerMatch[1].trim()
    }
    
    // 兜底：如果看起来像是答案，就返回
    if (response.length > 10 && !response.includes('Thought:') && !response.includes('Action:')) {
      return response.trim()
    }
    
    return null
  }

  private log(message: string) {
    if (this.config.enableLogging) {
      console.log(`[ReActEngine] ${message}`)
    }
  }

  /**
   * 带超时的LLM调用
   */
  private async callLLMWithTimeout(prompt: string): Promise<string | null> {
    this.log(`开始LLM调用，提示词长度: ${prompt.length} 字符`)
    this.log(`LLM配置: provider=${this.llmConfig.provider}, model=${this.llmConfig.model}`)
    this.log(`API URL: ${this.llmConfig.apiUrl || '使用默认'}`)
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`LLM调用超时 (${this.config.timeout}ms)`))
      }, this.config.timeout)
      
      callLLMRaw(prompt, '', this.llmConfig)
        .then(result => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }
}

// ==================== 工厂方法 ====================

/**
 * 创建ReAct引擎实例
 */
export function createReActEngine(
  llmConfig: LLMConfig,
  config?: Partial<ReActConfig>
): ReActEngine {
  return new ReActEngine(llmConfig, config)
}

// ==================== 状态管理集成 ====================

/**
 * 将ReAct引擎与大脑状态集成
 */
export function integrateWithBrain(
  _engine: ReActEngine,
  _brainState: BrainState
): void {
  // 可以在这里添加状态同步逻辑
}