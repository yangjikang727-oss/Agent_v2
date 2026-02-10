/**
 * 智能参数收集器 - 增强大模型驱动版本
 * 结合LLM智能提取和状态跟踪，避免重复询问
 */

import { LLMParamExtractor } from './llmParamExtractor'
import type { LLMConfig } from '../core/llmCore'
import { extractDate, extractTime, extractTransport, extractAttendees } from '../../utils/nlpUtils'

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
   * 收集出差参数（大模型驱动版本）
   */
  static async collectTripParams(
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
    
    console.log(`[SmartParamCollector] 处理出差会话 ${sessionId}, 历史长度: ${state.history.length}`)
    
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
    
    // 4. 规则兜底：结合正则/NLP 工具进一步补充参数
    const fullText = state.history.join('\n')

    // 4.1 日期兜底
    if (!state.params.startDate) {
      const d = extractDate(fullText)
      if (d) {
        state.params.startDate = d
      } else {
        state.params.startDate = new Date().toISOString().split('T')[0]
      }
    }
    if (!state.params.endDate) {
      const nextDay = new Date(state.params.startDate || new Date().toISOString().split('T')[0])
      nextDay.setDate(nextDay.getDate() + 1)
      state.params.endDate = nextDay.toISOString().split('T')[0]
    }

    // 4.2 时间兜底
    if (!state.params.startTime) {
      const t = extractTime(fullText)
      if (t) {
        state.params.startTime = t
      }
    }
    if (state.params.startTime && !state.params.endTime) {
      // 默认出差8小时
      const startTimeStr = String(state.params.startTime)
      const timeParts = startTimeStr.split(':')
      if (timeParts.length === 2) {
        const hours = parseInt(timeParts[0] || '0')
        const minutes = parseInt(timeParts[1] || '0')
        const totalMinutes = hours * 60 + minutes + (8 * 60)
        const endHours = Math.floor(totalMinutes / 60) % 24
        const endMinutes = totalMinutes % 60
        state.params.endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`
      }
    }

    // 4.3 出行方式兜底
    if (!state.params.transport) {
      const transport = extractTransport(fullText)
      if (transport) {
        state.params.transport = transport
      }
    }

    // 4.4 理由兜底：使用最近的一句用户输入
    if (!state.params.reason || String(state.params.reason).trim() === '') {
      state.params.reason = query.trim()
    }

    // 4.5 出发地/目的地粗略提取（从X到Y / 去Y出差）
    if (!state.params.from || !state.params.to) {
      const routeMatch = fullText.match(/从([^到去\s,，。]+)[到至去]([^出差工作出行开会\s,，。]+)/)
      if (routeMatch) {
        const from = routeMatch[1]?.trim()
        const to = routeMatch[2]?.trim()
        if (from && !state.params.from) state.params.from = from
        if (to && !state.params.to) state.params.to = to
      } else {
        // 只有目的地：去上海出差
        const toMatch = fullText.match(/去([^出差工作出行开会\s,，。]+)(出差|工作|出行)?/)
        if (toMatch) {
          const to = toMatch[1]?.trim()
          if (to && !state.params.to) state.params.to = to
        }
      }
    }
    
    // 5. 确定缺失的参数
    const requiredParams = ['from', 'to', 'startDate', 'startTime', 'endDate', 'endTime', 'transport', 'reason']
    const missing: string[] = []
    
    for (const param of requiredParams) {
      if (!state.params[param] || 
          (Array.isArray(state.params[param]) && state.params[param].length === 0) ||
          (typeof state.params[param] === 'string' && state.params[param].trim() === '')) {
        missing.push(param)
      }
    }
    
    const canExecute = missing.length === 0
    
    // 6. 生成下一个问题（避免重复询问）
    let nextQuestion: string | undefined
    if (!canExecute && missing.length > 0) {
      // 按优先级排序的问题顺序
      const questionOrder = ['from', 'to', 'startDate', 'startTime', 'endDate', 'endTime', 'transport', 'reason']
      
      // 找到第一个未问过且确实缺失的问题
      for (const param of questionOrder) {
        if (missing.includes(param) && !state.askedQuestions.has(param)) {
          state.askedQuestions.add(param)
          state.currentQuestion = param
          nextQuestion = this.getTripQuestionText(param)
          break
        }
      }
      
      // 如果所有问题都问过了，给出总结
      if (!nextQuestion) {
        const missingText = missing.map(p => this.getTripParamDisplayName(p)).join('、')
        nextQuestion = `还需要确认以下信息：${missingText}。请提供具体信息。`
      }
    } else if (canExecute) {
      // 所有参数都已收集，准备确认
      nextQuestion = '所有信息已收集完毕，是否确认提交出差申请？'
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
    
    // 4. 规则兜底：结合正则/NLP 工具进一步补充参数
    const fullText = state.history.join('\n')

    // 4.1 日期兜底
    if (!state.params.date) {
      const d = extractDate(fullText)
      if (d) {
        state.params.date = d
      } else {
        state.params.date = new Date().toISOString().split('T')[0]
      }
    }

    // 4.2 时间兜底
    if (!state.params.startTime) {
      const t = extractTime(fullText)
      if (t) {
        state.params.startTime = t
      }
    }

    // 4.3 时长兜底
    if (!state.params.duration) {
      const durationMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(?:小时|个小时|h|hour)/i)
      if (durationMatch) {
        state.params.duration = parseFloat(durationMatch[1] || '1')
      }
    }

    // 4.4 标题兜底
    if (!state.params.title) {
      const titleMatch = fullText.match(/(?:部门|项目|团队|周|月|日|每日|每周|季度|年度)?(?:例会|会议|讨论会?|复盘|沟通会?|碰头会?|站会|晨会|评审|汇报|分享会?|培训)/)
      if (titleMatch) {
        state.params.title = titleMatch[0]
      }
    }

    // 5. 计算结束时间
    if (state.params.startTime && state.params.duration && !state.params.endTime) {
      const startTimeStr = String(state.params.startTime)
      const timeParts = startTimeStr.split(':')
      if (timeParts.length === 2) {
        const hours = parseInt(timeParts[0] || '0')
        const minutes = parseInt(timeParts[1] || '0')
        const totalMinutes = hours * 60 + minutes + Math.round(state.params.duration * 60)
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
   * 获取出差问题文本
   */
  private static getTripQuestionText(param: string): string {
    const questions: Record<string, string> = {
      'from': '请问从哪里出发？',
      'to': '请问出差去哪里？',
      'startDate': '请问出差开始日期是？',
      'startTime': '请问出发时间是几点？',
      'endDate': '请问返程日期是？',
      'endTime': '请问预计返程时间是几点？',
      'transport': '请问选择什么交通方式？',
      'reason': '请简单说明出差事由：'
    }
    return questions[param] || `请提供${this.getTripParamDisplayName(param)}信息：`
  }
  
  /**
   * 获取出差参数显示名称
   */
  private static getTripParamDisplayName(param: string): string {
    const names: Record<string, string> = {
      'from': '出发地',
      'to': '目的地',
      'startDate': '开始日期',
      'startTime': '出发时间',
      'endDate': '结束日期',
      'endTime': '返程时间',
      'transport': '交通方式',
      'reason': '出差说明'
    }
    return names[param] || param
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