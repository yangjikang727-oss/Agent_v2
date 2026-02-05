/**
 * Skill Registry - 技能注册中心
 * 
 * 用于统一管理系统中所有 Skill 的声明信息
 * 为模型推理提供候选能力集合
 * 
 * 支持三层渐进式披露机制：
 * - 第一层：元数据（~100 Token）
 * - 第二层：核心指令（~500 Token）
 * - 第三层：资源与代码（不进上下文）
 */

import type { 
  SkillSpec, 
  SkillExecutor, 
  SkillExecutionResult,
  SkillContext,
  MetadataInfo,
  InstructionInfo,
  ResourceInfo,
  DisclosureLevel
} from './skillTypes'

import {
  extractMetadata,
  extractInstruction,
  extractResourceInfo,
  DISCLOSURE_LEVELS
} from './skillTypes'

import { resourceManager } from './skillResources'

// ==================== 技能注册项 ====================

interface SkillEntry {
  spec: SkillSpec
  executor: SkillExecutor
  enabled: boolean
  registeredAt: string
  version: string
  /** 元数据缓存 */
  metadataCache?: MetadataInfo
  /** 指令缓存 */
  instructionCache?: InstructionInfo
  /** 资源信息缓存 */
  resourceCache?: ResourceInfo
  /** 估算的 Token 占用 */
  estimatedTokens?: {
    metadata: number
    instruction: number
  }
}

// ==================== Skill Registry 类 ====================

export class SkillRegistry {
  private skills: Map<string, SkillEntry> = new Map()
  private listeners: Array<(event: SkillRegistryEvent) => void> = []
  
  /**
   * 注册技能
   */
  registerSkill(spec: SkillSpec, executor: SkillExecutor): void {
    const existingSkill = this.skills.get(spec.name)
    
    if (existingSkill) {
      console.warn(`[SkillRegistry] 技能 ${spec.name} 已存在，将被覆盖`)
    }
    
    // 验证 Skill Spec
    const validation = this.validateSpec(spec)
    if (!validation.valid) {
      throw new Error(`[SkillRegistry] 技能 ${spec.name} 规格无效: ${validation.errors?.join(', ')}`)
    }
    
    const entry: SkillEntry = {
      spec,
      executor,
      enabled: true,
      registeredAt: new Date().toISOString(),
      version: spec.version || '1.0.0'
    }
    
    this.skills.set(spec.name, entry)
    console.log(`[SkillRegistry] 技能已注册: ${spec.name} (${spec.description})`)
    
    this.emit({
      type: 'skill_registered',
      skillName: spec.name,
      timestamp: entry.registeredAt
    })
  }
  
  /**
   * 批量注册技能
   */
  registerSkills(skills: Array<{ spec: SkillSpec; executor: SkillExecutor }>): void {
    skills.forEach(({ spec, executor }) => this.registerSkill(spec, executor))
  }
  
  /**
   * 注销技能
   */
  unregisterSkill(name: string): boolean {
    const result = this.skills.delete(name)
    if (result) {
      console.log(`[SkillRegistry] 技能已注销: ${name}`)
      this.emit({
        type: 'skill_unregistered',
        skillName: name,
        timestamp: new Date().toISOString()
      })
    }
    return result
  }
  
  /**
   * 获取技能的元数据（第一层）
   */
  getSkillMetadata(name: string): MetadataInfo | undefined {
    const entry = this.skills.get(name)
    if (!entry) return undefined
    
    if (!entry.metadataCache) {
      entry.metadataCache = extractMetadata(entry.spec)
    }
    
    return entry.metadataCache
  }
  
  /**
   * 获取技能的核心指令（第二层）
   */
  getSkillInstruction(name: string): InstructionInfo | undefined {
    const entry = this.skills.get(name)
    if (!entry) return undefined
    
    if (!entry.instructionCache) {
      entry.instructionCache = extractInstruction(entry.spec)
    }
    
    return entry.instructionCache
  }
  
  /**
   * 获取技能的资源信息（第三层）
   */
  getSkillResourceInfo(name: string): ResourceInfo | undefined {
    const entry = this.skills.get(name)
    if (!entry) return undefined
    
    if (!entry.resourceCache) {
      entry.resourceCache = extractResourceInfo(entry.spec)
    }
    
    return entry.resourceCache
  }
  
  /**
   * 根据披露层级获取技能信息
   */
  getSkillByDisclosureLevel(
    name: string, 
    level: DisclosureLevel
  ): MetadataInfo | InstructionInfo | ResourceInfo | undefined {
    switch (level) {
      case 'metadata':
        return this.getSkillMetadata(name)
      case 'instruction':
        return this.getSkillInstruction(name)
      case 'resource':
        return this.getSkillResourceInfo(name)
      default:
        return this.getSkillMetadata(name)
    }
  }
  
  /**
   * 获取所有技能的元数据（用于第一层快速匹配）
   */
  getAllMetadata(): MetadataInfo[] {
    return this.getEnabledSkills().map(entry => {
      if (!entry.metadataCache) {
        entry.metadataCache = extractMetadata(entry.spec)
      }
      return entry.metadataCache
    })
  }
  
  /**
   * 估算总 Token 占用
   */
  estimateTotalTokens(level: DisclosureLevel = 'metadata'): number {
    const entries = this.getEnabledSkills()
    
    if (level === 'metadata') {
      // 第一层：所有 Skill 的元数据
      return entries.length * DISCLOSURE_LEVELS.metadata.estimatedTokens
    }
    
    if (level === 'instruction') {
      // 第二层：单个 Skill 的指令
      return DISCLOSURE_LEVELS.instruction.estimatedTokens
    }
    
    // 第三层：代码不进上下文
    return 0
  }
  
  /**
   * 获取技能
   */
  getSkill(name: string): SkillEntry | undefined {
    return this.skills.get(name)
  }
  
  /**
   * 获取技能规格
   */
  getSkillSpec(name: string): SkillSpec | undefined {
    return this.skills.get(name)?.spec
  }
  
  /**
   * 获取技能执行器
   */
  getSkillExecutor(name: string): SkillExecutor | undefined {
    return this.skills.get(name)?.executor
  }
  
  /**
   * 获取所有技能
   */
  getAllSkills(): SkillEntry[] {
    return Array.from(this.skills.values())
  }
  
  /**
   * 获取所有启用的技能
   */
  getEnabledSkills(): SkillEntry[] {
    return this.getAllSkills().filter(entry => entry.enabled)
  }
  
  /**
   * 获取所有技能规格
   */
  getAllSpecs(): SkillSpec[] {
    return this.getEnabledSkills().map(entry => entry.spec)
  }
  
  /**
   * 按类别获取技能
   */
  getSkillsByCategory(category: SkillSpec['category']): SkillEntry[] {
    return this.getEnabledSkills().filter(entry => entry.spec.category === category)
  }
  
  /**
   * 按标签获取技能
   */
  getSkillsByTag(tag: string): SkillEntry[] {
    return this.getEnabledSkills().filter(entry => entry.spec.tags?.includes(tag))
  }
  
  /**
   * 检查技能是否存在
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name)
  }
  
  /**
   * 启用技能
   */
  enableSkill(name: string): boolean {
    const entry = this.skills.get(name)
    if (entry) {
      entry.enabled = true
      return true
    }
    return false
  }
  
  /**
   * 禁用技能
   */
  disableSkill(name: string): boolean {
    const entry = this.skills.get(name)
    if (entry) {
      entry.enabled = false
      return true
    }
    return false
  }
  
  /**
   * 执行技能
   */
  async executeSkill(
    name: string, 
    params: Record<string, any>, 
    context: SkillContext
  ): Promise<SkillExecutionResult> {
    const entry = this.skills.get(name)
    
    if (!entry) {
      return {
        status: 'error',
        skillName: name,
        params,
        error: {
          code: 'SKILL_NOT_FOUND',
          message: `技能 "${name}" 不存在`,
          recoverable: false
        },
        executionTime: 0,
        timestamp: new Date().toISOString()
      }
    }
    
    if (!entry.enabled) {
      return {
        status: 'error',
        skillName: name,
        params,
        error: {
          code: 'SKILL_DISABLED',
          message: `技能 "${name}" 已禁用`,
          recoverable: false
        },
        executionTime: 0,
        timestamp: new Date().toISOString()
      }
    }
    
    const startTime = Date.now()
    
    try {
      // 验证参数
      if (entry.executor.validateParams) {
        const validation = entry.executor.validateParams(name, params)
        if (!validation.valid) {
          return {
            status: 'error',
            skillName: name,
            params,
            error: {
              code: 'INVALID_PARAMS',
              message: validation.errors?.join(', ') || '参数验证失败',
              recoverable: true
            },
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }
        }
      }
      
      // 检查前置条件
      if (entry.executor.checkPreconditions) {
        const preconditions = await entry.executor.checkPreconditions(name, params, context)
        if (!preconditions.satisfied) {
          return {
            status: 'error',
            skillName: name,
            params,
            error: {
              code: 'PRECONDITION_FAILED',
              message: preconditions.violations?.join(', ') || '前置条件不满足',
              recoverable: true
            },
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString()
          }
        }
      }
      
      // 执行技能
      const result = await entry.executor.execute(name, params, context)
      
      this.emit({
        type: 'skill_executed',
        skillName: name,
        status: result.status,
        timestamp: result.timestamp
      })
      
      return result
      
    } catch (error) {
      return {
        status: 'error',
        skillName: name,
        params,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : '执行异常',
          recoverable: true
        },
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    }
  }
  
  /**
   * 获取技能摘要（用于 LLM 提示词）
   */
  getSkillsSummary(): string {
    const skills = this.getEnabledSkills()
    
    return skills.map(entry => {
      const spec = entry.spec
      const requiredFields = spec.required_fields.join(', ')
      
      return `【${spec.name}】
  描述: ${spec.description}
  适用: ${spec.when_to_use}
  必填: ${requiredFields || '无'}
  组合: ${spec.composable ? '支持' : '不支持'}
  延迟: ${spec.deferred_allowed ? '支持' : '不支持'}`
    }).join('\n\n')
  }
  
  /**
   * 获取技能 JSON Schema（用于结构化输出）
   */
  getSkillsSchema(): object {
    const skills = this.getEnabledSkills()
    
    return {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: {
            type: 'object',
            properties: skills.reduce((acc, entry) => {
              acc[entry.spec.name] = {
                type: 'object',
                description: entry.spec.description,
                properties: entry.spec.input_schema.reduce((props, field) => {
                  props[field.name] = {
                    type: field.type,
                    description: field.description,
                    required: field.required
                  }
                  return props
                }, {} as Record<string, any>)
              }
              return acc
            }, {} as Record<string, any>)
          }
        }
      }
    }
  }
  
  /**
   * 验证 Skill Spec
   */
  validateSpec(spec: SkillSpec): { valid: boolean; errors?: string[] } {
    const errors: string[] = []
    
    if (!spec.name || spec.name.trim() === '') {
      errors.push('技能名称不能为空')
    }
    
    if (!spec.description || spec.description.trim() === '') {
      errors.push('技能描述不能为空')
    }
    
    if (!spec.when_to_use || spec.when_to_use.trim() === '') {
      errors.push('适用条件不能为空')
    }
    
    if (!spec.input_schema || !Array.isArray(spec.input_schema)) {
      errors.push('输入 Schema 必须是数组')
    }
    
    // 验证必填字段是否都在 input_schema 中定义
    if (spec.required_fields && spec.input_schema) {
      const fieldNames = new Set(spec.input_schema.map(f => f.name))
      spec.required_fields.forEach(field => {
        if (!fieldNames.has(field)) {
          errors.push(`必填字段 "${field}" 未在 input_schema 中定义`)
        }
      })
    }
    
    // 验证 SOP（如果有）
    if (spec.sop) {
      if (!spec.sop.name || spec.sop.name.trim() === '') {
        errors.push('SOP 名称不能为空')
      }
      
      if (!spec.sop.steps || spec.sop.steps.length === 0) {
        errors.push('SOP 步骤不能为空')
      } else {
        // 验证步骤序号连续性
        const stepNumbers = spec.sop.steps.map(s => s.step).sort((a, b) => a - b)
        for (let i = 0; i < stepNumbers.length; i++) {
          if (stepNumbers[i] !== i + 1) {
            errors.push(`SOP 步骤序号不连续，缺少步骤 ${i + 1}`)
            break
          }
        }
      }
    }
    
    // 验证资源（如果有）
    if (spec.resources) {
      const resourceIds = new Set<string>()
      spec.resources.forEach((resource, index) => {
        if (!resource.id) {
          errors.push(`资源 #${index + 1} 缺少 id`)
        } else if (resourceIds.has(resource.id)) {
          errors.push(`资源 id "${resource.id}" 重复`)
        } else {
          resourceIds.add(resource.id)
        }
        
        if (!resource.type) {
          errors.push(`资源 "${resource.id || index}" 缺少 type`)
        }
      })
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }
  
  /**
   * 清空所有技能
   */
  clear(): void {
    this.skills.clear()
    console.log('[SkillRegistry] 所有技能已清空')
  }
  
  /**
   * 获取统计信息
   */
  getStats(): {
    total: number
    enabled: number
    disabled: number
    byCategory: Record<string, number>
    byExecutorType: Record<string, number>
    totalMetadataTokens: number
    skillsWithSOP: number
    skillsWithResources: number
  } {
    const all = this.getAllSkills()
    const enabled = all.filter(e => e.enabled)
    const disabled = all.filter(e => !e.enabled)
    
    const byCategory: Record<string, number> = {}
    const byExecutorType: Record<string, number> = {}
    let skillsWithSOP = 0
    let skillsWithResources = 0
    
    all.forEach(entry => {
      const cat = entry.spec.category || 'uncategorized'
      byCategory[cat] = (byCategory[cat] || 0) + 1
      
      const execType = entry.spec.executorType || 'local'
      byExecutorType[execType] = (byExecutorType[execType] || 0) + 1
      
      if (entry.spec.sop) skillsWithSOP++
      if (entry.spec.resources && entry.spec.resources.length > 0) skillsWithResources++
    })
    
    return {
      total: all.length,
      enabled: enabled.length,
      disabled: disabled.length,
      byCategory,
      byExecutorType,
      totalMetadataTokens: enabled.length * DISCLOSURE_LEVELS.metadata.estimatedTokens,
      skillsWithSOP,
      skillsWithResources
    }
  }
  
  /**
   * 加载 Skill 的所有资源元信息
   */
  async loadSkillResources(name: string): Promise<Map<string, any>> {
    const entry = this.skills.get(name)
    if (!entry) {
      return new Map()
    }
    
    return resourceManager.loadSkillResources(entry.spec)
  }
  
  /**
   * 执行 Skill 资源
   */
  async executeSkillResource(
    skillName: string,
    resourceId: string,
    params: Record<string, any>
  ): Promise<any> {
    const entry = this.skills.get(skillName)
    if (!entry) {
      throw new Error(`Skill "${skillName}" 不存在`)
    }
    
    const resource = entry.spec.resources?.find(r => r.id === resourceId)
    if (!resource) {
      throw new Error(`资源 "${resourceId}" 在 Skill "${skillName}" 中不存在`)
    }
    
    return resourceManager.executeWithMapping(resource, params)
  }
  
  // ==================== 事件系统 ====================
  
  /**
   * 订阅事件
   */
  subscribe(listener: (event: SkillRegistryEvent) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }
  
  private emit(event: SkillRegistryEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('[SkillRegistry] 事件处理异常:', error)
      }
    })
  }
}

// ==================== 事件类型 ====================

export interface SkillRegistryEvent {
  type: 'skill_registered' | 'skill_unregistered' | 'skill_executed'
  skillName: string
  status?: string
  timestamp: string
}

// ==================== 全局实例 ====================

export const skillRegistry = new SkillRegistry()
