/**
 * ReAct 模式服务导出
 * 包含 ReAct 引擎、工具注册表、提示词模板、Skill 机制等
 * 
 * 可扩展架构:
 * - 工具适配器 (ToolAdapter) - 统一本地和远程工具接口
 * - 工具提供者 (ToolProvider) - 支持多来源工具注册
 * - Skill 机制 - 三层渐进式披露（Progressive Disclosure）
 */

// 导出 ReAct 引擎
export { 
  ReActEngine, 
  createReActEngine, 
  type ReActConfig 
} from './reactEngine'

// 导出工具注册表
export { 
  toolRegistry, 
  ToolRegistry, 
  executeTool, 
  executeTools,
  type Tool,
  type ToolParameter,
  type ToolContext,
  type ToolResult
} from './toolRegistry'

// 导出提示词和解析器
export { 
  REACT_PROMPTS, 
  parseReActResponse, 
  formatObservation, 
  buildReActHistory,
  type ReActStep 
} from './reactPrompts'

// 导出工具适配器和提供者
export {
  type ToolType,
  type ToolMeta,
  type ToolParameterSchema,
  type ToolDefinition,
  type ToolAdapter,
  type HttpMethod,
  type AuthType,
  type ApiAuthConfig,
  type ParamMapping,
  type ResponseMapping,
  type ApiToolConfig,
  type ProviderConfig,
  type ToolProvider,
  toolToDefinition,
  createLocalAdapter,
  generateToolSummary
} from './toolAdapter'

// 导出工具提供者实现
export {
  LocalToolProvider,
  localProvider,
  ApiToolProvider,
  createApiProvider
} from './providers'

// ==================== Skill 机制（Qoder Skill 风格） ====================

// 导出新版 Skill 模块
export { skillStore } from './skills/skillStore'
export type { SkillMetadata, SkillInstruction, ParsedSkill } from './skills/skillLoader'
export { parseSkillMd, loadAllSkillFiles } from './skills/skillLoader'

// ==================== ReAct 模式初始化 ====================

import { createReActEngine, type ReActEngine } from './reactEngine'
import type { LLMConfig } from '../core/llmCore'

/** 缓存的引擎实例，避免每次调用都重新创建 */
let cachedEngine: ReActEngine | null = null
let cachedConfigKey = ''

/** 根据 LLM 配置生成缓存 key */
function configToKey(config: LLMConfig): string {
  return `${config.provider}|${config.model}|${config.apiUrl}|${config.apiKey?.slice(-6) || ''}`
}

/**
 * 初始化 ReAct 模式
 * @param config LLM配置
 * @returns ReAct引擎实例
 */
export function initializeReAct(config: LLMConfig): ReActEngine {
  // Skill 工具已在 toolRegistry.ts 模块加载时自动注册，无需重复调用
  
  const key = configToKey(config)
  if (cachedEngine && cachedConfigKey === key) {
    console.log('[ReAct] 复用已有引擎实例')
    return cachedEngine
  }
  
  cachedEngine = createReActEngine(config)
  cachedConfigKey = key
  console.log('[ReAct] 初始化完成（新引擎实例）')
  return cachedEngine
}

/**
 * 使用 ReAct 模式处理用户查询
 * 复用引擎实例，配置变更时自动重建
 */
export async function processWithReAct(
  query: string,
  context: {
    userId: string
    currentDate: string
    scheduleStore: any
    taskStore: any
  },
  config: LLMConfig
) {
  console.log('[ReAct] 开始处理查询:', query)
  console.log('[ReAct] LLM配置:', {
    provider: config.provider,
    model: config.model,
    hasApiKey: !!config.apiKey,
    apiUrl: config.apiUrl
  })
  
  try {
    const engine = initializeReAct(config)  // 复用缓存引擎
    const result = await engine.processQuery(query, context)
    console.log('[ReAct] 处理完成，结果:', result)
    return result
  } catch (error) {
    console.error('[ReAct] 处理异常:', error)
    throw error
  }
}
