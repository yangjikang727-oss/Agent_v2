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
  integrateWithBrain,
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
export type { SkillMatchResult } from './skills/skillStore'
export type { SkillMetadata, SkillInstruction, ParsedSkill } from './skills/skillLoader'
export { parseSkillMd, loadAllSkillFiles } from './skills/skillLoader'

// ==================== ReAct 模式初始化 ====================

import { createReActEngine } from './reactEngine'
import type { LLMConfig } from '../core/llmCore'
import { skillStore } from './skills/skillStore'

/**
 * 初始化 ReAct 模式
 * @param config LLM配置
 * @returns ReAct引擎实例
 */
export function initializeReAct(config: LLMConfig) {
  // 初始化 Skill 系统（加载所有 SKILL.md）
  skillStore.loadAllSkills()
  
  // 创建 ReAct 引擎
  const engine = createReActEngine(config)
  
  console.log('[ReAct] 初始化完成（Skill 系统已加载）')
  return engine
}

/**
 * 使用 ReAct 模式处理用户查询
 */
export async function processWithReAct(
  query: string,
  context: {
    userId: string
    currentDate: string
    scheduleStore: any
    taskStore: any
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  },
  config: LLMConfig
) {
  console.log('[ReAct] 开始处理查询:', query)
  console.log('[ReAct] LLM配置:', {
    provider: config.provider,
    model: config.model,
    hasApiKey: !!config.apiKey,
    apiUrl: config.apiUrl,
    historyLength: context.conversationHistory?.length || 0
  })
  
  try {
    const engine = createReActEngine(config)
    const result = await engine.processQuery(query, context)
    console.log('[ReAct] 处理完成，结果:', result)
    return result
  } catch (error) {
    console.error('[ReAct] 处理异常:', error)
    throw error
  }
}
