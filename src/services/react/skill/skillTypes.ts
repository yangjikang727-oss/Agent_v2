/**
 * Claude Skill 机制 - 类型定义
 * 
 * 基于"能力声明 + 推理选择 + 约束执行"的设计理念
 * 使模型具备更强的自主决策与稳健执行能力
 * 
 * 三层渐进式披露机制（Progressive Disclosure）：
 * - 第一层：元数据（~100 Token）- 名称、描述、标签，用于意图匹配
 * - 第二层：核心指令（~500 Token）- SOP、输入Schema，用于参数校验
 * - 第三层：资源与代码（按需加载）- 脚本执行，仅返回结果不进上下文
 */

// ==================== 披露层级定义 ====================

/** 披露层级 */
export type DisclosureLevel = 'metadata' | 'instruction' | 'resource'

/** 披露层级配置 */
export interface DisclosureLevelConfig {
  /** 层级名称 */
  level: DisclosureLevel
  /** 加载时机 */
  loadTiming: 'always' | 'on_match' | 'on_demand'
  /** 预估 Token 占用 */
  estimatedTokens: number
  /** 是否进入上下文 */
  inContext: boolean
}

/** 三层披露配置 */
export const DISCLOSURE_LEVELS: Record<DisclosureLevel, DisclosureLevelConfig> = {
  metadata: {
    level: 'metadata',
    loadTiming: 'always',
    estimatedTokens: 100,
    inContext: true
  },
  instruction: {
    level: 'instruction',
    loadTiming: 'on_match',
    estimatedTokens: 500,
    inContext: true
  },
  resource: {
    level: 'resource',
    loadTiming: 'on_demand',
    estimatedTokens: 0,  // 代码不进上下文
    inContext: false
  }
}

// ==================== 资源定义（第三层） ====================

/** 资源类型 */
export type ResourceType = 'script' | 'template' | 'reference' | 'config'

/** Skill 资源 */
export interface SkillResource {
  /** 资源 ID */
  id: string
  /** 资源类型 */
  type: ResourceType
  /** 资源名称 */
  name: string
  /** 资源路径或内容 */
  path?: string
  content?: string
  /** 资源描述 */
  description: string
  /** 是否延迟加载（默认 true） */
  lazyLoad?: boolean
  /** 执行入口（仅 script 类型） */
  entryPoint?: string
  /** 执行参数映射（输入字段 -> 脚本参数） */
  paramMapping?: Record<string, string>
}

/** 资源执行结果（第三层只返回结果，不返回代码） */
export interface ResourceExecutionResult {
  /** 资源 ID */
  resourceId: string
  /** 执行状态 */
  status: 'success' | 'error'
  /** 输出数据 */
  output?: any
  /** 错误信息 */
  error?: string
  /** 执行时间（毫秒） */
  executionTime: number
}

// ==================== SOP 指令定义（第二层） ====================

/** SOP 步骤 */
export interface SOPStep {
  /** 步骤序号 */
  step: number
  /** 步骤描述 */
  description: string
  /** 动作类型 */
  action: 'collect' | 'validate' | 'transform' | 'execute' | 'confirm'
  /** 涉及的字段 */
  fields?: string[]
  /** 条件（可选） */
  condition?: string
  /** 失败时的处理 */
  onFailure?: 'retry' | 'ask_user' | 'skip' | 'abort'
}

/** 标准操作流程（SOP） */
export interface SkillSOP {
  /** SOP 名称 */
  name: string
  /** SOP 描述 */
  description: string
  /** 执行步骤 */
  steps: SOPStep[]
  /** 前置条件 */
  preconditions?: string[]
  /** 后置检查 */
  postconditions?: string[]
}

// ==================== Skill 声明相关类型 ====================

/** 字段类型 */
export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'time' | 'datetime'

/** 输入字段 Schema */
export interface FieldSchema {
  /** 字段名 */
  name: string
  /** 字段类型 */
  type: FieldType
  /** 字段描述 */
  description: string
  /** 是否必填 */
  required: boolean
  /** 默认值 */
  default?: any
  /** 枚举值（如果适用） */
  enum?: string[]
  /** 验证规则 */
  validation?: {
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    custom?: string  // 自定义验证描述
  }
  /** 示例值 */
  examples?: string[]
  /** 澄清时的提问模板 */
  clarificationPrompt?: string
}

/** 约束规则 */
export interface ConstraintRule {
  /** 约束 ID */
  id: string
  /** 约束描述 */
  description: string
  /** 约束类型 */
  type: 'precondition' | 'postcondition' | 'invariant'
  /** 约束条件表达式（自然语言） */
  condition: string
  /** 违反时的处理方式 */
  onViolation: 'reject' | 'warn' | 'ask_user' | 'auto_fix'
  /** 违反时的提示信息 */
  violationMessage?: string
}

/** Skill 声明规格（完整结构，包含三层信息） */
export interface SkillSpec {
  // ==================== 第一层：元数据（~100 Token，始终加载） ====================
  
  /** 技能唯一标识 */
  name: string
  
  /** 技能版本 */
  version?: string
  
  /** 能力描述 - 让模型理解这个技能能做什么 */
  description: string
  
  /** 技能标签 - 用于快速匹配 */
  tags?: string[]
  
  /** 技能类别 */
  category?: 'schedule' | 'communication' | 'travel' | 'resource' | 'query' | 'utility'
  
  /** 适用条件 - 何时应该使用这个技能 */
  when_to_use: string
  
  /** 不适用条件 - 何时不应该使用这个技能 */
  when_not_to_use?: string
  
  /** 优先级（数字越小优先级越高） */
  priority?: number
  
  // ==================== 第二层：核心指令（~500 Token，匹配后加载） ====================
  
  /** 输入 Schema - 定义所有输入字段 */
  input_schema: FieldSchema[]
  
  /** 必要字段列表 - 这些字段缺失时必须澄清 */
  required_fields: string[]
  
  /** 约束规则 */
  constraints?: ConstraintRule[]
  
  /** 标准操作流程（SOP）- 核心执行逻辑 */
  sop?: SkillSOP
  
  /** 是否支持与其他 Skill 组合 */
  composable: boolean
  
  /** 可组合的 Skill 列表 */
  composable_with?: string[]
  
  /** 是否支持延迟执行 */
  deferred_allowed: boolean
  
  /** 延迟执行的最大等待时间（毫秒） */
  deferred_timeout?: number
  
  /** 示例对话 - 帮助模型理解使用场景 */
  examples?: {
    userInput: string
    expectedAction: string
  }[]
  
  // ==================== 第三层：资源与代码（按需加载，不进上下文） ====================
  
  /** 资源列表（脚本、模板、参考文档） */
  resources?: SkillResource[]
  
  /** 执行器类型 */
  executorType?: 'local' | 'api' | 'script'
  
  /** API 端点（如果是 API 类型） */
  apiEndpoint?: string
  
  /** 脚本入口（如果是脚本类型） */
  scriptEntry?: string
}

// ==================== 三层提取函数类型 ====================

/** 第一层：元数据信息（始终加载） */
export interface MetadataInfo {
  name: string
  version?: string
  description: string
  tags?: string[]
  category?: string
  when_to_use: string
  when_not_to_use?: string
  priority?: number
}

/** 第二层：核心指令信息（匹配后加载） */
export interface InstructionInfo {
  name: string
  description: string
  input_schema: FieldSchema[]
  required_fields: string[]
  constraints?: ConstraintRule[]
  sop?: SkillSOP
  composable: boolean
  deferred_allowed: boolean
  examples?: { userInput: string; expectedAction: string }[]
}

/** 第三层：资源信息（按需加载，仅返回描述，不返回内容） */
export interface ResourceInfo {
  name: string
  executorType?: 'local' | 'api' | 'script'
  availableResources: {
    id: string
    type: ResourceType
    name: string
    description: string
  }[]
}

// ==================== Selector 输出类型 ====================

/** 选择器决策类型 */
export type SelectorDecisionType = 'skill_call' | 'clarification' | 'pending' | 'no_match' | 'chain'

/** 技能调用决策 */
export interface SkillCallDecision {
  type: 'skill_call'
  skillName: string
  /** 已解析的参数 */
  params: Record<string, any>
  /** 置信度 (0-1) */
  confidence: number
  /** 推理过程 */
  reasoning: string
}

/** 澄清问题决策 */
export interface ClarificationDecision {
  type: 'clarification'
  skillName: string
  /** 缺失的字段 */
  missingFields: string[]
  /** 需要问用户的问题 */
  questions: {
    field: string
    question: string
    options?: string[]
  }[]
  /** 推理过程 */
  reasoning: string
}

/** 延迟执行决策 */
export interface PendingDecision {
  type: 'pending'
  skillName: string
  /** 已有的参数 */
  partialParams: Record<string, any>
  /** 等待的条件 */
  waitingFor: string
  /** 超时时间 */
  timeout: number
  /** 推理过程 */
  reasoning: string
}

/** 技能链决策 */
export interface ChainDecision {
  type: 'chain'
  /** 技能执行顺序 */
  skills: {
    skillName: string
    params: Record<string, any>
    dependsOn?: string  // 依赖的前置技能
  }[]
  /** 推理过程 */
  reasoning: string
}

/** 无匹配决策 */
export interface NoMatchDecision {
  type: 'no_match'
  /** 原因 */
  reason: string
  /** 建议 */
  suggestion?: string
  /** 推理过程 */
  reasoning: string
}

/** Selector 决策结果 */
export type SelectorDecision = 
  | SkillCallDecision 
  | ClarificationDecision 
  | PendingDecision 
  | ChainDecision 
  | NoMatchDecision

// ==================== 执行相关类型 ====================

/** 执行状态 */
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'partial_success' | 'error' | 'cancelled'

/** 执行结果 */
export interface SkillExecutionResult {
  /** 执行状态 */
  status: ExecutionStatus
  /** 技能名称 */
  skillName: string
  /** 输入参数 */
  params: Record<string, any>
  /** 输出数据 */
  data?: any
  /** 错误信息（如果有） */
  error?: {
    code: string
    message: string
    details?: any
    recoverable: boolean
  }
  /** 执行时间（毫秒） */
  executionTime: number
  /** 时间戳 */
  timestamp: string
  /** 是否需要用户确认 */
  requiresConfirmation?: boolean
  /** 后续建议 */
  suggestions?: string[]
}

// ==================== 上下文与状态类型 ====================

/** 槽位状态 */
export interface SlotState {
  /** 字段名 */
  field: string
  /** 当前值 */
  value: any
  /** 是否已填充 */
  filled: boolean
  /** 填充来源 */
  source: 'user_input' | 'context' | 'default' | 'inferred'
  /** 置信度 */
  confidence: number
  /** 填充时间 */
  filledAt?: string
}

/** 活跃技能状态 */
export interface ActiveSkillState {
  /** 技能名称 */
  skillName: string
  /** 当前状态 */
  status: 'selecting' | 'filling' | 'executing' | 'confirming' | 'completed' | 'failed'
  /** 槽位状态 */
  slots: SlotState[]
  /** 开始时间 */
  startedAt: string
  /** 更新时间 */
  updatedAt: string
  /** 重试次数 */
  retryCount: number
}

/** Pending 技能 */
export interface PendingSkill {
  /** 技能名称 */
  skillName: string
  /** 已有参数 */
  partialParams: Record<string, any>
  /** 等待的条件 */
  waitingFor: string
  /** 创建时间 */
  createdAt: string
  /** 超时时间 */
  expiresAt: string
  /** 触发条件 */
  trigger?: {
    type: 'user_input' | 'time' | 'event'
    condition: string
  }
}

/** 执行历史记录 */
export interface ExecutionHistoryEntry {
  /** 技能名称 */
  skillName: string
  /** 执行结果 */
  result: SkillExecutionResult
  /** 用户输入 */
  userInput: string
  /** 执行时间 */
  executedAt: string
}

/** Skill 上下文 */
export interface SkillContext {
  /** 会话 ID */
  sessionId: string
  /** 用户 ID */
  userId: string
  /** 当前日期 */
  currentDate: string
  /** 当前活跃技能 */
  activeSkill: ActiveSkillState | null
  /** 等待中的技能列表 */
  pendingSkills: PendingSkill[]
  /** 执行历史 */
  history: ExecutionHistoryEntry[]
  /** 全局上下文变量 */
  variables: Record<string, any>
  /** 最后更新时间 */
  lastUpdatedAt: string
}

// ==================== 反馈与自愈类型 ====================

/** 反馈类型 */
export type FeedbackType = 'success' | 'conflict' | 'permission_denied' | 'resource_unavailable' | 'validation_error' | 'system_error'

/** 反馈信息 */
export interface FeedbackInfo {
  /** 反馈类型 */
  type: FeedbackType
  /** 原执行结果 */
  originalResult: SkillExecutionResult
  /** 问题描述 */
  problem: string
  /** 可能的解决方案 */
  possibleSolutions: {
    id: string
    description: string
    action: 'retry' | 'modify_params' | 'ask_user' | 'use_alternative' | 'cancel'
    params?: Record<string, any>
  }[]
}

/** 自愈决策 */
export interface SelfHealingDecision {
  /** 选择的解决方案 ID */
  solutionId: string
  /** 修改后的参数 */
  modifiedParams?: Record<string, any>
  /** 需要问用户的问题 */
  userQuestion?: string
  /** 替代技能 */
  alternativeSkill?: string
  /** 推理过程 */
  reasoning: string
}

// ==================== 技能执行器接口 ====================

/** 技能执行器 */
export interface SkillExecutor {
  /** 执行技能 */
  execute(
    skillName: string, 
    params: Record<string, any>, 
    context: SkillContext
  ): Promise<SkillExecutionResult>
  
  /** 验证参数 */
  validateParams?(
    skillName: string, 
    params: Record<string, any>
  ): { valid: boolean; errors?: string[] }
  
  /** 检查前置条件 */
  checkPreconditions?(
    skillName: string, 
    params: Record<string, any>, 
    context: SkillContext
  ): Promise<{ satisfied: boolean; violations?: string[] }>
}

// ==================== 工具函数类型 ====================

/** 字段提取结果 */
export interface FieldExtractionResult {
  field: string
  value: any
  confidence: number
  source: 'explicit' | 'inferred' | 'context'
}

/** 意图识别结果 */
export interface IntentRecognitionResult {
  /** 识别的意图 */
  intent: 'create' | 'update' | 'query' | 'cancel' | 'confirm' | 'unknown'
  /** 置信度 */
  confidence: number
  /** 候选技能 */
  candidateSkills: string[]
  /** 提取的实体 */
  entities: FieldExtractionResult[]
}

// ==================== 三层提取函数 ====================

/**
 * 提取第一层：元数据信息
 * 用于意图匹配，Token 占用 ~100
 */
export function extractMetadata(spec: SkillSpec): MetadataInfo {
  return {
    name: spec.name,
    version: spec.version,
    description: spec.description,
    tags: spec.tags,
    category: spec.category,
    when_to_use: spec.when_to_use,
    when_not_to_use: spec.when_not_to_use,
    priority: spec.priority
  }
}

/**
 * 提取第二层：核心指令信息
 * 匹配后加载，Token 占用 ~500
 */
export function extractInstruction(spec: SkillSpec): InstructionInfo {
  return {
    name: spec.name,
    description: spec.description,
    input_schema: spec.input_schema,
    required_fields: spec.required_fields,
    constraints: spec.constraints,
    sop: spec.sop,
    composable: spec.composable,
    deferred_allowed: spec.deferred_allowed,
    examples: spec.examples
  }
}

/**
 * 提取第三层：资源信息（仅描述，不含实际内容）
 * 按需加载，代码不进上下文
 */
export function extractResourceInfo(spec: SkillSpec): ResourceInfo {
  return {
    name: spec.name,
    executorType: spec.executorType,
    availableResources: (spec.resources || []).map(r => ({
      id: r.id,
      type: r.type,
      name: r.name,
      description: r.description
    }))
  }
}

/**
 * 根据披露层级提取信息
 */
export function extractByDisclosureLevel(
  spec: SkillSpec, 
  level: DisclosureLevel
): MetadataInfo | InstructionInfo | ResourceInfo {
  switch (level) {
    case 'metadata':
      return extractMetadata(spec)
    case 'instruction':
      return extractInstruction(spec)
    case 'resource':
      return extractResourceInfo(spec)
    default:
      return extractMetadata(spec)
  }
}

/**
 * 批量提取元数据（用于第一层快速匹配）
 */
export function extractAllMetadata(specs: SkillSpec[]): MetadataInfo[] {
  return specs.map(extractMetadata)
}

/**
 * 估算 Token 占用
 */
export function estimateTokenUsage(_spec: SkillSpec, level: DisclosureLevel): number {
  const config = DISCLOSURE_LEVELS[level]
  
  if (level === 'resource') {
    // 第三层不进上下文
    return 0
  }
  
  // 粗略估算：元数据 ~100，指令 ~500
  return config.estimatedTokens
}

// ==================== 披露管理辅助类型 ====================

/** 披露管理器状态 */
export interface DisclosureManagerState {
  /** 当前层级 */
  currentLevel: DisclosureLevel
  /** 选中的技能 */
  selectedSkill: string | null
  /** 已加载的资源 */
  loadedResources: string[]
  /** 总 Token 占用 */
  totalTokens: number
}

/** 披露事件 */
export interface DisclosureEvent {
  type: 'level_change' | 'skill_select' | 'resource_load' | 'reset'
  level?: DisclosureLevel
  skillName?: string
  resourceId?: string
  timestamp: string
}
