/**
 * 三层渐进式披露机制（Progressive Disclosure）
 * 
 * 核心设计：严格控制模型在不同推理阶段"可见的信息边界"
 * 通过"按需加载知识"极大降低 Token 消耗，保证 Agent 聚焦当前任务
 * 
 * 第一层：元数据（Metadata）~100 Token
 *   - 内容：name, description, tags, when_to_use
 *   - 加载时机：Agent 启动时自动加载所有 Skill 的元数据
 *   - 作用：快速匹配场景，判断应该用哪个能力
 * 
 * 第二层：核心指令（Instruction）~500 Token
 *   - 内容：input_schema, required_fields, constraints, SOP
 *   - 加载时机：场景匹配后，通过触发加载
 *   - 作用：掌握该 Skill 的核心执行逻辑，进行参数校验与槽位填充
 * 
 * 第三层：资源与代码（Resource）代码不进上下文
 *   - 内容：脚本执行、API 调用、模板渲染
 *   - 加载时机：执行过程中按需加载
 *   - 关键优势：脚本代码永不进入上下文，仅返回执行结果
 */

import type { 
  SkillSpec, 
  SkillContext,
  DisclosureLevel,
  MetadataInfo,
  InstructionInfo,
  ResourceInfo,
  SkillSOP,
  DisclosureManagerState,
  DisclosureEvent
} from './skillTypes'

import {
  extractMetadata,
  extractInstruction,
  extractResourceInfo,
  DISCLOSURE_LEVELS
} from './skillTypes'

// 重新导出 DisclosureLevel 类型供外部使用
export type { DisclosureLevel } from './skillTypes'

// ==================== Skill 生命周期阶段 ====================

/** Skill 生命周期阶段 */
export type SkillPhase = 'intent_matching' | 'slot_validation' | 'pending' | 'execution'

/** 披露层级与生命周期映射 */
export const PHASE_TO_DISCLOSURE: Record<SkillPhase, DisclosureLevel> = {
  'intent_matching': 'metadata',
  'slot_validation': 'instruction',
  'pending': 'instruction',
  'execution': 'resource'
}

// ==================== 第一层：元数据披露 ====================

/**
 * 构建元数据披露内容（第一层）
 * 用于快速场景匹配，约 100 Token
 */
export function buildMetadataDisclosure(specs: SkillSpec[]): string {
  if (specs.length === 0) {
    return '当前没有可用的能力。'
  }
  
  const metadataList = specs.map(extractMetadata)
  
  return metadataList.map((meta, index) => {
    const tags = meta.tags?.length ? `[${meta.tags.join(', ')}]` : ''
    return `${index + 1}. **${meta.name}** ${tags}
   描述: ${meta.description}
   适用: ${meta.when_to_use}${meta.when_not_to_use ? `
   不适用: ${meta.when_not_to_use}` : ''}`
  }).join('\n\n')
}

/**
 * 估算元数据层 Token 占用
 */
export function estimateMetadataTokens(specs: SkillSpec[]): number {
  // 每个 Skill 约 100 Token
  return specs.length * DISCLOSURE_LEVELS.metadata.estimatedTokens
}

// ==================== 第二层：核心指令披露 ====================

/**
 * 构建核心指令披露内容（第二层）
 * 包含 input_schema, required_fields, constraints, SOP
 */
export function buildInstructionDisclosure(spec: SkillSpec): string {
  const info = extractInstruction(spec)
  
  // 必填字段
  const requiredFields = info.input_schema
    .filter(f => info.required_fields.includes(f.name))
    .map(f => {
      let desc = `- **${f.name}** (${f.type}): ${f.description}`
      if (f.enum) desc += `\n    可选值: ${f.enum.join(', ')}`
      if (f.examples) desc += `\n    示例: ${f.examples.join(', ')}`
      if (f.clarificationPrompt) desc += `\n    提问: ${f.clarificationPrompt}`
      return desc
    })
    .join('\n')
  
  // 可选字段
  const optionalFields = info.input_schema
    .filter(f => !info.required_fields.includes(f.name))
    .map(f => `- **${f.name}** (${f.type}): ${f.description}`)
    .join('\n')
  
  // 约束规则
  const constraints = info.constraints?.map(c => 
    `- ${c.description}: ${c.condition}`
  ).join('\n') || '无'
  
  // SOP 操作流程
  const sopContent = info.sop ? buildSOPContent(info.sop) : ''
  
  return `# 技能核心指令: ${info.name}

## 描述
${info.description}

## 必填字段（缺失时必须澄清，禁止猜测）
${requiredFields || '无'}

## 可选字段
${optionalFields || '无'}

## 约束规则
${constraints}
${sopContent}
## 注意事项
- 若必填字段缺失，必须主动询问用户
- 禁止猜测或补全任何关键信息
- 一次只问一个最关键的问题
- 时间相关字段需要明确具体日期时间
- 组合执行: ${info.composable ? '支持' : '不支持'}
- 延迟执行: ${info.deferred_allowed ? '支持' : '不支持'}`
}

/**
 * 构建 SOP 内容
 */
function buildSOPContent(sop: SkillSOP): string {
  const steps = sop.steps.map(step => 
    `  ${step.step}. ${step.description} [${step.action}]${step.fields ? ` - 字段: ${step.fields.join(', ')}` : ''}`
  ).join('\n')
  
  const preconditions = sop.preconditions?.length 
    ? `前置条件: ${sop.preconditions.join('; ')}`
    : ''
  
  return `
## 操作流程 (SOP)
${sop.name}: ${sop.description}
${preconditions}

${steps}
`
}

/**
 * 估算指令层 Token 占用
 */
export function estimateInstructionTokens(spec: SkillSpec): number {
  let tokens = DISCLOSURE_LEVELS.instruction.estimatedTokens
  
  // SOP 额外增加 Token
  if (spec.sop) {
    tokens += spec.sop.steps.length * 30
  }
  
  // 约束规则额外 Token
  if (spec.constraints) {
    tokens += spec.constraints.length * 20
  }
  
  return tokens
}

// ==================== 第三层：资源披露（执行确认）====================

/**
 * 构建执行确认披露内容（第三层）
 * 注意：实际脚本代码不进入上下文，只返回执行结果
 */
export function buildResourceDisclosure(
  spec: SkillSpec,
  params: Record<string, any>
): string {
  const resourceInfo = extractResourceInfo(spec)
  
  const resourceList = resourceInfo.availableResources.length > 0
    ? resourceInfo.availableResources.map(r => 
        `- ${r.name} (${r.type}): ${r.description}`
      ).join('\n')
    : '无外部资源依赖'
  
  return `# 执行确认: ${spec.name}

## 已确认参数
${Object.entries(params).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n')}

## 执行器类型
${resourceInfo.executorType || 'local'}

## 可用资源（代码不进入上下文，仅返回执行结果）
${resourceList}

## 执行要求
- 单次执行、不可拆分
- 执行失败必须返回可解释错误
- 执行结果将回流至推理层

## 预期结果格式
\`\`\`json
{
  "status": "success | partial_success | error",
  "data": { ... },
  "error": { "code": "...", "message": "..." }
}
\`\`\``
}

// ==================== 分层 Prompt 构建器 ====================

/**
 * 第一层系统提示词 - 元数据匹配
 */
export const METADATA_SYSTEM_PROMPT = `你是一个智能技能调度系统的意图理解模块。

## 你的职责（第一层：元数据匹配）

根据用户输入，判断应该使用哪个能力（Skill）来处理。

## 重要约束

1. 你只能看到每个 Skill 的名称、描述、标签和适用条件
2. 你不知道具体的输入参数和执行细节（这属于第二层）
3. 禁止在此阶段输出任何结构化调用
4. 只需判断"应该用哪个能力"，不需要提取参数

## Token 优化

此阶段每个 Skill 仅占用约 100 Token，用于快速场景匹配。

## 输出格式

\`\`\`json
{
  "phase": "metadata_match",
  "matched_skill": "技能名称 或 null",
  "confidence": 0.0-1.0,
  "reasoning": "推理过程"
}
\`\`\`

如果无法匹配任何能力，matched_skill 设为 null。`

/**
 * 第二层系统提示词 - 核心指令校验
 */
export const INSTRUCTION_SYSTEM_PROMPT = `你是一个智能技能调度系统的参数校验模块。

## 你的职责（第二层：核心指令校验）

用户已选择了一个技能，现在你可以看到该技能的完整输入 Schema 和 SOP。

你需要：
1. 从用户输入中提取参数
2. 检查必填字段是否完整
3. 如果缺失关键信息，生成澄清问题
4. 按照 SOP 指导执行流程

## 核心原则

- **禁止猜测**：关键信息缺失时必须反问用户
- **禁止补全**：不要假设任何未明确提供的信息
- **一次一问**：需要澄清时，一次只问一个最关键的问题
- **时间精确**："下周三"、"下午"等模糊表达必须澄清具体时间

## 输出格式

### 参数完整，可以执行：
\`\`\`json
{
  "phase": "instruction_validation",
  "status": "complete",
  "params": { "字段名": "值" },
  "reasoning": "推理过程"
}
\`\`\`

### 参数缺失，需要澄清：
\`\`\`json
{
  "phase": "instruction_validation",
  "status": "incomplete",
  "filled_params": { "已有字段": "值" },
  "missing_fields": ["缺失字段1", "缺失字段2"],
  "clarification": {
    "field": "最关键的缺失字段",
    "question": "友好的提问"
  },
  "reasoning": "推理过程"
}
\`\`\`

### 需要延迟执行：
\`\`\`json
{
  "phase": "instruction_validation",
  "status": "pending",
  "partial_params": { "已有字段": "值" },
  "waiting_for": "等待的条件",
  "reasoning": "推理过程"
}
\`\`\``

/**
 * 第三层系统提示词 - 执行确认
 */
export const RESOURCE_SYSTEM_PROMPT = `你是一个智能技能调度系统的执行确认模块。

## 你的职责（第三层：执行确认）

所有必填参数已补齐，准备进入执行阶段。

## 关键说明

- 脚本代码不会进入上下文，只会返回执行结果
- 这样设计是为了优化 Token 占用
- 你只需确认是否执行，无需了解具体实现

## 输出格式

\`\`\`json
{
  "phase": "execution",
  "action": "execute | cancel",
  "final_params": { "完整参数" },
  "reasoning": "推理过程"
}
\`\`\``

// ==================== 完整提示词构建 ====================

/**
 * 构建第一层提示词（元数据匹配）
 */
export function buildMetadataPrompt(
  userInput: string,
  specs: SkillSpec[],
  context: SkillContext
): { system: string; user: string; estimatedTokens: number } {
  const metadataList = buildMetadataDisclosure(specs)
  const estimatedTokens = estimateMetadataTokens(specs)
  
  const userPrompt = `# 可用能力列表（共 ${specs.length} 个，约 ${estimatedTokens} Token）

${metadataList}

---

# 当前上下文
- 日期: ${context.currentDate}
- 用户: ${context.userId}
${context.activeSkill ? `- 当前活跃技能: ${context.activeSkill.skillName}` : ''}

---

# 用户输入
"${userInput}"

---

请判断应该使用哪个能力来处理用户请求。`

  return {
    system: METADATA_SYSTEM_PROMPT,
    user: userPrompt,
    estimatedTokens
  }
}

/**
 * 构建第二层提示词（核心指令校验）
 */
export function buildInstructionPrompt(
  userInput: string,
  spec: SkillSpec,
  context: SkillContext,
  existingParams?: Record<string, any>
): { system: string; user: string; estimatedTokens: number } {
  const instructionInfo = buildInstructionDisclosure(spec)
  const estimatedTokens = estimateInstructionTokens(spec)
  
  const existingInfo = existingParams 
    ? Object.entries(existingParams)
        .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
        .join('\n')
    : '无'
  
  const userPrompt = `${instructionInfo}

---

# 当前上下文
- 日期: ${context.currentDate}
- 用户: ${context.userId}

# 已有参数
${existingInfo}

---

# 用户输入
"${userInput}"

---

请提取参数并检查是否完整。如果缺失必填字段，生成澄清问题。`

  return {
    system: INSTRUCTION_SYSTEM_PROMPT,
    user: userPrompt,
    estimatedTokens
  }
}

/**
 * 构建第三层提示词（执行确认）
 */
export function buildResourcePrompt(
  spec: SkillSpec,
  params: Record<string, any>,
  context: SkillContext
): { system: string; user: string; estimatedTokens: number } {
  const resourceInfo = buildResourceDisclosure(spec, params)
  
  const userPrompt = `${resourceInfo}

---

# 上下文
- 日期: ${context.currentDate}
- 用户: ${context.userId}

---

请确认是否执行此技能。`

  return {
    system: RESOURCE_SYSTEM_PROMPT,
    user: userPrompt,
    estimatedTokens: 0  // 第三层代码不进上下文
  }
}

// ==================== 披露管理器 ====================

/**
 * 披露管理器 - 控制不同阶段的信息可见性
 * 实现"按需加载知识"的核心逻辑
 */
export class DisclosureManager {
  private state: DisclosureManagerState = {
    currentLevel: 'metadata',
    selectedSkill: null,
    loadedResources: [],
    totalTokens: 0
  }
  
  private eventLog: DisclosureEvent[] = []
  
  /**
   * 获取当前状态
   */
  getState(): DisclosureManagerState {
    return { ...this.state }
  }
  
  /**
   * 获取当前披露层级
   */
  getCurrentLevel(): DisclosureLevel {
    return this.state.currentLevel
  }
  
  /**
   * 获取总 Token 占用
   */
  getTotalTokens(): number {
    return this.state.totalTokens
  }
  
  /**
   * 加载元数据层（第一层）
   * 在 Agent 启动时自动调用
   */
  loadMetadata(specs: SkillSpec[]): void {
    this.state.totalTokens = estimateMetadataTokens(specs)
    this.logEvent({
      type: 'level_change',
      level: 'metadata',
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 选中技能（触发进入第二层）
   */
  selectSkill(skillName: string, spec: SkillSpec): void {
    this.state.selectedSkill = skillName
    this.state.currentLevel = 'instruction'
    this.state.totalTokens += estimateInstructionTokens(spec)
    
    this.logEvent({
      type: 'skill_select',
      skillName,
      level: 'instruction',
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 获取选中的技能
   */
  getSelectedSkill(): string | null {
    return this.state.selectedSkill
  }
  
  /**
   * 确认参数完整（触发进入第三层）
   */
  confirmParams(): void {
    if (this.state.currentLevel === 'instruction') {
      this.state.currentLevel = 'resource'
      // 第三层不增加 Token（代码不进上下文）
      
      this.logEvent({
        type: 'level_change',
        level: 'resource',
        timestamp: new Date().toISOString()
      })
    }
  }
  
  /**
   * 加载资源（仅记录，实际代码不进上下文）
   */
  loadResource(resourceId: string): void {
    if (!this.state.loadedResources.includes(resourceId)) {
      this.state.loadedResources.push(resourceId)
      
      this.logEvent({
        type: 'resource_load',
        resourceId,
        timestamp: new Date().toISOString()
      })
    }
  }
  
  /**
   * 重置到第一层
   */
  reset(): void {
    this.state = {
      currentLevel: 'metadata',
      selectedSkill: null,
      loadedResources: [],
      totalTokens: 0
    }
    
    this.logEvent({
      type: 'reset',
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * 根据当前层级过滤 Skill 信息
   */
  filterSkillInfo(spec: SkillSpec): MetadataInfo | InstructionInfo | ResourceInfo {
    switch (this.state.currentLevel) {
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
   * 检查是否可以进入指定阶段
   */
  canAdvance(phase: SkillPhase): boolean {
    const requiredLevel = PHASE_TO_DISCLOSURE[phase]
    
    switch (requiredLevel) {
      case 'metadata':
        return true
      
      case 'instruction':
        return this.state.selectedSkill !== null
      
      case 'resource':
        return this.state.currentLevel === 'instruction' || 
               this.state.currentLevel === 'resource'
      
      default:
        return false
    }
  }
  
  /**
   * 获取事件日志
   */
  getEventLog(): DisclosureEvent[] {
    return [...this.eventLog]
  }
  
  /**
   * 记录事件
   */
  private logEvent(event: DisclosureEvent): void {
    this.eventLog.push(event)
    
    // 保留最近 100 条事件
    if (this.eventLog.length > 100) {
      this.eventLog = this.eventLog.slice(-100)
    }
  }
}

// ==================== 兼容性导出（保持向后兼容） ====================

// 旧的类型别名（向后兼容）
export type CapabilityInfo = MetadataInfo
export type StructuralInfo = InstructionInfo
export type ExecutionInfo = ResourceInfo

// 旧的函数别名（向后兼容）
export const extractCapabilityInfo = extractMetadata
export const extractStructuralInfo = extractInstruction
export const buildCapabilityDisclosure = buildMetadataDisclosure
export const buildStructuralDisclosure = buildInstructionDisclosure
export const buildExecutionDisclosure = buildResourceDisclosure
export const buildCapabilityPrompt = buildMetadataPrompt
export const buildStructuralPrompt = buildInstructionPrompt
export const buildExecutionPrompt = buildResourcePrompt
export const CAPABILITY_SYSTEM_PROMPT = METADATA_SYSTEM_PROMPT
export const STRUCTURAL_SYSTEM_PROMPT = INSTRUCTION_SYSTEM_PROMPT
export const EXECUTION_SYSTEM_PROMPT = RESOURCE_SYSTEM_PROMPT

// ==================== 导出 ====================

export const disclosureManager = new DisclosureManager()
