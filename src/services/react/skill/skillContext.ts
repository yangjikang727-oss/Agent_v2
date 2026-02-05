/**
 * Skill Context Manager - 上下文与状态管理
 * 
 * 用于保存 Skill 执行过程中的中间状态
 * 支持多轮对话与延迟执行
 */

import type {
  SkillContext,
  ActiveSkillState,
  PendingSkill,
  ExecutionHistoryEntry,
  SlotState,
  SkillExecutionResult,
  SkillSpec
} from './skillTypes'

// ==================== 默认配置 ====================

const DEFAULT_CONFIG = {
  /** 历史记录最大保留数 */
  maxHistorySize: 50,
  /** Pending Skill 默认超时时间（毫秒） */
  defaultPendingTimeout: 5 * 60 * 1000, // 5分钟
  /** 会话过期时间（毫秒） */
  sessionExpireTime: 30 * 60 * 1000, // 30分钟
  /** 是否启用持久化 */
  enablePersistence: false
}

// ==================== Context Manager 类 ====================

export class SkillContextManager {
  private contexts: Map<string, SkillContext> = new Map()
  private config = { ...DEFAULT_CONFIG }
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  
  constructor(config?: Partial<typeof DEFAULT_CONFIG>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
    
    // 启动定期清理
    this.startCleanup()
  }
  
  // ==================== 上下文管理 ====================
  
  /**
   * 获取或创建会话上下文
   */
  getOrCreateContext(sessionId: string, userId: string): SkillContext {
    let context = this.contexts.get(sessionId)
    
    if (!context) {
      context = this.createContext(sessionId, userId)
      this.contexts.set(sessionId, context)
      console.log(`[SkillContext] 创建新会话: ${sessionId}`)
    }
    
    // 更新最后访问时间
    context.lastUpdatedAt = new Date().toISOString()
    
    return context
  }
  
  /**
   * 创建新的上下文
   */
  private createContext(sessionId: string, userId: string): SkillContext {
    return {
      sessionId,
      userId,
      currentDate: new Date().toISOString().split('T')[0] || new Date().toISOString().slice(0, 10),
      activeSkill: null,
      pendingSkills: [],
      history: [],
      variables: {},
      lastUpdatedAt: new Date().toISOString()
    }
  }
  
  /**
   * 获取上下文
   */
  getContext(sessionId: string): SkillContext | undefined {
    return this.contexts.get(sessionId)
  }
  
  /**
   * 删除上下文
   */
  deleteContext(sessionId: string): boolean {
    return this.contexts.delete(sessionId)
  }
  
  /**
   * 更新上下文变量
   */
  setVariable(sessionId: string, key: string, value: any): void {
    const context = this.contexts.get(sessionId)
    if (context) {
      context.variables[key] = value
      context.lastUpdatedAt = new Date().toISOString()
    }
  }
  
  /**
   * 获取上下文变量
   */
  getVariable(sessionId: string, key: string): any {
    return this.contexts.get(sessionId)?.variables[key]
  }
  
  // ==================== 活跃技能管理 ====================
  
  /**
   * 设置活跃技能
   */
  setActiveSkill(
    sessionId: string, 
    skillName: string, 
    spec: SkillSpec
  ): ActiveSkillState {
    const context = this.contexts.get(sessionId)
    if (!context) {
      throw new Error(`会话 ${sessionId} 不存在`)
    }
    
    const now = new Date().toISOString()
    
    // 创建槽位状态
    const slots: SlotState[] = spec.input_schema.map(field => ({
      field: field.name,
      value: field.default,
      filled: field.default !== undefined,
      source: field.default !== undefined ? 'default' : 'user_input',
      confidence: field.default !== undefined ? 1.0 : 0
    }))
    
    const activeSkill: ActiveSkillState = {
      skillName,
      status: 'selecting',
      slots,
      startedAt: now,
      updatedAt: now,
      retryCount: 0
    }
    
    context.activeSkill = activeSkill
    context.lastUpdatedAt = now
    
    console.log(`[SkillContext] 设置活跃技能: ${skillName}`)
    
    return activeSkill
  }
  
  /**
   * 更新活跃技能状态
   */
  updateActiveSkillStatus(
    sessionId: string, 
    status: ActiveSkillState['status']
  ): void {
    const context = this.contexts.get(sessionId)
    if (context?.activeSkill) {
      context.activeSkill.status = status
      context.activeSkill.updatedAt = new Date().toISOString()
      context.lastUpdatedAt = context.activeSkill.updatedAt
    }
  }
  
  /**
   * 填充槽位
   */
  fillSlot(
    sessionId: string, 
    field: string, 
    value: any, 
    source: SlotState['source'] = 'user_input',
    confidence: number = 1.0
  ): boolean {
    const context = this.contexts.get(sessionId)
    if (!context?.activeSkill) {
      return false
    }
    
    const slot = context.activeSkill.slots.find(s => s.field === field)
    if (slot) {
      slot.value = value
      slot.filled = true
      slot.source = source
      slot.confidence = confidence
      slot.filledAt = new Date().toISOString()
      
      context.activeSkill.updatedAt = slot.filledAt
      context.lastUpdatedAt = slot.filledAt
      
      console.log(`[SkillContext] 槽位填充: ${field} = ${value}`)
      return true
    }
    
    return false
  }
  
  /**
   * 批量填充槽位
   */
  fillSlots(
    sessionId: string, 
    params: Record<string, any>,
    source: SlotState['source'] = 'user_input'
  ): string[] {
    const filledFields: string[] = []
    
    Object.entries(params).forEach(([field, value]) => {
      if (this.fillSlot(sessionId, field, value, source)) {
        filledFields.push(field)
      }
    })
    
    return filledFields
  }
  
  /**
   * 获取未填充的槽位
   */
  getUnfilledSlots(sessionId: string): SlotState[] {
    const context = this.contexts.get(sessionId)
    if (!context?.activeSkill) {
      return []
    }
    
    return context.activeSkill.slots.filter(slot => !slot.filled)
  }
  
  /**
   * 获取已填充的槽位值
   */
  getFilledParams(sessionId: string): Record<string, any> {
    const context = this.contexts.get(sessionId)
    if (!context?.activeSkill) {
      return {}
    }
    
    return context.activeSkill.slots
      .filter(slot => slot.filled)
      .reduce((acc, slot) => {
        acc[slot.field] = slot.value
        return acc
      }, {} as Record<string, any>)
  }
  
  /**
   * 检查必填槽位是否都已填充
   */
  checkRequiredSlots(sessionId: string, requiredFields: string[]): {
    complete: boolean
    missingFields: string[]
  } {
    const context = this.contexts.get(sessionId)
    if (!context?.activeSkill) {
      return { complete: false, missingFields: requiredFields }
    }
    
    const filledFields = new Set(
      context.activeSkill.slots
        .filter(slot => slot.filled)
        .map(slot => slot.field)
    )
    
    const missingFields = requiredFields.filter(field => !filledFields.has(field))
    
    return {
      complete: missingFields.length === 0,
      missingFields
    }
  }
  
  /**
   * 清除活跃技能
   */
  clearActiveSkill(sessionId: string): void {
    const context = this.contexts.get(sessionId)
    if (context) {
      context.activeSkill = null
      context.lastUpdatedAt = new Date().toISOString()
    }
  }
  
  // ==================== Pending 技能管理 ====================
  
  /**
   * 添加 Pending 技能
   */
  addPendingSkill(
    sessionId: string,
    skillName: string,
    partialParams: Record<string, any>,
    waitingFor: string,
    timeout?: number
  ): PendingSkill {
    const context = this.contexts.get(sessionId)
    if (!context) {
      throw new Error(`会话 ${sessionId} 不存在`)
    }
    
    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + (timeout || this.config.defaultPendingTimeout)
    )
    
    const pendingSkill: PendingSkill = {
      skillName,
      partialParams,
      waitingFor,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    }
    
    context.pendingSkills.push(pendingSkill)
    context.lastUpdatedAt = now.toISOString()
    
    console.log(`[SkillContext] 添加 Pending 技能: ${skillName}, 等待: ${waitingFor}`)
    
    return pendingSkill
  }
  
  /**
   * 获取 Pending 技能
   */
  getPendingSkills(sessionId: string): PendingSkill[] {
    const context = this.contexts.get(sessionId)
    if (!context) {
      return []
    }
    
    // 过滤掉已过期的
    const now = new Date().toISOString()
    return context.pendingSkills.filter(ps => ps.expiresAt > now)
  }
  
  /**
   * 移除 Pending 技能
   */
  removePendingSkill(sessionId: string, skillName: string): boolean {
    const context = this.contexts.get(sessionId)
    if (!context) {
      return false
    }
    
    const index = context.pendingSkills.findIndex(ps => ps.skillName === skillName)
    if (index > -1) {
      context.pendingSkills.splice(index, 1)
      context.lastUpdatedAt = new Date().toISOString()
      return true
    }
    
    return false
  }
  
  /**
   * 检查是否有匹配的 Pending 技能
   */
  checkPendingTrigger(
    sessionId: string, 
    userInput: string
  ): PendingSkill | null {
    const pendingSkills = this.getPendingSkills(sessionId)
    
    // 简单的关键词匹配，实际应用中可以更复杂
    for (const ps of pendingSkills) {
      if (userInput.includes(ps.waitingFor)) {
        return ps
      }
    }
    
    return null
  }
  
  // ==================== 历史记录管理 ====================
  
  /**
   * 添加执行历史
   */
  addHistory(
    sessionId: string,
    skillName: string,
    result: SkillExecutionResult,
    userInput: string
  ): void {
    const context = this.contexts.get(sessionId)
    if (!context) {
      return
    }
    
    const entry: ExecutionHistoryEntry = {
      skillName,
      result,
      userInput,
      executedAt: new Date().toISOString()
    }
    
    context.history.push(entry)
    
    // 限制历史记录数量
    if (context.history.length > this.config.maxHistorySize) {
      context.history = context.history.slice(-this.config.maxHistorySize)
    }
    
    context.lastUpdatedAt = entry.executedAt
  }
  
  /**
   * 获取最近的执行历史
   */
  getRecentHistory(sessionId: string, limit: number = 10): ExecutionHistoryEntry[] {
    const context = this.contexts.get(sessionId)
    if (!context) {
      return []
    }
    
    return context.history.slice(-limit)
  }
  
  /**
   * 获取特定技能的执行历史
   */
  getSkillHistory(sessionId: string, skillName: string): ExecutionHistoryEntry[] {
    const context = this.contexts.get(sessionId)
    if (!context) {
      return []
    }
    
    return context.history.filter(entry => entry.skillName === skillName)
  }
  
  // ==================== 清理与维护 ====================
  
  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      return
    }
    
    // 每分钟检查一次
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, 60 * 1000)
  }
  
  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
  
  /**
   * 清理过期数据
   */
  cleanup(): void {
    const now = new Date().getTime()
    const expireThreshold = now - this.config.sessionExpireTime
    
    let cleaned = 0
    
    for (const [sessionId, context] of this.contexts) {
      const lastUpdated = new Date(context.lastUpdatedAt).getTime()
      
      if (lastUpdated < expireThreshold) {
        this.contexts.delete(sessionId)
        cleaned++
      } else {
        // 清理过期的 Pending Skills
        const nowStr = new Date().toISOString()
        context.pendingSkills = context.pendingSkills.filter(
          ps => ps.expiresAt > nowStr
        )
      }
    }
    
    if (cleaned > 0) {
      console.log(`[SkillContext] 清理了 ${cleaned} 个过期会话`)
    }
  }
  
  /**
   * 获取上下文摘要（用于调试）
   */
  getContextSummary(sessionId: string): object | null {
    const context = this.contexts.get(sessionId)
    if (!context) {
      return null
    }
    
    return {
      sessionId: context.sessionId,
      userId: context.userId,
      activeSkill: context.activeSkill?.skillName || null,
      activeSkillStatus: context.activeSkill?.status || null,
      filledSlots: context.activeSkill?.slots.filter(s => s.filled).length || 0,
      totalSlots: context.activeSkill?.slots.length || 0,
      pendingSkillsCount: context.pendingSkills.length,
      historyCount: context.history.length,
      variablesCount: Object.keys(context.variables).length,
      lastUpdatedAt: context.lastUpdatedAt
    }
  }
  
  /**
   * 获取所有会话统计
   */
  getStats(): {
    totalSessions: number
    activeSessions: number
    sessionsWithActiveSkill: number
    sessionsWithPending: number
  } {
    const all = Array.from(this.contexts.values())
    
    return {
      totalSessions: all.length,
      activeSessions: all.filter(c => 
        new Date().getTime() - new Date(c.lastUpdatedAt).getTime() < 5 * 60 * 1000
      ).length,
      sessionsWithActiveSkill: all.filter(c => c.activeSkill !== null).length,
      sessionsWithPending: all.filter(c => c.pendingSkills.length > 0).length
    }
  }
  
  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stopCleanup()
    this.contexts.clear()
    console.log('[SkillContext] 管理器已销毁')
  }
}

// ==================== 全局实例 ====================

export const skillContextManager = new SkillContextManager()
