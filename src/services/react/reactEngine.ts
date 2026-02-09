/**
 * ReAct 引擎 - 零提示即时响应版
 * 严格按照用户要求实现：会议室类型字段 + 零提示 + 直接触发
 */

import type { LLMConfig } from '../core/llmCore'
import { callLLMRaw } from '../core/llmCore'
import { toolRegistry, type ToolContext, type ToolResult } from './toolRegistry'
import { REACT_PROMPTS, parseReActResponse, formatObservation, type ReActStep } from './reactPrompts'
import { SmartParamCollector } from './smartCollector'
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
   * 处理用户查询的主入口 - 零提示即时响应版
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
      // 获取工具摘要
      const toolsSummary = toolRegistry.getToolsSummary()
      
      // 构建对话历史上下文
      const historyContext = context.conversationHistory && context.conversationHistory.length > 0
        ? this.buildHistoryContext(context.conversationHistory)
        : ''
      
      // 1. 简化意图识别 - 识别会议和出差日程
      const isMeetingIntent = this.isMeetingRelated(query)
      const isTripIntent = this.isTripRelated(query)
      
      console.log('[ReActEngine] 会议意图识别结果:', isMeetingIntent)
      console.log('[ReActEngine] 出差意图识别结果:', isTripIntent)
      
      // 2. 如果是会议日程，无条件直接触发创建会议技能
      if (isMeetingIntent) {
        return await this.handleMeetingIntent(query, context, toolContext)
      }
      
      // 3. 如果是出差日程，无条件直接触发出差申请技能
      if (isTripIntent) {
        return await this.handleTripIntent(query, context, toolContext)
      }
      
      // 3. 其他情况使用传统ReAct推理
      // 第一步：初始推理
      let currentPrompt = REACT_PROMPTS.THINK(toolsSummary, context.currentDate, query, historyContext)
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
      return {
        finalAnswer: '超过最大推理步数',
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

  // ==================== 简化意图识别 ====================

  /**
   * 简单判断是否为会议相关意图
   */
  private isMeetingRelated(query: string): boolean {
    const meetingKeywords = [
      '会议', '例会', '复盘', '沟通', '开会', '约', '聊', '讨论',
      '议题', 'agenda', '会议室', '房间', '地点', '时间', '几点',
      '预定', '安排', '组织', '主持', '参与', '参加'
    ]
    
    const lowerQuery = query.toLowerCase()
    return meetingKeywords.some(keyword => lowerQuery.includes(keyword))
  }

  /**
   * 简单判断是否为出差相关意图
   */
  private isTripRelated(query: string): boolean {
    const tripKeywords = [
      '出差', '飞', '前往', '机票', '酒店', '住宿', '旅行', '外出',
      '出发', '目的地', '行程', '交通', '航班', '火车', '汽车', '轮船',
      '去', '到', '往', '赴'
    ]
    
    const lowerQuery = query.toLowerCase()
    return tripKeywords.some(keyword => lowerQuery.includes(keyword))
  }

  // ==================== 出差处理方法（零提示版）====================

  /**
   * 处理出差意图（零提示即时响应版）
   * 严格按照用户要求：出差申请字段 + 零提示 + 直接触发
   */
  private async handleTripIntent(
    query: string,
    context: any,
    toolContext: any
  ): Promise<any> {
    const sessionId = context.userId || 'default_session'
    
    // 1. 智能参数收集
    const { params, missing, canExecute, nextQuestion, extractionInfo } = 
      await SmartParamCollector.collectTripParams(sessionId, query, this.llmConfig)
    
    console.log('[ReActEngine] 出差参数收集结果:', { params, missing, canExecute })
    
    // 2. 无条件直接触发出差申请技能（零提示即时响应）
    // 直接生成完整的出差申请表单，不显示任何提示信息
    return {
      finalAnswer: ' ',  // 单个空格，确保前端能检测到响应
      steps: [{
        thought: '无条件触发出差申请技能',
        action: 'open_trip_application_modal',
        actionInput: {
          formData: {
            startDate: params.startDate || '',
            startTime: params.startTime || '',
            endDate: params.endDate || '',
            endTime: params.endTime || '',
            from: params.from || '',
            to: params.to || '',
            transport: params.transport || '',
            reason: params.reason || ''
          },
          taskId: `TRIP-${Date.now()}`
        }
      }],
      success: true
    }
  }

  // ==================== 会议处理方法（零提示版）====================

  /**
   * 处理会议意图（零提示即时响应版）
   * 严格按照用户要求：会议室类型字段 + 零提示 + 直接触发
   */
  private async handleMeetingIntent(
    query: string,
    context: any,
    toolContext: any
  ): Promise<any> {
    const sessionId = context.userId || 'default_session'
    
    // 1. 智能参数收集
    const { params, missing, canExecute, nextQuestion, extractionInfo } = 
      await SmartParamCollector.collectMeetingParams(sessionId, query, this.llmConfig)
    
    console.log('[ReActEngine] 会议参数收集结果:', { params, missing, canExecute })
    
    // 2. 无条件直接触发创建会议技能（零提示即时响应）
    // 直接生成完整的会议创建表单，不显示任何提示信息
    return {
      finalAnswer: ' ',  // 单个空格，确保前端能检测到响应
      steps: [{
        thought: '无条件触发创建会议技能',
        action: 'open_create_meeting_modal',
        actionInput: {
          formData: {
            title: params.title || '',
            startTime: params.startTime || '',
            endTime: params.endTime || '',
            location: params.location || '',
            roomType: params.roomType || '',  // 会议室类型字段
            attendees: params.attendees || [],
            remarks: ''
          },
          taskId: `MTG-${Date.now()}`
        }
      }],
      success: true
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