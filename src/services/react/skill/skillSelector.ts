/**
 * Skill Selector - 技能选择与推理模块
 * 
 * 基于三层渐进式披露机制：
 * 1. 能力匹配（Capability Match）
 * 2. 槽位校验（Slot Validation）
 * 3. 执行确认（Execution Confirm）
 */

import type { 
  SkillSpec, 
  SkillContext, 
  SelectorDecision,
  SkillCallDecision,
  ClarificationDecision,
  PendingDecision,
  NoMatchDecision
} from './skillTypes'

import { skillRegistry } from './skillRegistry'
import { skillContextManager } from './skillContext'
import { 
  DisclosureManager,
  buildCapabilityPrompt,
  buildStructuralPrompt,
  type DisclosureLevel
} from './progressiveDisclosure'
import { callLLMRaw, type LLMConfig } from '../../core/llmCore'

// ==================== Selector 结果类型 ====================

/** 能力匹配结果 */
interface CapabilityMatchResult {
  phase: 'capability_match'
  matched_skill: string | null
  confidence: number
  reasoning: string
}

/** 槽位校验结果 */
interface SlotValidationResult {
  phase: 'slot_validation'
  status: 'complete' | 'incomplete' | 'pending'
  params?: Record<string, any>
  filled_params?: Record<string, any>
  missing_fields?: string[]
  clarification?: {
    field: string
    question: string
    options?: string[]
  }
  partial_params?: Record<string, any>
  waiting_for?: string
  reasoning: string
}

// ==================== Skill Selector 类 ====================

export class SkillSelector {
  private llmConfig: LLMConfig
  private disclosureManager: DisclosureManager
  
  constructor(llmConfig: LLMConfig) {
    this.llmConfig = llmConfig
    this.disclosureManager = new DisclosureManager()
  }
  
  /**
   * 处理用户输入（主入口）
   */
  async process(
    userInput: string,
    sessionId: string,
    userId: string
  ): Promise<SelectorDecision> {
    console.log(`[SkillSelector] 处理输入: "${userInput}"`)
    
    // 获取或创建上下文
    const context = skillContextManager.getOrCreateContext(sessionId, userId)
    
    // 检查是否有活跃技能（继续槽位填充）
    if (context.activeSkill && context.activeSkill.status === 'filling') {
      return this.continueSlotFilling(userInput, context)
    }
    
    // 检查是否有等待中的技能被触发
    const pendingTrigger = skillContextManager.checkPendingTrigger(sessionId, userInput)
    if (pendingTrigger) {
      return this.resumePendingSkill(pendingTrigger, userInput, context)
    }
    
    // 第一层：能力匹配
    const capabilityResult = await this.matchCapability(userInput, context)
    
    if (!capabilityResult.matched_skill) {
      return this.createNoMatchDecision(capabilityResult.reasoning)
    }
    
    // 进入第二层：槽位校验
    const spec = skillRegistry.getSkillSpec(capabilityResult.matched_skill)
    if (!spec) {
      return this.createNoMatchDecision(`技能 "${capabilityResult.matched_skill}" 未注册`)
    }
    
    this.disclosureManager.selectSkill(capabilityResult.matched_skill, spec)
    
    // 设置活跃技能
    skillContextManager.setActiveSkill(sessionId, spec.name, spec)
    skillContextManager.updateActiveSkillStatus(sessionId, 'filling')
    
    return this.validateSlots(userInput, spec, context)
  }
  
  /**
   * 第一层：能力匹配
   */
  private async matchCapability(
    userInput: string,
    context: SkillContext
  ): Promise<CapabilityMatchResult> {
    console.log('[SkillSelector] 第一层：能力匹配')
    
    const specs = skillRegistry.getAllSpecs()
    const { system, user } = buildCapabilityPrompt(userInput, specs, context)
    
    try {
      const response = await callLLMRaw(
        user,
        system,
        this.llmConfig
      )
      
      if (!response) {
        console.warn('[SkillSelector] LLM 返回空响应')
        return this.fallbackCapabilityMatch(userInput, specs)
      }
      
      const parsed = this.parseJSON<CapabilityMatchResult>(response)
      
      if (parsed) {
        console.log(`[SkillSelector] 能力匹配结果: ${parsed.matched_skill} (${parsed.confidence})`)
        return parsed
      }
      
    } catch (error) {
      console.error('[SkillSelector] 能力匹配失败:', error)
    }
    
    // 兜底：尝试简单关键词匹配
    return this.fallbackCapabilityMatch(userInput, specs)
  }
  
  /**
   * 第二层：槽位校验
   */
  private async validateSlots(
    userInput: string,
    spec: SkillSpec,
    context: SkillContext,
    existingParams?: Record<string, any>
  ): Promise<SelectorDecision> {
    console.log(`[SkillSelector] 第二层：槽位校验 - ${spec.name}`)
    
    const { system, user } = buildStructuralPrompt(userInput, spec, context, existingParams)
    
    try {
      const response = await callLLMRaw(
        user,
        system,
        this.llmConfig
      )
      
      if (!response) {
        console.warn('[SkillSelector] LLM 返回空响应')
        return this.fallbackSlotValidation(userInput, spec, context)
      }
      
      const parsed = this.parseJSON<SlotValidationResult>(response)
      
      if (parsed) {
        return this.handleSlotValidationResult(parsed, spec, context)
      }
      
    } catch (error) {
      console.error('[SkillSelector] 槽位校验失败:', error)
    }
    
    // 兜底：检查必填字段
    return this.fallbackSlotValidation(userInput, spec, context)
  }
  
  /**
   * 处理槽位校验结果
   */
  private handleSlotValidationResult(
    result: SlotValidationResult,
    spec: SkillSpec,
    context: SkillContext
  ): SelectorDecision {
    console.log(`[SkillSelector] 槽位校验状态: ${result.status}`)
    
    switch (result.status) {
      case 'complete':
        // 参数完整，进入执行确认
        this.disclosureManager.confirmParams()
        skillContextManager.updateActiveSkillStatus(context.sessionId, 'executing')
        
        // 填充所有槽位
        if (result.params) {
          skillContextManager.fillSlots(context.sessionId, result.params)
        }
        
        return this.createSkillCallDecision(spec.name, result.params || {}, result.reasoning)
      
      case 'incomplete':
        // 参数不完整，需要澄清
        if (result.filled_params) {
          skillContextManager.fillSlots(context.sessionId, result.filled_params)
        }
        
        return this.createClarificationDecision(
          spec.name,
          result.missing_fields || [],
          result.clarification?.question || '请提供更多信息',
          result.clarification?.field || '',
          result.reasoning
        )
      
      case 'pending':
        // 延迟执行
        if (result.partial_params) {
          skillContextManager.fillSlots(context.sessionId, result.partial_params)
        }
        
        skillContextManager.addPendingSkill(
          context.sessionId,
          spec.name,
          result.partial_params || {},
          result.waiting_for || ''
        )
        
        skillContextManager.clearActiveSkill(context.sessionId)
        
        return this.createPendingDecision(
          spec.name,
          result.partial_params || {},
          result.waiting_for || '',
          result.reasoning
        )
      
      default:
        return this.createNoMatchDecision('无法处理槽位校验结果')
    }
  }
  
  /**
   * 继续槽位填充（多轮对话）
   */
  private async continueSlotFilling(
    userInput: string,
    context: SkillContext
  ): Promise<SelectorDecision> {
    if (!context.activeSkill) {
      return this.createNoMatchDecision('没有活跃的技能')
    }
    
    const spec = skillRegistry.getSkillSpec(context.activeSkill.skillName)
    if (!spec) {
      return this.createNoMatchDecision('技能配置丢失')
    }
    
    // 获取已填充的参数
    const existingParams = skillContextManager.getFilledParams(context.sessionId)
    
    console.log(`[SkillSelector] 继续填充: ${spec.name}`, existingParams)
    
    return this.validateSlots(userInput, spec, context, existingParams)
  }
  
  /**
   * 恢复等待中的技能
   */
  private async resumePendingSkill(
    pending: { skillName: string; partialParams: Record<string, any> },
    userInput: string,
    context: SkillContext
  ): Promise<SelectorDecision> {
    console.log(`[SkillSelector] 恢复 Pending 技能: ${pending.skillName}`)
    
    const spec = skillRegistry.getSkillSpec(pending.skillName)
    if (!spec) {
      return this.createNoMatchDecision('技能配置丢失')
    }
    
    // 移除 pending 状态
    skillContextManager.removePendingSkill(context.sessionId, pending.skillName)
    
    // 重新激活技能
    skillContextManager.setActiveSkill(context.sessionId, spec.name, spec)
    skillContextManager.fillSlots(context.sessionId, pending.partialParams)
    skillContextManager.updateActiveSkillStatus(context.sessionId, 'filling')
    
    return this.validateSlots(userInput, spec, context, pending.partialParams)
  }
  
  // ==================== 兜底逻辑 ====================
  
  /**
   * 兜底：简单关键词能力匹配
   */
  private fallbackCapabilityMatch(
    userInput: string,
    specs: SkillSpec[]
  ): CapabilityMatchResult {
    const input = userInput.toLowerCase()
    
    for (const spec of specs) {
      // 检查技能名称和描述中的关键词
      const keywords = [
        spec.name,
        ...spec.description.split(/[，,、\s]/),
        ...spec.when_to_use.split(/[，,、\s]/)
      ].map(k => k.toLowerCase())
      
      for (const keyword of keywords) {
        if (keyword.length > 1 && input.includes(keyword)) {
          return {
            phase: 'capability_match',
            matched_skill: spec.name,
            confidence: 0.6,
            reasoning: `关键词匹配: "${keyword}"`
          }
        }
      }
    }
    
    return {
      phase: 'capability_match',
      matched_skill: null,
      confidence: 0,
      reasoning: '没有匹配的能力'
    }
  }
  
  /**
   * 兜底：槽位校验
   */
  private fallbackSlotValidation(
    userInput: string,
    spec: SkillSpec,
    _context: SkillContext
  ): SelectorDecision {
    // 简单的正则提取
    const params: Record<string, any> = {}
    const missingFields: string[] = []
    
    for (const field of spec.input_schema) {
      // 尝试从输入中提取值
      const extracted = this.extractFieldValue(userInput, field.name, field.type)
      
      if (extracted !== undefined) {
        params[field.name] = extracted
      } else if (spec.required_fields.includes(field.name)) {
        missingFields.push(field.name)
      }
    }
    
    if (missingFields.length === 0) {
      return this.createSkillCallDecision(spec.name, params, '兜底参数提取完成')
    }
    
    // 生成澄清问题
    const firstMissing = missingFields[0] || ''
    const fieldSpec = spec.input_schema.find(f => f.name === firstMissing)
    const question = fieldSpec?.clarificationPrompt || `请提供${fieldSpec?.description || firstMissing}`
    
    return this.createClarificationDecision(
      spec.name,
      missingFields,
      question,
      firstMissing,
      '兜底槽位检测'
    )
  }
  
  /**
   * 简单字段值提取
   */
  private extractFieldValue(input: string, _fieldName: string, fieldType: string): any {
    // 时间类型
    if (fieldType === 'datetime' || fieldType === 'time' || fieldType === 'date') {
      // 提取时间模式
      const timePatterns = [
        /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,  // 2024-01-15
        /(\d{1,2}[:.]\d{2})/,              // 14:30
        /(上午|下午|早上|晚上)/,
        /(今天|明天|后天|下周[一二三四五六日天])/
      ]
      
      for (const pattern of timePatterns) {
        const match = input.match(pattern)
        if (match) {
          return match[1]
        }
      }
    }
    
    // 数字类型
    if (fieldType === 'number') {
      const match = input.match(/(\d+)/)
      if (match && match[1]) {
        return parseInt(match[1], 10)
      }
    }
    
    return undefined
  }
  
  // ==================== 决策创建辅助方法 ====================
  
  private createSkillCallDecision(
    skillName: string,
    params: Record<string, any>,
    reasoning: string
  ): SkillCallDecision {
    return {
      type: 'skill_call',
      skillName,
      params,
      confidence: 0.9,
      reasoning
    }
  }
  
  private createClarificationDecision(
    skillName: string,
    missingFields: string[],
    question: string,
    field: string,
    reasoning: string
  ): ClarificationDecision {
    return {
      type: 'clarification',
      skillName,
      missingFields,
      questions: [{
        field,
        question
      }],
      reasoning
    }
  }
  
  private createPendingDecision(
    skillName: string,
    partialParams: Record<string, any>,
    waitingFor: string,
    reasoning: string
  ): PendingDecision {
    return {
      type: 'pending',
      skillName,
      partialParams,
      waitingFor,
      timeout: 300000,
      reasoning
    }
  }
  
  private createNoMatchDecision(reason: string): NoMatchDecision {
    return {
      type: 'no_match',
      reason,
      reasoning: reason
    }
  }
  
  // ==================== JSON 解析 ====================
  
  private parseJSON<T>(response: string): T | null {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      let jsonStr = (jsonMatch && jsonMatch[1]) ? jsonMatch[1] : response
      
      if (!jsonStr) {
        return null
      }
      
      // 清理可能的非 JSON 内容
      const jsonStart = jsonStr.indexOf('{')
      const jsonEnd = jsonStr.lastIndexOf('}')
      
      if (jsonStart === -1 || jsonEnd === -1) {
        return null
      }
      
      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1)
      
      return JSON.parse(jsonStr) as T
      
    } catch (error) {
      console.error('[SkillSelector] JSON 解析失败:', error)
      return null
    }
  }
  
  /**
   * 重置选择器状态
   */
  reset(sessionId: string): void {
    this.disclosureManager.reset()
    skillContextManager.clearActiveSkill(sessionId)
  }
  
  /**
   * 获取当前披露层级
   */
  getCurrentDisclosureLevel(): DisclosureLevel {
    return this.disclosureManager.getCurrentLevel()
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 Skill Selector 实例
 */
export function createSkillSelector(llmConfig: LLMConfig): SkillSelector {
  return new SkillSelector(llmConfig)
}
