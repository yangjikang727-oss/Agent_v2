/**
 * 上下文管理器 - 核心实现
 * 
 * 统一管理 Agent 的上下文信息
 */

import type {
  SessionContext,
  SessionPhase,
  StateTransitionEvent,
  ConversationMessage,
  MessageSemantics,
  ActiveTask,
  TaskStatus,
  ContextSnapshot,
  ContextManagerConfig
} from './contextTypes'

import { DEFAULT_CONTEXT_CONFIG } from './contextTypes'

// ==================== 会话状态机 ====================

/** 状态转换规则 */
const STATE_TRANSITIONS: Record<SessionPhase, Partial<Record<StateTransitionEvent, SessionPhase>>> = {
  idle: {
    user_input: 'understanding'
  },
  understanding: {
    intent_recognized: 'collecting',
    user_input: 'understanding'
  },
  collecting: {
    params_complete: 'confirming',
    user_input: 'collecting',
    user_cancelled: 'idle',
    timeout: 'idle'
  },
  confirming: {
    user_confirmed: 'executing',
    user_cancelled: 'idle',
    user_input: 'collecting'
  },
  executing: {
    execution_completed: 'feedback',
    execution_failed: 'feedback'
  },
  feedback: {
    user_input: 'understanding',
    timeout: 'idle'
  }
}

// ==================== 上下文管理器 ====================

export class ContextManager {
  private sessions: Map<string, SessionContext> = new Map()
  private config: ContextManagerConfig
  
  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config }
    this.log('ContextManager 初始化完成')
  }
  
  // ==================== 会话管理 ====================
  
  /**
   * 获取或创建会话
   */
  getOrCreateSession(sessionId: string, userId: string): SessionContext {
    let session = this.sessions.get(sessionId)
    
    if (!session) {
      session = this.createSession(sessionId, userId)
      this.sessions.set(sessionId, session)
      this.log(`创建新会话: ${sessionId}`)
    }
    
    return session
  }
  
  /**
   * 创建新会话
   */
  private createSession(sessionId: string, userId: string): SessionContext {
    const now = new Date().toISOString()
    
    return {
      state: {
        sessionId,
        userId,
        phase: 'idle',
        phaseStartedAt: now,
        turnCount: 0,
        lastInteractionAt: now
      },
      history: [],
      task: {
        activeTask: null,
        pendingTasks: [],
        recentCompleted: []
      },
      compressionConfig: this.config.compression
    }
  }
  
  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId)
  }
  
  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(): number {
    const now = Date.now()
    let cleaned = 0
    
    for (const [sessionId, session] of this.sessions) {
      const lastInteraction = new Date(session.state.lastInteractionAt).getTime()
      if (now - lastInteraction > this.config.sessionTimeout) {
        this.sessions.delete(sessionId)
        cleaned++
        this.log(`清理过期会话: ${sessionId}`)
      }
    }
    
    return cleaned
  }
  
  // ==================== 状态转换 ====================
  
  /**
   * 触发状态转换
   */
  transition(sessionId: string, event: StateTransitionEvent): SessionPhase | null {
    const session = this.sessions.get(sessionId)
    if (!session) {
      this.log(`会话不存在: ${sessionId}`)
      return null
    }
    
    const currentPhase = session.state.phase
    const nextPhase = STATE_TRANSITIONS[currentPhase]?.[event]
    
    if (nextPhase) {
      session.state.phase = nextPhase
      session.state.phaseStartedAt = new Date().toISOString()
      this.log(`状态转换: ${currentPhase} -> ${nextPhase} (事件: ${event})`)
      return nextPhase
    }
    
    this.log(`无效转换: ${currentPhase} + ${event}`)
    return null
  }
  
  /**
   * 获取当前阶段
   */
  getCurrentPhase(sessionId: string): SessionPhase | null {
    return this.sessions.get(sessionId)?.state.phase || null
  }
  
  // ==================== 对话历史管理 ====================
  
  /**
   * 添加消息
   */
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    semantics?: MessageSemantics
  ): ConversationMessage {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`)
    }
    
    const message: ConversationMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
      semantics
    }
    
    session.history.push(message)
    session.state.lastInteractionAt = message.timestamp
    
    if (role === 'user') {
      session.state.turnCount++
    }
    
    // 检查是否需要压缩
    this.maybeCompressHistory(sessionId)
    
    this.log(`添加消息 [${role}]: ${content.substring(0, 50)}...`)
    
    return message
  }
  
  /**
   * 获取对话历史
   */
  getHistory(sessionId: string): ConversationMessage[] {
    return this.sessions.get(sessionId)?.history || []
  }
  
  /**
   * 获取格式化的对话历史（用于 LLM）
   */
  getFormattedHistory(sessionId: string): string {
    const history = this.getHistory(sessionId)
    if (history.length === 0) return ''
    
    return history.map(msg => {
      const role = msg.role === 'user' ? '用户' : (msg.role === 'assistant' ? '助手' : '系统')
      return `${role}: ${msg.content}`
    }).join('\n')
  }
  
  /**
   * 更新消息语义标注
   */
  updateMessageSemantics(
    sessionId: string,
    messageId: string,
    semantics: MessageSemantics
  ): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    
    const message = session.history.find(m => m.id === messageId)
    if (message) {
      message.semantics = { ...message.semantics, ...semantics }
      return true
    }
    
    return false
  }
  
  // ==================== 任务上下文管理 ====================
  
  /**
   * 开始新任务
   */
  startTask(
    sessionId: string,
    skillName: string,
    initialParams: Record<string, any> = {},
    requiredParams: string[] = []
  ): ActiveTask {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`)
    }
    
    // 如果有活跃任务，移到等待队列
    if (session.task.activeTask) {
      session.task.pendingTasks.push(session.task.activeTask)
    }
    
    const now = new Date().toISOString()
    const task: ActiveTask = {
      id: `task_${Date.now()}`,
      skillName,
      status: 'collecting',
      collectedParams: initialParams,
      pendingParams: requiredParams.filter(p => !(p in initialParams)),
      startedAt: now,
      updatedAt: now
    }
    
    session.task.activeTask = task
    this.log(`开始任务: ${skillName}`)
    
    return task
  }
  
  /**
   * 更新任务参数
   */
  updateTaskParams(
    sessionId: string,
    params: Record<string, any>
  ): ActiveTask | null {
    const session = this.sessions.get(sessionId)
    const task = session?.task.activeTask
    
    if (!task) return null
    
    // 合并参数
    task.collectedParams = { ...task.collectedParams, ...params }
    
    // 更新待收集列表
    task.pendingParams = task.pendingParams.filter(p => !(p in params))
    
    task.updatedAt = new Date().toISOString()
    
    this.log(`更新任务参数: ${JSON.stringify(params)}`)
    this.log(`待收集: ${task.pendingParams.join(', ') || '无'}`)
    
    return task
  }
  
  /**
   * 设置当前询问
   */
  setCurrentQuestion(sessionId: string, question: string, field?: string): void {
    const task = this.sessions.get(sessionId)?.task.activeTask
    if (task) {
      task.currentQuestion = question
      if (field) {
        this.log(`询问字段 [${field}]: ${question}`)
      }
    }
  }
  
  /**
   * 更新任务状态
   */
  updateTaskStatus(sessionId: string, status: TaskStatus): void {
    const task = this.sessions.get(sessionId)?.task.activeTask
    if (task) {
      task.status = status
      task.updatedAt = new Date().toISOString()
      this.log(`任务状态更新: ${status}`)
    }
  }
  
  /**
   * 完成任务
   */
  completeTask(sessionId: string, success: boolean = true): void {
    const session = this.sessions.get(sessionId)
    const task = session?.task.activeTask
    
    if (!session || !task) return
    
    task.status = success ? 'completed' : 'failed'
    
    // 添加到最近完成
    session.task.recentCompleted.push({
      skillName: task.skillName,
      params: task.collectedParams,
      completedAt: new Date().toISOString()
    })
    
    // 只保留最近5个
    if (session.task.recentCompleted.length > 5) {
      session.task.recentCompleted.shift()
    }
    
    // 清除活跃任务
    session.task.activeTask = null
    
    // 检查等待队列
    if (session.task.pendingTasks.length > 0) {
      session.task.activeTask = session.task.pendingTasks.shift()!
    }
    
    this.log(`任务完成: ${task.skillName} (${success ? '成功' : '失败'})`)
  }
  
  /**
   * 获取当前任务
   */
  getActiveTask(sessionId: string): ActiveTask | null {
    return this.sessions.get(sessionId)?.task.activeTask || null
  }
  
  /**
   * 检查参数是否完整
   */
  isParamsComplete(sessionId: string): boolean {
    const task = this.getActiveTask(sessionId)
    return task ? task.pendingParams.length === 0 : false
  }
  
  /**
   * 获取下一个待收集字段
   */
  getNextPendingParam(sessionId: string): string | null {
    const task = this.getActiveTask(sessionId)
    return task?.pendingParams[0] || null
  }
  
  // ==================== 上下文压缩 ====================
  
  /**
   * 检查并压缩历史
   */
  private maybeCompressHistory(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    
    const { history, compressionConfig } = session
    
    if (history.length > compressionConfig.maxMessages) {
      this.compressHistory(sessionId)
    }
  }
  
  /**
   * 压缩历史
   */
  compressHistory(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    
    const { history, compressionConfig } = session
    const { strategy, maxMessages, preserveSystemMessages } = compressionConfig
    
    this.log(`压缩历史 (策略: ${strategy}, 当前: ${history.length}条)`)
    
    switch (strategy) {
      case 'sliding_window':
        this.applySlidingWindow(session, maxMessages, preserveSystemMessages)
        break
      case 'entity_focus':
        this.applyEntityFocus(session, maxMessages)
        break
      case 'hybrid':
      default:
        this.applyHybridCompression(session, maxMessages, preserveSystemMessages)
    }
    
    this.log(`压缩后: ${session.history.length}条`)
  }
  
  /**
   * 滑动窗口压缩
   */
  private applySlidingWindow(
    session: SessionContext,
    maxMessages: number,
    preserveSystemMessages: boolean
  ): void {
    const { history } = session
    
    if (preserveSystemMessages) {
      const systemMessages = history.filter(m => m.role === 'system')
      const nonSystemMessages = history.filter(m => m.role !== 'system')
      const keepCount = Math.max(0, maxMessages - systemMessages.length)
      session.history = [...systemMessages, ...nonSystemMessages.slice(-keepCount)]
    } else {
      session.history = history.slice(-maxMessages)
    }
  }
  
  /**
   * 实体聚焦压缩
   */
  private applyEntityFocus(session: SessionContext, maxMessages: number): void {
    const { history } = session
    
    // 保留有语义标注的消息和最近的消息
    const importantMessages = history.filter(m => m.semantics && Object.keys(m.semantics).length > 0)
    const recentMessages = history.slice(-Math.floor(maxMessages / 2))
    
    // 合并去重
    const messageIds = new Set(recentMessages.map(m => m.id))
    const combined = [
      ...importantMessages.filter(m => !messageIds.has(m.id)),
      ...recentMessages
    ]
    
    // 按时间排序
    session.history = combined.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    ).slice(-maxMessages)
  }
  
  /**
   * 混合压缩策略
   */
  private applyHybridCompression(
    session: SessionContext,
    maxMessages: number,
    preserveSystemMessages: boolean
  ): void {
    const { history } = session
    
    // 1. 保留系统消息
    const systemMessages = preserveSystemMessages 
      ? history.filter(m => m.role === 'system')
      : []
    
    // 2. 保留有语义标注的重要消息
    const importantMessages = history.filter(m => 
      m.role !== 'system' && 
      m.semantics && 
      (m.semantics.intent || m.semantics.slots)
    )
    
    // 3. 保留最近的消息
    const remainingSlots = maxMessages - systemMessages.length - importantMessages.length
    const recentCount = Math.max(4, remainingSlots) // 至少保留最近4条
    const recentMessages = history
      .filter(m => m.role !== 'system' && !importantMessages.includes(m))
      .slice(-recentCount)
    
    // 合并
    const allMessages = [...systemMessages, ...importantMessages, ...recentMessages]
    
    // 按时间排序并去重
    const seen = new Set<string>()
    session.history = allMessages
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .filter(m => {
        if (seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
      .slice(-maxMessages)
  }
  
  // ==================== 上下文快照 ====================
  
  /**
   * 生成上下文快照（用于 LLM 调用）
   */
  getContextSnapshot(sessionId: string): ContextSnapshot | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    
    // 估算 Token（简单估算：每4个字符约1个 Token）
    const historyText = this.getFormattedHistory(sessionId)
    const estimatedTokens = Math.ceil(historyText.length / 4)
    
    return {
      compressedHistory: session.history,
      summary: session.summary,
      taskContext: session.task,
      sessionState: session.state,
      estimatedTokens,
      generatedAt: new Date().toISOString()
    }
  }
  
  /**
   * 获取 LLM 调用所需的上下文
   */
  getLLMContext(sessionId: string): {
    history: string
    activeTask: ActiveTask | null
    phase: SessionPhase
  } {
    const session = this.sessions.get(sessionId)
    
    return {
      history: session ? this.getFormattedHistory(sessionId) : '',
      activeTask: session?.task.activeTask || null,
      phase: session?.state.phase || 'idle'
    }
  }
  
  // ==================== 工具方法 ====================
  
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[ContextManager] ${message}`)
    }
  }
}

// ==================== 全局实例 ====================

export const contextManager = new ContextManager()
