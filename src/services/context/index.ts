/**
 * 上下文工程模块 - 统一导出
 */

// 类型导出
export type {
  ConversationMessage,
  MessageSemantics,
  ConversationSummary,
  TaskStatus,
  ActiveTask,
  TaskContext,
  SessionPhase,
  SessionState,
  StateTransitionEvent,
  CompressionStrategy,
  CompressionConfig,
  ContextSnapshot,
  SessionContext,
  ContextManagerConfig
} from './contextTypes'

// 常量导出
export { DEFAULT_CONTEXT_CONFIG } from './contextTypes'

// 核心类导出
export { ContextManager, contextManager } from './contextManager'
