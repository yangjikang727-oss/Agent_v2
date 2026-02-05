/**
 * Skill Executor - 技能执行模块（第三层）
 * 
 * 职责：
 * 1. 将结构化参数映射为真实系统操作
 * 2. 支持 API 调用、本地执行、脚本执行
 * 3. 返回 success/partial_success/error 状态
 * 4. 执行结果回流至推理层
 * 
 * 关键设计：
 * - 脚本代码永不进入 LLM 上下文
 * - 仅返回执行结果供后续推理使用
 */

import type {
  SkillSpec,
  SkillContext,
  SkillExecutionResult,
  ExecutionStatus,
  SkillExecutor
} from './skillTypes'

import { skillRegistry } from './skillRegistry'
import { skillContextManager } from './skillContext'
import { resourceManager } from './skillResources'

// ==================== 执行器类型 ====================

/** 执行器类型 */
export type ExecutorType = 'local' | 'api' | 'script'

/** 执行器配置 */
export interface ExecutorConfig {
  timeout: number
  retryCount: number
  retryDelay: number
}

const DEFAULT_CONFIG: ExecutorConfig = {
  timeout: 30000,
  retryCount: 2,
  retryDelay: 1000
}

// ==================== 本地执行器注册 ====================

/** 本地执行函数类型 */
export type LocalExecuteFn = (
  params: Record<string, any>,
  context: SkillContext
) => Promise<any>

/** 本地执行器映射 */
const localExecutors: Map<string, LocalExecuteFn> = new Map()

/**
 * 注册本地执行器
 */
export function registerLocalExecutor(
  skillName: string,
  executor: LocalExecuteFn
): void {
  localExecutors.set(skillName, executor)
  console.log(`[SkillExecutor] 注册本地执行器: ${skillName}`)
}

/**
 * 批量注册本地执行器
 */
export function registerLocalExecutors(
  executors: Record<string, LocalExecuteFn>
): void {
  Object.entries(executors).forEach(([name, executor]) => {
    registerLocalExecutor(name, executor)
  })
}

// ==================== API 执行器 ====================

/** API 配置 */
interface ApiConfig {
  baseUrl: string
  headers?: Record<string, string>
  timeout?: number
}

let apiConfig: ApiConfig | null = null

/**
 * 配置 API 执行器
 */
export function configureApiExecutor(config: ApiConfig): void {
  apiConfig = config
  console.log(`[SkillExecutor] API 执行器已配置: ${config.baseUrl}`)
}

/**
 * API 执行
 */
async function executeApi(
  spec: SkillSpec,
  params: Record<string, any>,
  _context: SkillContext
): Promise<any> {
  if (!apiConfig) {
    throw new Error('API 执行器未配置')
  }
  
  const endpoint = spec.apiEndpoint || `/skills/${spec.name}/execute`
  const url = `${apiConfig.baseUrl}${endpoint}`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...apiConfig.headers
    },
    body: JSON.stringify({ params }),
    signal: AbortSignal.timeout(apiConfig.timeout || 30000)
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API 调用失败: ${response.status} - ${errorText}`)
  }
  
  return response.json()
}

// ==================== 脚本执行器 ====================

/**
 * 脚本执行（通过资源管理器）
 */
async function executeScript(
  spec: SkillSpec,
  params: Record<string, any>
): Promise<any> {
  if (!spec.resources || spec.resources.length === 0) {
    throw new Error(`技能 "${spec.name}" 没有可执行的脚本资源`)
  }
  
  // 找到主脚本资源
  const scriptResource = spec.resources.find(r => r.type === 'script')
  
  if (!scriptResource) {
    throw new Error(`技能 "${spec.name}" 没有脚本类型的资源`)
  }
  
  // 通过资源管理器执行
  const result = await resourceManager.executeWithMapping(scriptResource, params)
  
  if (result.status === 'error') {
    throw new Error(result.error || '脚本执行失败')
  }
  
  return result.output
}

// ==================== 主执行器类 ====================

/**
 * 技能执行管理器
 */
export class SkillExecutorManager implements SkillExecutor {
  private config: ExecutorConfig
  
  constructor(config?: Partial<ExecutorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }
  
  /**
   * 执行技能
   */
  async execute(
    skillName: string,
    params: Record<string, any>,
    context: SkillContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now()
    
    console.log(`[SkillExecutor] 开始执行技能: ${skillName}`)
    console.log(`[SkillExecutor] 参数:`, params)
    
    // 获取技能规格
    const spec = skillRegistry.getSkillSpec(skillName)
    if (!spec) {
      return this.createErrorResult(
        skillName,
        params,
        'SKILL_NOT_FOUND',
        `技能 "${skillName}" 未注册`,
        startTime,
        false
      )
    }
    
    // 更新上下文状态
    skillContextManager.updateActiveSkillStatus(context.sessionId, 'executing')
    
    try {
      // 验证参数
      const validation = this.validateParams(skillName, params)
      if (!validation.valid) {
        return this.createErrorResult(
          skillName,
          params,
          'INVALID_PARAMS',
          validation.errors?.join(', ') || '参数验证失败',
          startTime,
          true
        )
      }
      
      // 检查前置条件
      const preconditions = await this.checkPreconditions(skillName, params, context)
      if (!preconditions.satisfied) {
        return this.createErrorResult(
          skillName,
          params,
          'PRECONDITION_FAILED',
          preconditions.violations?.join(', ') || '前置条件不满足',
          startTime,
          true
        )
      }
      
      // 根据执行器类型选择执行方式
      const executorType = spec.executorType || 'local'
      let data: any
      
      switch (executorType) {
        case 'local':
          data = await this.executeLocal(spec, params, context)
          break
        case 'api':
          data = await executeApi(spec, params, context)
          break
        case 'script':
          data = await executeScript(spec, params)
          break
        default:
          data = await this.executeLocal(spec, params, context)
      }
      
      // 更新上下文状态
      skillContextManager.updateActiveSkillStatus(context.sessionId, 'completed')
      
      const result: SkillExecutionResult = {
        status: 'success',
        skillName,
        params,
        data,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
      
      // 记录执行历史
      skillContextManager.addHistory(context.sessionId, skillName, result, '')
      
      console.log(`[SkillExecutor] 技能执行成功: ${skillName}`)
      
      return result
      
    } catch (error) {
      console.error(`[SkillExecutor] 技能执行失败: ${skillName}`, error)
      
      skillContextManager.updateActiveSkillStatus(context.sessionId, 'failed')
      
      return this.createErrorResult(
        skillName,
        params,
        'EXECUTION_ERROR',
        error instanceof Error ? error.message : '执行异常',
        startTime,
        true
      )
    }
  }
  
  /**
   * 本地执行
   */
  private async executeLocal(
    spec: SkillSpec,
    params: Record<string, any>,
    context: SkillContext
  ): Promise<any> {
    // 查找注册的本地执行器
    const executor = localExecutors.get(spec.name)
    
    if (executor) {
      return executor(params, context)
    }
    
    // 没有注册执行器，尝试通过 skillRegistry 执行
    const entry = skillRegistry.getSkill(spec.name)
    if (entry?.executor) {
      const result = await entry.executor.execute(spec.name, params, context)
      return result.data
    }
    
    // 默认返回参数确认（模拟执行）
    console.warn(`[SkillExecutor] 技能 "${spec.name}" 没有注册执行器，返回模拟结果`)
    return {
      message: `技能 "${spec.name}" 执行完成（模拟）`,
      params,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 验证参数
   */
  validateParams(
    skillName: string,
    params: Record<string, any>
  ): { valid: boolean; errors?: string[] } {
    const spec = skillRegistry.getSkillSpec(skillName)
    if (!spec) {
      return { valid: false, errors: ['技能未注册'] }
    }
    
    const errors: string[] = []
    
    // 检查必填字段
    for (const field of spec.required_fields) {
      if (params[field] === undefined || params[field] === null || params[field] === '') {
        const fieldSpec = spec.input_schema.find(f => f.name === field)
        errors.push(`缺少必填字段: ${fieldSpec?.description || field}`)
      }
    }
    
    // 检查字段类型和验证规则
    for (const field of spec.input_schema) {
      const value = params[field.name]
      if (value === undefined) continue
      
      // 类型检查
      if (!this.checkFieldType(value, field.type)) {
        errors.push(`字段 "${field.name}" 类型错误，期望 ${field.type}`)
      }
      
      // 枚举值检查
      if (field.enum && !field.enum.includes(value)) {
        errors.push(`字段 "${field.name}" 值无效，可选值: ${field.enum.join(', ')}`)
      }
      
      // 验证规则检查
      if (field.validation) {
        const validationErrors = this.checkValidation(value, field.validation, field.name)
        errors.push(...validationErrors)
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    }
  }
  
  /**
   * 检查字段类型
   */
  private checkFieldType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'array':
        return Array.isArray(value)
      case 'object':
        return typeof value === 'object' && !Array.isArray(value)
      case 'date':
      case 'time':
      case 'datetime':
        return typeof value === 'string' // 日期时间以字符串形式存储
      default:
        return true
    }
  }
  
  /**
   * 检查验证规则
   */
  private checkValidation(
    value: any,
    validation: { min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string },
    fieldName: string
  ): string[] {
    const errors: string[] = []
    
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        errors.push(`字段 "${fieldName}" 值不能小于 ${validation.min}`)
      }
      if (validation.max !== undefined && value > validation.max) {
        errors.push(`字段 "${fieldName}" 值不能大于 ${validation.max}`)
      }
    }
    
    if (typeof value === 'string') {
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        errors.push(`字段 "${fieldName}" 长度不能小于 ${validation.minLength}`)
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        errors.push(`字段 "${fieldName}" 长度不能大于 ${validation.maxLength}`)
      }
      if (validation.pattern) {
        const regex = new RegExp(validation.pattern)
        if (!regex.test(value)) {
          errors.push(`字段 "${fieldName}" 格式不正确`)
        }
      }
    }
    
    return errors
  }
  
  /**
   * 检查前置条件
   */
  async checkPreconditions(
    skillName: string,
    params: Record<string, any>,
    context: SkillContext
  ): Promise<{ satisfied: boolean; violations?: string[] }> {
    const spec = skillRegistry.getSkillSpec(skillName)
    if (!spec || !spec.constraints) {
      return { satisfied: true }
    }
    
    const violations: string[] = []
    
    for (const constraint of spec.constraints) {
      if (constraint.type !== 'precondition') continue
      
      // 简单的条件评估（实际项目中可以使用表达式引擎）
      const satisfied = await this.evaluateCondition(
        constraint.condition,
        params,
        context
      )
      
      if (!satisfied) {
        violations.push(constraint.violationMessage || constraint.description)
      }
    }
    
    return {
      satisfied: violations.length === 0,
      violations: violations.length > 0 ? violations : undefined
    }
  }
  
  /**
   * 评估条件（简单实现）
   */
  private async evaluateCondition(
    _condition: string,
    _params: Record<string, any>,
    _context: SkillContext
  ): Promise<boolean> {
    // 简单实现，实际项目中可以使用表达式引擎
    // 这里默认返回 true，表示条件满足
    return true
  }
  
  /**
   * 创建错误结果
   */
  private createErrorResult(
    skillName: string,
    params: Record<string, any>,
    code: string,
    message: string,
    startTime: number,
    recoverable: boolean
  ): SkillExecutionResult {
    return {
      status: 'error' as ExecutionStatus,
      skillName,
      params,
      error: {
        code,
        message,
        recoverable
      },
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * 带重试的执行
   */
  async executeWithRetry(
    skillName: string,
    params: Record<string, any>,
    context: SkillContext
  ): Promise<SkillExecutionResult> {
    let lastResult: SkillExecutionResult | null = null
    
    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      if (attempt > 0) {
        console.log(`[SkillExecutor] 第 ${attempt} 次重试: ${skillName}`)
        await this.delay(this.config.retryDelay * attempt)
      }
      
      lastResult = await this.execute(skillName, params, context)
      
      if (lastResult.status === 'success' || lastResult.status === 'partial_success') {
        return lastResult
      }
      
      // 如果错误不可恢复，不再重试
      if (lastResult.error && !lastResult.error.recoverable) {
        break
      }
    }
    
    return lastResult!
  }
  
  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ==================== 导出 ====================

export const skillExecutor = new SkillExecutorManager()
