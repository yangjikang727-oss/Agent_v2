import type { LLMConfig } from './llmService'
import { callLLMRaw } from './llmService'
import { toolRegistry, type ToolContext, type ToolResult } from './toolRegistry'
import { REACT_PROMPTS, parseReActResponse, formatObservation, type ReActStep } from './reactPrompts'
import type { BrainState } from '../types'

// ==================== ReAct引擎配置 ====================

export interface ReActConfig {
  maxSteps: number        // 最大推理步数
  maxRetries: number      // 工具调用最大重试次数
  timeout: number         // 单次调用超时时间(ms)
  enableLogging: boolean  // 是否启用详细日志
}

const DEFAULT_CONFIG: ReActConfig = {
  maxSteps: 5,
  maxRetries: 3,
  timeout: 60000,  // 增加到60秒
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
   * 处理用户查询的主入口
   */
  async processQuery(
    query: string,
    context: {
      userId: string
      currentDate: string
      scheduleStore: any
      taskStore: any
      brainState?: BrainState
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
      config: this.llmConfig
    }
    
    try {
      // 获取工具摘要
      const toolsSummary = toolRegistry.getToolsSummary()
      
      // 第一步：初始推理
      let currentPrompt = REACT_PROMPTS.THINK(toolsSummary, context.currentDate, query)
      let llmResponse = ''
      
      for (let step = 0; step < this.config.maxSteps; step++) {
        this.log(`[Step ${step + 1}] 发送提示词到LLM`)
        
        // 调用LLM
        const response = await this.callLLMWithTimeout(currentPrompt)
        if (!response) {
          throw new Error('LLM调用超时或失败')
        }
        
        llmResponse = response
        this.log(`[Step ${step + 1}] LLM响应: ${llmResponse}`)
        
        // 解析响应
        const parsedStep = parseReActResponse(llmResponse)
        steps.push(parsedStep)
        
        // 检查是否完成
        if (parsedStep.finalAnswer) {
          this.log('获得最终答案')
          return {
            finalAnswer: parsedStep.finalAnswer,
            steps,
            success: true
          }
        }
        
        // 检查是否需要执行工具
        if (parsedStep.action && parsedStep.action !== 'Final Answer') {
          this.log(`执行工具: ${parsedStep.action}`)
          
          // 执行工具
          const toolResult = await this.executeToolWithRetry(
            parsedStep.action,
            parsedStep.actionInput || {},
            toolContext
          )
          
          // 格式化观察结果
          const observation = formatObservation(parsedStep.action, toolResult)
          this.log(`工具执行结果: ${observation}`)
          
          // 更新步骤记录
          const lastIndex = steps.length - 1
          if (lastIndex >= 0 && steps[lastIndex]) {
            steps[lastIndex].observation = observation
          }
          
          // 准备下一轮推理
          currentPrompt = REACT_PROMPTS.OBSERVE(observation, toolsSummary)
        } else {
          // 没有明确的动作指令，尝试提取答案
          const finalAnswer = this.extractFinalAnswer(llmResponse)
          if (finalAnswer) {
            return {
              finalAnswer,
              steps,
              success: true
            }
          }
          
          // 如果仍然没有答案，继续下一轮
          currentPrompt = REACT_PROMPTS.OBSERVE(
            '请继续思考或给出最终答案', 
            toolsSummary
          )
        }
      }
      
      // 达到最大步数限制
      this.log('达到最大推理步数限制')
      return {
        finalAnswer: '抱歉，经过多次推理仍无法得出明确答案。请尝试重新表述您的问题。',
        steps,
        success: false,
        error: '超过最大推理步数'
      }
      
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
  
  /**
   * 带超时的LLM调用
   */
  private async callLLMWithTimeout(prompt: string): Promise<string | null> {
    this.log(`开始LLM调用，提示词长度: ${prompt.length} 字符`)
    this.log(`LLM配置: provider=${this.llmConfig.provider}, model=${this.llmConfig.model}`)
    this.log(`API URL: ${this.llmConfig.apiUrl || '使用默认'}`)
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.log(`LLM调用超时 (${this.config.timeout}ms)`)
        reject(new Error(`LLM调用超时 (${this.config.timeout}ms)`))
      }, this.config.timeout)
      
      callLLMRaw(prompt, '', this.llmConfig)
        .then((result: string | null) => {
          clearTimeout(timeoutId)
          this.log(`LLM调用成功，结果长度: ${result ? result.length : 0} 字符`)
          resolve(result || null)
        })
        .catch((error: Error) => {
          clearTimeout(timeoutId)
          this.log(`LLM调用失败: ${error.message}`)
          reject(error)
        })
    })
  }
  
  /**
   * 带重试的工具执行
   */
  private async executeToolWithRetry(
    toolName: string,
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        this.log(`工具执行尝试 ${attempt + 1}/${this.config.maxRetries}`)
        const result = await toolRegistry.getTool(toolName)?.execute(params, context)
        
        if (result) {
          return result
        }
      } catch (error) {
        lastError = error as Error
        this.log(`工具执行失败 (尝试 ${attempt + 1}): ${lastError.message}`)
        
        if (attempt === this.config.maxRetries - 1) {
          break
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
    
    return {
      success: false,
      error: lastError?.message || `工具 "${toolName}" 执行失败`
    }
  }
  
  /**
   * 从LLM响应中提取最终答案
   */
  private extractFinalAnswer(response: string): string | null {
    // 尝试多种方式提取答案
    const patterns = [
      /Final Answer:\s*([^\n].*)/is,
      /答案[:：]\s*([^\n].*)/is,
      /最终[:：]\s*([^\n].*)/is,
      /^([^\n]{10,})$/ // 如果只有一行且较长，可能是答案
    ]
    
    for (const pattern of patterns) {
      const match = response.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
    
    return null
  }
  
  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[ReActEngine] ${message}`)
    }
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<ReActConfig>): void {
    this.config = { ...this.config, ...config }
  }
  
  /**
   * 获取当前配置
   */
  getConfig(): ReActConfig {
    return { ...this.config }
  }
}

// ==================== 工厂函数 ====================

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
  engine: ReActEngine,
  brainState: BrainState
): void {
  // 可以在这里添加状态同步逻辑
  // 例如：监听ReAct执行过程，更新大脑状态显示
}