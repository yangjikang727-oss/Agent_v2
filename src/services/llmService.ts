/**
 * LLM 服务 - 统一导出入口
 * 
 * 架构说明:
 * - core/     共享核心服务 (LLM调用基础方法)
 * - traditional/   传统模式服务 (意图解析、技能系统)
 * - react/    ReAct模式服务 (推理引擎、工具注册表)
 * 
 * 修改传统模式 → 编辑 traditional/ 目录
 * 修改ReAct模式 → 编辑 react/ 目录
 * 两边互不影响
 */

// ==================== 核心服务导出 ====================
export { 
  callLLM, 
  callLLMRaw,
  callLLMRawChat,
  type LLMConfig, 
  type LLMProvider 
} from './core/llmCore'

// ==================== 传统模式导出 ====================
export { parseIntent, generateAgenda } from './traditional/intentParser'

// ==================== ReAct模式导出 ====================
export { 
  initializeReAct, 
  processWithReAct,
  createReActEngine,
  type ReActConfig,
  type ReActStep,
  type Tool,
  type ToolContext,
  type ToolResult,
  // 工具适配器和提供者
  type ToolAdapter,
  type ToolProvider,
  type ApiToolConfig,
  type ApiAuthConfig,
  LocalToolProvider,
  localProvider,
  ApiToolProvider,
  createApiProvider
} from './react'

// 导出工具注册表供 tools/ 目录使用
export { toolRegistry } from './react/toolRegistry'
