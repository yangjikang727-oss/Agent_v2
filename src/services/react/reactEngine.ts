/**
 * ReAct 引擎 - Skill 驱动版
 * 
 * 基于 Qoder Skill 渐进式披露机制：
 * 第一层：加载所有 SKILL.md 元数据，LLM 动态识别日程类型
 * 第二层：加载匹配 Skill 的指令，LLM 提取参数
 * 第三层：按 Skill 声明的 action 弹出预填充表单
 */

import type { LLMConfig } from '../core/llmCore'
import { callLLMRawChat } from '../core/llmCore'
import { toolRegistry, type ToolContext, type ToolResult } from './toolRegistry'
import { REACT_PROMPTS, parseReActResponse, formatObservation, type ReActStep } from './reactPrompts'
import type { BrainState } from '../../types'

// ==================== ReAct引擎配置 ====================

export interface ReActConfig {
  maxSteps: number        // 最大推理步数
  maxRetries: number      // 工具调用最大重试次数
  timeout: number         // 单次调用超时时间(ms)
  enableLogging: boolean  // 是否启用详细日志
  enableQuickMatch: boolean // 是否启用快速意图匹配
}

const DEFAULT_CONFIG: ReActConfig = {
  maxSteps: 3,           // 单轮识别模式，无需多轮推理
  maxRetries: 2,
  timeout: 20000,
  enableLogging: true,
  enableQuickMatch: true // 启用快速意图匹配（兜底）
}

// ==================== 快速意图匹配 ====================

interface QuickMatchResult {
  matched: boolean
  skillName?: string
  action?: string
  params?: Record<string, any>
}

/**
 * 快速意图匹配 - 无需 LLM 调用，直接匹配常见意图
 */
function tryQuickSkillMatch(query: string, currentDate: string): QuickMatchResult {
  const normalizedQuery = query.toLowerCase().trim()
  
  // 会议相关关键词
  const meetingPatterns = [
    { pattern: /预定|预约|安排|创建.*会议|开个会|约个会/, skill: 'book_meeting_room' },
    { pattern: /会议室|开会|会议|例会|讨论|沟通/, skill: 'book_meeting_room' }
  ]
  
  // 出差相关关键词
  const tripPatterns = [
    { pattern: /申请.*出差|安排.*出差|出差.*申请|要去.*出差/, skill: 'apply_business_trip' },
    { pattern: /出差|差旅|飞.*去|前往.*出差/, skill: 'apply_business_trip' }
  ]
  
  // 取消日程相关关键词（放在修改之前，"取消"优先匹配）
  const cancelPatterns = [
    /取消.*日程|删除.*日程|取消.*会议|取消.*出差|不去了|不开了/,
    /取消.*行程|删除.*行程|撤销.*日程/
  ]
  
  for (const pattern of cancelPatterns) {
    if (pattern.test(normalizedQuery)) {
      // 提取日期和类型线索
      const dateMatch = normalizedQuery.match(/今天|明天|后天|(\d{1,2})月(\d{1,2})日/)
      let scheduleType: string | undefined
      if (/会议|开会/.test(normalizedQuery)) scheduleType = 'meeting'
      else if (/出差|差旅|行程/.test(normalizedQuery)) scheduleType = 'trip'
      
      // 提取关键词（去掉取消/删除等动词后的内容）
      const kwText = normalizedQuery.replace(/取消|删除|撤销|日程|会议|出差|行程|今天|明天|后天|的/g, '').trim()
      
      return {
        matched: true,
        skillName: 'cancel_schedule',
        action: 'cancel_schedule',
        params: {
          date: dateMatch ? extractDate(normalizedQuery, currentDate) : undefined,
          type: scheduleType,
          keyword: kwText || undefined
        }
      }
    }
  }
  
  // 修改日程相关关键词
  const editPatterns = [
    { pattern: /修改.*日程|调整.*日程|编辑.*日程|更改.*日程|改.*日程/, skill: 'edit_schedule' },
    { pattern: /改一下.*时间|调整.*时间|日程.*修改|日程.*调整/, skill: 'edit_schedule' }
  ]
  
  // 尝试匹配会议
  for (const { pattern, skill } of meetingPatterns) {
    if (pattern.test(normalizedQuery)) {
      // 提取可能的时间信息
      const timeMatch = normalizedQuery.match(/(\d{1,2})[:点](\d{0,2})|([上下])午/)
      const dateMatch = normalizedQuery.match(/今天|明天|后天|(\d{1,2})月(\d{1,2})日/)
      
      return {
        matched: true,
        skillName: skill,
        action: 'open_create_meeting_modal',
        params: {
          title: extractTitle(normalizedQuery, 'meeting'),
          startTime: timeMatch ? extractTime(normalizedQuery) : undefined,
          date: dateMatch ? extractDate(normalizedQuery, currentDate) : currentDate
        }
      }
    }
  }
  
  // 尝试匹配出差
  for (const { pattern, skill } of tripPatterns) {
    if (pattern.test(normalizedQuery)) {
      // 提取出发地和目的地
      const fromToMatch = normalizedQuery.match(/从(.+?)[到去飞](.+?)[的出差]|(.+?)[到去飞](.+?)/)
      
      return {
        matched: true,
        skillName: skill,
        action: 'open_trip_application_modal',
        params: {
          from: fromToMatch ? (fromToMatch[1] || fromToMatch[3]) : undefined,
          to: fromToMatch ? (fromToMatch[2] || fromToMatch[4]) : undefined,
          startDate: currentDate
        }
      }
    }
  }
  
  // 尝试匹配修改日程（放在出差之后，避免"调整出差日程"误匹配）
  for (const { pattern } of editPatterns) {
    if (pattern.test(normalizedQuery)) {
      // 提取日期和类型线索
      const dateMatch = normalizedQuery.match(/今天|明天|后天|(\d{1,2})月(\d{1,2})日/)
      let scheduleType: string | undefined
      if (/会议|开会/.test(normalizedQuery)) scheduleType = 'meeting'
      else if (/出差|差旅|行程/.test(normalizedQuery)) scheduleType = 'trip'
      
      // 提取关键词（去掉修改/编辑等动词后的内容）
      const kwText = normalizedQuery.replace(/修改|调整|编辑|更改|改一下|日程|会议|出差|行程|时间|今天|明天|后天|的/g, '').trim()
      
      return {
        matched: true,
        skillName: 'edit_schedule',
        action: 'edit_schedule',
        params: {
          date: dateMatch ? extractDate(normalizedQuery, currentDate) : undefined,
          type: scheduleType,
          keyword: kwText || undefined
        }
      }
    }
  }
  
  return { matched: false }
}

/**
 * 从查询中提取标题
 */
function extractTitle(query: string, type: 'meeting' | 'trip'): string {
  // 尝试提取引号内的内容
  const quoteMatch = query.match(/[""'](.+?)[""']/)
  if (quoteMatch && quoteMatch[1]) return quoteMatch[1]
  
  // 会议：提取"关于...的会议"或"...讨论"
  if (type === 'meeting') {
    const aboutMatch = query.match(/关于(.+?)(?:的会议|讨论|沟通)/)
    if (aboutMatch && aboutMatch[1]) return aboutMatch[1]
    
    // 简单提取前 10 个字符作为标题
    return query.replace(/预定|预约|安排|创建|会议|开个会|约个会/g, '').trim().slice(0, 10) || '会议'
  }
  
  return ''
}

/**
 * 从查询中提取时间
 */
function extractTime(query: string): string | undefined {
  const hourMatch = query.match(/(\d{1,2})[:点](\d{0,2})/)
  if (hourMatch && hourMatch[1]) {
    const hour = parseInt(hourMatch[1])
    const minute = hourMatch[2] ? parseInt(hourMatch[2]) : 0
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  
  // 上午/下午
  if (query.includes('上午')) return '09:00'
  if (query.includes('下午')) return '14:00'
  if (query.includes('晚上')) return '19:00'
  
  return undefined
}

/**
 * 从查询中提取日期
 */
function extractDate(query: string, currentDate: string): string {
  if (query.includes('今天')) return currentDate
  if (query.includes('明天')) {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0] || currentDate
  }
  if (query.includes('后天')) {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + 2)
    return d.toISOString().split('T')[0] || currentDate
  }
  
  // 具体日期 MM月DD日
  const dateMatch = query.match(/(\d{1,2})月(\d{1,2})日/)
  if (dateMatch && dateMatch[1] && dateMatch[2]) {
    const year = new Date().getFullYear()
    return `${year}-${String(parseInt(dateMatch[1])).padStart(2, '0')}-${String(parseInt(dateMatch[2])).padStart(2, '0')}`
  }
  
  return currentDate
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
      // ==================== ReAct 推理循环（单轮识别+表单模式） ====================
      this.log('[ReAct] 开始推理循环（单轮识别模式）')
      
      const toolsSummary = toolRegistry.getToolsSummary()
      
      // 构建单轮对话 messages 数组
      const messages: Array<{role: string, content: string}> = [
        { role: 'system', content: REACT_PROMPTS.SYSTEM(toolsSummary, context.currentDate) },
        { role: 'user', content: `用户请求：${query}` }
      ]
      
      let toolNotFoundCount = 0  // 连续工具未找到计数器
      
      for (let step = 0; step < this.config.maxSteps; step++) {
        this.log(`[Step ${step + 1}] 发送 ${messages.length} 条消息到 LLM`)
        
        const response = await this.callLLMWithTimeout(messages)
        if (!response) {
          throw new Error('LLM调用超时或失败')
        }
        
        this.log(`[Step ${step + 1}] LLM响应: ${response.substring(0, 200)}...`)
        
        const parsedStep = parseReActResponse(response)
        steps.push(parsedStep)
        
        if (parsedStep.finalAnswer) {
          this.log('获得最终答案')
          return { finalAnswer: parsedStep.finalAnswer, steps, success: true }
        }
        
        if (parsedStep.action && parsedStep.action !== 'Final Answer') {
          this.log(`执行工具: ${parsedStep.action}`)
          
          // 提前检查工具是否存在
          if (!toolRegistry.hasTool(parsedStep.action)) {
            toolNotFoundCount++
            this.log(`⚠ 工具 "${parsedStep.action}" 不存在 (连续 ${toolNotFoundCount} 次)`)
            
            if (toolNotFoundCount >= 2) {
              this.log('连续多次调用不存在的工具，提前退出')
              return {
                finalAnswer: `抱歉，我无法找到合适的工具来处理您的请求。可用工具: ${toolsSummary.split('\n').map(l => l.split('[')[0]).join(', ')}`,
                steps,
                success: false,
                error: `连续 ${toolNotFoundCount} 次调用不存在的工具`
              }
            }
            
            // 第一次未找到，给 LLM 一次纠正机会
            const lastIndex = steps.length - 1
            if (lastIndex >= 0 && steps[lastIndex]) {
              steps[lastIndex].observation = `❌ 工具 "${parsedStep.action}" 不存在，请从可用工具列表中选择正确的工具名称。`
            }
            
            // 将 LLM 回复和错误信息追加到对话历史
            messages.push({ role: 'assistant', content: response })
            messages.push({ role: 'user', content: `Observation: ❌ 工具 "${parsedStep.action}" 不存在。请仔细检查可用工具列表，选择正确的工具名称。` })
            continue
          }
          
          // 工具存在，重置计数器
          toolNotFoundCount = 0
          
          const toolResult = await this.executeToolWithRetry(
            parsedStep.action,
            parsedStep.actionInput || {},
            toolContext
          )
          
          const observation = formatObservation(parsedStep.action, toolResult)
          this.log(`工具执行结果: ${observation.substring(0, 200)}`)
          
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
          
          // 将 LLM 回复和工具观测结果追加到对话历史
          messages.push({ role: 'assistant', content: response })
          messages.push({ role: 'user', content: `Observation: ${observation}` })
        } else {
          const finalAnswer = this.extractFinalAnswer(response)
          if (finalAnswer) {
            return { finalAnswer, steps, success: true }
          }
          
          // 无法解析，追加到对话并提示继续
          messages.push({ role: 'assistant', content: response })
          messages.push({ role: 'user', content: '请继续思考并给出最终答案（使用 Final Answer: 格式）' })
        }
      }
      
      // ==================== 兜底：关键字快速匹配 ====================
      // 当 ReAct 循环未能成功处理时，使用关键字匹配兜底
      if (this.config.enableQuickMatch) {
        this.log('[ReAct] ReAct循环未返回结果，尝试关键字兜底匹配')
        const quickMatch = tryQuickSkillMatch(query, context.currentDate)
        if (quickMatch.matched && quickMatch.action) {
          this.log(`[ReAct] 兜底匹配到技能: ${quickMatch.skillName}`)
          
          const quickStep: ReActStep = {
            thought: `ReAct循环未返回结果，兜底匹配到技能: ${quickMatch.skillName}`,
            action: quickMatch.action,
            actionInput: {
              formData: quickMatch.params,
              taskId: `${quickMatch.skillName?.toUpperCase()}-${Date.now()}`
            },
            observation: '已通过关键字兜底匹配'
          }
          steps.push(quickStep)
          
          return {
            finalAnswer: ' ',
            steps,
            success: true
          }
        }
      }
      
      return { finalAnswer: '超过最大推理步数', steps, success: false, error: '超过最大推理步数' }
      
    } catch (error) {
      this.log(`ReAct执行出错: ${error}`)
      
      // ==================== 异常兜底：关键字快速匹配 ====================
      if (this.config.enableQuickMatch) {
        this.log('[ReAct] ReAct执行异常，尝试关键字兜底匹配')
        const quickMatch = tryQuickSkillMatch(query, context.currentDate)
        if (quickMatch.matched && quickMatch.action) {
          this.log(`[ReAct] 异常兜底匹配到技能: ${quickMatch.skillName}`)
          
          const quickStep: ReActStep = {
            thought: `ReAct执行异常，兜底匹配到技能: ${quickMatch.skillName}`,
            action: quickMatch.action,
            actionInput: {
              formData: quickMatch.params,
              taskId: `${quickMatch.skillName?.toUpperCase()}-${Date.now()}`
            },
            observation: 'ReAct异常，已通过关键字兜底匹配'
          }
          steps.push(quickStep)
          
          return {
            finalAnswer: ' ',
            steps,
            success: true
          }
        }
      }
      
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
          // 只对远程 API 调用添加延迟，本地工具立即重试
          const isRemoteTool = toolName.includes('api') || toolName.includes('http') || toolName.includes('remote')
          if (isRemoteTool) {
            await new Promise(resolve => setTimeout(resolve, 500)) // 固定 500ms，而非指数退避
          }
          // 本地工具无延迟，直接重试
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
   * 尝试从响应中提取最终答案
   */
  private extractFinalAnswer(response: string): string | null {
    // 尝试从响应中提取最终答案（支持多行）
    const finalAnswerMatch = response.match(/Final Answer:\s*([\s\S]+)$/i)
    if (finalAnswerMatch && finalAnswerMatch[1]) {
      return finalAnswerMatch[1].trim()
    }
      
    // 兜底：如果响应不包含 Action（不是工具调用），视为直接回答
    if (response.length > 10 && !response.includes('Action:')) {
      // 如果有 Thought 行，提取之后的内容
      const afterThought = response.replace(/^.*?(?:Thought|思考|分析)[:：][^\n]*/im, '').trim()
      return afterThought || response.trim()
    }
      
    return null
  }

  private log(message: string) {
    if (this.config.enableLogging) {
      console.log(`[ReActEngine] ${message}`)
    }
  }

  /**
   * 带超时的LLM调用（支持 AbortController）
   */
  private async callLLMWithTimeout(messages: Array<{role: string, content: string}>): Promise<string | null> {
    this.log(`开始LLM调用，消息数: ${messages.length}`)
    this.log(`LLM配置: provider=${this.llmConfig.provider}, model=${this.llmConfig.model}`)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)
    
    try {
      const result = await callLLMRawChat(messages, this.llmConfig, controller.signal)
      clearTimeout(timeoutId)
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      if ((error as Error).name === 'AbortError') {
        throw new Error(`LLM调用超时 (${this.config.timeout}ms)`)
      }
      throw error
    }
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
