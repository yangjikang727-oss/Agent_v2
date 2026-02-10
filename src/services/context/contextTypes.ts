/**
 * 上下文工程 - 类型定义
 * 
 * 统一管理 Agent 的上下文信息，包括：
 * - 对话历史（短期记忆）
 * - 任务上下文
 * - 会话状态机
 * - 上下文压缩策略
 */

// ==================== 对话历史（短期记忆）====================

/** 对话消息 */
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  /** 语义标注 */
  semantics?: MessageSemantics
}

/** 消息语义标注 */
export interface MessageSemantics {
  /** 识别的意图 */
  intent?: string
  /** 提取的实体 */
  entities?: Record<string, any>
  /** 填充的槽位 */
  slots?: Record<string, any>
  /** 关联的技能 */
  skillName?: string
}

/** 对话摘要 */
export interface ConversationSummary {
  /** 摘要文本 */
  text: string
  /** 关键实体 */
  keyEntities: Record<string, any>
  /** 已完成的任务 */
  completedTasks: string[]
  /** 生成时间 */
  generatedAt: string
}

// ==================== 任务上下文 ====================

/** 任务状态 */
export type TaskStatus = 'collecting' | 'confirming' | 'executing' | 'completed' | 'failed' | 'cancelled'

/** 活跃任务 */
export interface ActiveTask {
  /** 任务 ID */
  id: string
  /** 关联技能 */
  skillName: string
  /** 任务状态 */
  status: TaskStatus
  /** 已收集的参数 */
  collectedParams: Record<string, any>
  /** 待收集的参数 */
  pendingParams: string[]
  /** 当前询问的字段 */
  currentQuestion?: string
  /** 开始时间 */
  startedAt: string
  /** 最后更新时间 */
  updatedAt: string
}

/** 任务上下文 */
export interface TaskContext {
  /** 当前活跃任务 */
  activeTask: ActiveTask | null
  /** 等待中的任务队列 */
  pendingTasks: ActiveTask[]
  /** 最近完成的任务（用于上下文关联） */
  recentCompleted: Array<{
    skillName: string
    params: Record<string, any>
    completedAt: string
  }>
}

// ==================== 会话状态机 ====================

/** 会话阶段 */
export type SessionPhase = 
  | 'idle'           // 空闲，等待用户输入
  | 'understanding'  // 理解用户意图
  | 'collecting'     // 收集必要信息
  | 'confirming'     // 确认执行
  | 'executing'      // 执行中
  | 'feedback'       // 反馈结果

/** 会话状态 */
export interface SessionState {
  /** 会话 ID */
  sessionId: string
  /** 用户 ID */
  userId: string
  /** 当前阶段 */
  phase: SessionPhase
  /** 阶段开始时间 */
  phaseStartedAt: string
  /** 轮次计数 */
  turnCount: number
  /** 最后交互时间 */
  lastInteractionAt: string
}

/** 状态转换事件 */
export type StateTransitionEvent = 
  | 'user_input'
  | 'intent_recognized'
  | 'params_complete'
  | 'user_confirmed'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'user_cancelled'
  | 'timeout'

// ==================== 上下文压缩策略 ====================

/** 压缩策略类型 */
export type CompressionStrategy = 
  | 'sliding_window'  // 滑动窗口：保留最近N条
  | 'summarize'       // 摘要压缩：生成摘要
  | 'entity_focus'    // 实体聚焦：只保留关键实体
  | 'hybrid'          // 混合策略

/** 压缩配置 */
export interface CompressionConfig {
  /** 策略类型 */
  strategy: CompressionStrategy
  /** 最大消息数（滑动窗口） */
  maxMessages: number
  /** 最大 Token 数 */
  maxTokens: number
  /** 是否保留系统消息 */
  preserveSystemMessages: boolean
  /** 摘要触发阈值 */
  summarizeThreshold: number
}

/** 上下文快照 */
export interface ContextSnapshot {
  /** 压缩后的历史 */
  compressedHistory: ConversationMessage[]
  /** 摘要（如果有） */
  summary?: ConversationSummary
  /** 当前任务上下文 */
  taskContext: TaskContext
  /** 会话状态 */
  sessionState: SessionState
  /** Token 估算 */
  estimatedTokens: number
  /** 生成时间 */
  generatedAt: string
}

// ==================== 完整上下文 ====================

/** 参数收集状态（用于多轮对话） */
export interface CollectingState {
  intent: 'meeting' | 'trip' | null
  collectedParams: Record<string, any>
  missingFields: string[]
  originalQuery: string
}

/** 完整会话上下文 */
export interface SessionContext {
  /** 会话状态 */
  state: SessionState
  /** 对话历史 */
  history: ConversationMessage[]
  /** 任务上下文 */
  task: TaskContext
  /** 摘要缓存 */
  summary?: ConversationSummary
  /** 压缩配置 */
  compressionConfig: CompressionConfig
  /** 扩展元数据（用于存储多轮对话状态等） */
  meta?: {
    collectingState?: CollectingState
  }
}

/** 上下文管理器配置 */
export interface ContextManagerConfig {
  /** 默认压缩配置 */
  compression: CompressionConfig
  /** 会话超时时间（毫秒） */
  sessionTimeout: number
  /** 是否启用自动摘要 */
  enableAutoSummary: boolean
  /** 调试模式 */
  debug: boolean
}

/** 默认配置 */
export const DEFAULT_CONTEXT_CONFIG: ContextManagerConfig = {
  compression: {
    strategy: 'hybrid',
    maxMessages: 20,
    maxTokens: 2000,
    preserveSystemMessages: true,
    summarizeThreshold: 15
  },
  sessionTimeout: 30 * 60 * 1000, // 30分钟
  enableAutoSummary: true,
  debug: true
}
