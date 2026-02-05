/**
 * 智能参数收集器 - 增强大模型驱动版本
 * 结合LLM智能提取和状态跟踪，避免重复询问
 */

import { LLMParamExtractor } from './llmParamExtractor'
import type { LLMConfig } from '../core/llmCore'

interface CollectionState {
  params: Record<string, any>
  askedQuestions: Set<string>
  currentQuestion?: string
  history: string[]
}

interface CollectionResult {
  params: Record<string, any>
  missing: string[]
  canExecute: boolean
  nextQuestion?: string
  extractionInfo?: {
    confidence: number
    reasoning: string
  }
}

export class SmartParamCollector {
  private static states: Map<string, CollectionState> = new Map()
  
  /**
   * 收集会议参数（大模型驱动版本）
   */
  static async collectMeetingParams(
    sessionId: string,
    query: string,
    llmConfig: LLMConfig
  ): Promise<CollectionResult> {
    // 获取或创建会话状态
    let state = this.states.get(sessionId)
    if (!state) {
      state = {
        params: {},
        askedQuestions: new Set(),
        history: []
      }
      this.states.set(sessionId, state)
    }
    
    // 将当前查询添加到历史
    state.history.push(query)
    
    console.log(`[SmartParamCollector] 处理会话 ${sessionId}, 历史长度: ${state.history.length}`)
    
    // 1. 使用大模型提取参数
    const extractionResult = await LLMParamExtractor.hybridExtract(
      query,
      llmConfig,
      state.params  // 传入已有参数作为fallback
    )
    
    console.log(`[SmartParamCollector] LLM提取结果:`, extractionResult)
    
    // 2. 合并提取的参数到状态中
    Object.assign(state.params, extractionResult.params)
    
    // 3. 特殊处理：从完整对话历史中提取信息
    if (state.history.length > 1) {
      const fullHistory = state.history.join('\n')
      const historyExtraction = await LLMParamExtractor.hybridExtract(
        fullHistory,
        llmConfig,
        state.params
      )
      
      // 用历史提取结果补充当前参数
      Object.assign(state.params, historyExtraction.params)
      console.log(`[SmartParamCollector] 历史提取补充:`, historyExtraction.params)
    }
    
    // 4. 确保基本参数（兜底处理）
    if (!state.params.date) {
      state.params.date = new Date().toISOString().split('T')[0]
    }
    
    // 5. 计算结束时间
    if (state.params.startTime && state.params.duration && !state.params.endTime) {
      const timeParts = state.params.startTime.split(':')
      if (timeParts.length === 2) {
        const hours = parseInt(timeParts[0])
        const minutes = parseInt(timeParts[1])
        const totalMinutes = hours * 60 + minutes + (state.params.duration * 60)
        const endHours = Math.floor(totalMinutes / 60) % 24
        const endMinutes = totalMinutes % 60
        state.params.endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`
      }
    }
    
    // 6. 确定缺失的参数
    const requiredParams = ['title', 'startTime', 'location', 'attendees']
    const missing: string[] = []
    
    for (const param of requiredParams) {
      if (!state.params[param] || 
          (Array.isArray(state.params[param]) && state.params[param].length === 0)) {
        missing.push(param)
      }
    }
    
    const canExecute = missing.length === 0
    
    // 7. 生成下一个问题（避免重复询问）
    let nextQuestion: string | undefined
    if (!canExecute && missing.length > 0) {
      // 按优先级排序的问题顺序
      const questionOrder = ['title', 'startTime', 'duration', 'location', 'attendees']
      
      // 找到第一个未问过且确实缺失的问题
      for (const param of questionOrder) {
        if (missing.includes(param) && !state.askedQuestions.has(param)) {
          state.askedQuestions.add(param)
          state.currentQuestion = param
          nextQuestion = this.getQuestionText(param)
          break
        }
      }
      
      // 如果所有问题都问过了，给出总结
      if (!nextQuestion) {
        const missingText = missing.map(p => this.getParamDisplayName(p)).join('、')
        nextQuestion = `还需要确认以下信息：${missingText}。请提供具体信息。`
      }
    } else if (canExecute) {
      // 所有参数都已收集，准备确认
      nextQuestion = '所有信息已收集完毕，是否确认创建会议？'
    }
    
    return { 
      params: state.params, 
      missing, 
      canExecute,
      nextQuestion,
      extractionInfo: {
        confidence: extractionResult.confidence,
        reasoning: extractionResult.reasoning
      }
    }
  }
  
  /**
   * 重置会话状态
   */
  static resetSession(sessionId: string) {
    this.states.delete(sessionId)
    console.log(`[SmartParamCollector] 重置会话: ${sessionId}`)
  }
  
  /**
   * 获取问题文本
   */
  private static getQuestionText(param: string): string {
    const questions: Record<string, string> = {
      'title': '请问这次会议的主要议题是什么？',
      'startTime': '请问会议几点开始？',
      'duration': '请问会议预计持续多长时间？',
      'location': '请问会议地点在哪里？',
      'attendees': '请问参会人员有哪些？'
    }
    return questions[param] || `请提供${this.getParamDisplayName(param)}信息：`
  }
  
  /**
   * 获取参数显示名称
   */
  private static getParamDisplayName(param: string): string {
    const names: Record<string, string> = {
      'title': '会议主题',
      'startTime': '开始时间',
      'duration': '会议时长',
      'location': '会议地点',
      'attendees': '参会人员'
    }
    return names[param] || param
  }
}