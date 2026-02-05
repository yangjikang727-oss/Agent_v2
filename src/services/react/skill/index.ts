/**
 * Skill 模块统一导出
 * 
 * Claude Skill 机制 - 基于三层渐进式披露
 * 
 * 架构概览：
 * - 第一层（元数据）: ~100 Token - 意图匹配
 * - 第二层（核心指令）: ~500 Token - 参数校验
 * - 第三层（资源代码）: 0 Token - 执行结果
 */

// ==================== 类型导出 ====================

export type {
  // Skill 规格
  SkillSpec,
  FieldSchema,
  FieldType,
  ConstraintRule,
  SkillSOP,
  SOPStep,
  
  // 资源
  SkillResource,
  ResourceType,
  ResourceExecutionResult,
  
  // 披露层级
  DisclosureLevel,
  DisclosureLevelConfig,
  MetadataInfo,
  InstructionInfo,
  ResourceInfo,
  DisclosureManagerState,
  DisclosureEvent,
  
  // 选择器决策
  SelectorDecision,
  SelectorDecisionType,
  SkillCallDecision,
  ClarificationDecision,
  PendingDecision,
  ChainDecision,
  NoMatchDecision,
  
  // 执行
  SkillExecutionResult,
  ExecutionStatus,
  SkillExecutor,
  
  // 上下文
  SkillContext,
  SlotState,
  ActiveSkillState,
  PendingSkill,
  ExecutionHistoryEntry,
  
  // 反馈与自愈
  FeedbackType,
  FeedbackInfo,
  SelfHealingDecision,
  
  // 字段提取
  FieldExtractionResult,
  IntentRecognitionResult
} from './skillTypes'

// ==================== 常量导出 ====================

export { DISCLOSURE_LEVELS } from './skillTypes'

// ==================== 函数导出 ====================

export {
  extractMetadata,
  extractInstruction,
  extractResourceInfo,
  extractByDisclosureLevel,
  extractAllMetadata,
  estimateTokenUsage
} from './skillTypes'

// ==================== 注册中心 ====================

export { skillRegistry, SkillRegistry } from './skillRegistry'
export type { SkillRegistryEvent } from './skillRegistry'

// ==================== 上下文管理 ====================

export { skillContextManager, SkillContextManager } from './skillContext'

// ==================== 三层披露机制 ====================

export {
  // 披露管理器
  disclosureManager,
  DisclosureManager,
  
  // 类型
  type SkillPhase,
  PHASE_TO_DISCLOSURE,
  
  // 披露内容构建
  buildMetadataDisclosure,
  buildInstructionDisclosure,
  buildResourceDisclosure,
  
  // Token 估算
  estimateMetadataTokens,
  estimateInstructionTokens,
  
  // Prompt 构建
  buildMetadataPrompt,
  buildInstructionPrompt,
  buildResourcePrompt,
  
  // 系统提示词
  METADATA_SYSTEM_PROMPT,
  INSTRUCTION_SYSTEM_PROMPT,
  RESOURCE_SYSTEM_PROMPT,
  
  // 向后兼容
  buildCapabilityDisclosure,
  buildStructuralDisclosure,
  buildExecutionDisclosure,
  buildCapabilityPrompt,
  buildStructuralPrompt,
  buildExecutionPrompt,
  CAPABILITY_SYSTEM_PROMPT,
  STRUCTURAL_SYSTEM_PROMPT,
  EXECUTION_SYSTEM_PROMPT
} from './progressiveDisclosure'

// ==================== 技能选择器 ====================

export { SkillSelector, createSkillSelector } from './skillSelector'

// ==================== 槽位填充 ====================

export {
  slotFillingManager,
  SlotFillingManager,
  generateClarificationQuestion,
  generateFriendlyQuestion,
  extractFieldValue
} from './slotFilling'

// ==================== 技能执行器 ====================

export {
  skillExecutor,
  SkillExecutorManager,
  registerLocalExecutor,
  registerLocalExecutors,
  configureApiExecutor
} from './skillExecutor'
export type { ExecutorType, ExecutorConfig, LocalExecuteFn } from './skillExecutor'

// ==================== 资源管理 ====================

export {
  resourceManager,
  ResourceManager,
  ScriptResourceLoader,
  TemplateResourceLoader,
  ReferenceResourceLoader,
  ConfigResourceLoader,
  createScriptResource,
  createTemplateResource,
  createReferenceResource,
  createConfigResource
} from './skillResources'
export type { ResourceLoader } from './skillResources'

// ==================== 反馈与自愈 ====================

export {
  createFeedbackLoop,
  FeedbackLoopManager,
  SelfHealingEngine,
  analyzeFeedback
} from './feedbackLoop'

// ==================== 示例 Skills ====================

export {
  registerExampleSkills,
  exampleSkills,
  meetingSkillSpec,
  tripSkillSpec,
  notifySkillSpec
} from './exampleSkills'

// ==================== 便捷初始化函数 ====================

import type { LLMConfig } from '../../core/llmCore'
import { SkillSelector } from './skillSelector'
import { FeedbackLoopManager } from './feedbackLoop'
import { registerExampleSkills } from './exampleSkills'

/**
 * Skill 系统配置
 */
export interface SkillSystemConfig {
  llmConfig: LLMConfig
  registerExamples?: boolean
}

/**
 * Skill 系统实例
 */
export interface SkillSystem {
  selector: SkillSelector
  feedbackLoop: FeedbackLoopManager
}

/**
 * 初始化 Skill 系统
 */
export function initSkillSystem(config: SkillSystemConfig): SkillSystem {
  console.log('[SkillSystem] 初始化 Skill 系统...')
  
  // 创建选择器
  const selector = new SkillSelector(config.llmConfig)
  
  // 创建反馈循环
  const feedbackLoop = new FeedbackLoopManager(config.llmConfig)
  
  // 注册示例 Skills
  if (config.registerExamples !== false) {
    registerExampleSkills()
  }
  
  console.log('[SkillSystem] Skill 系统初始化完成')
  
  return {
    selector,
    feedbackLoop
  }
}
