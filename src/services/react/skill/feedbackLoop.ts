/**
 * Feedback Loop - 反馈与自愈模块
 * 
 * 职责：
 * 1. 基于执行结果进行二次推理
 * 2. 处理时间冲突、权限不足、资源不可用等场景
 * 3. 提供可行的替代方案或建议用户操作
 * 
 * 核心场景：
 * - 时间冲突 → 建议调整时间
 * - 权限不足 → 提示所需权限
 * - 资源不可用 → 推荐替代资源
 * - 部分成功 → 报告已完成部分，请求补充
 */

import type {
  SkillExecutionResult,
  SkillContext,
  FeedbackInfo,
  FeedbackType,
  SelfHealingDecision
} from './skillTypes'

import { callLLMRaw, type LLMConfig } from '../../core/llmCore'
import { skillRegistry } from './skillRegistry'

// ==================== 反馈分析器 ====================

/** 反馈分析结果 */
interface FeedbackAnalysis {
  type: FeedbackType
  severity: 'low' | 'medium' | 'high' | 'critical'
  canAutoRecover: boolean
  suggestedActions: string[]
  userMessage: string
}

/**
 * 分析执行结果，生成反馈信息
 */
export function analyzeFeedback(result: SkillExecutionResult): FeedbackAnalysis {
  // 成功情况
  if (result.status === 'success') {
    return {
      type: 'success',
      severity: 'low',
      canAutoRecover: false,
      suggestedActions: [],
      userMessage: generateSuccessMessage(result)
    }
  }
  
  // 部分成功
  if (result.status === 'partial_success') {
    return {
      type: 'success',
      severity: 'medium',
      canAutoRecover: true,
      suggestedActions: ['完成剩余部分', '确认已完成内容'],
      userMessage: generatePartialSuccessMessage(result)
    }
  }
  
  // 错误情况
  if (result.error) {
    return analyzeError(result)
  }
  
  // 默认
  return {
    type: 'system_error',
    severity: 'high',
    canAutoRecover: false,
    suggestedActions: ['重试', '联系管理员'],
    userMessage: '操作未完成，请稍后重试。'
  }
}

/**
 * 分析错误类型
 */
function analyzeError(result: SkillExecutionResult): FeedbackAnalysis {
  const errorCode = result.error?.code || ''
  const errorMessage = result.error?.message || ''
  
  // 时间冲突
  if (errorCode === 'TIME_CONFLICT' || errorMessage.includes('时间冲突')) {
    return {
      type: 'conflict',
      severity: 'medium',
      canAutoRecover: true,
      suggestedActions: ['调整时间', '查看冲突详情', '强制创建'],
      userMessage: `检测到时间冲突：${errorMessage}。是否需要调整时间？`
    }
  }
  
  // 权限不足
  if (errorCode === 'PERMISSION_DENIED' || errorMessage.includes('权限')) {
    return {
      type: 'permission_denied',
      severity: 'high',
      canAutoRecover: false,
      suggestedActions: ['申请权限', '联系管理员', '使用替代方案'],
      userMessage: `权限不足：${errorMessage}。请联系管理员获取相应权限。`
    }
  }
  
  // 资源不可用
  if (errorCode === 'RESOURCE_UNAVAILABLE' || errorMessage.includes('不可用')) {
    return {
      type: 'resource_unavailable',
      severity: 'medium',
      canAutoRecover: true,
      suggestedActions: ['选择其他资源', '等待资源释放', '取消操作'],
      userMessage: `资源不可用：${errorMessage}。是否需要推荐其他选项？`
    }
  }
  
  // 验证错误
  if (errorCode === 'INVALID_PARAMS' || errorCode === 'VALIDATION_ERROR') {
    return {
      type: 'validation_error',
      severity: 'medium',
      canAutoRecover: true,
      suggestedActions: ['修正参数', '查看字段要求'],
      userMessage: `参数验证失败：${errorMessage}。请检查并修正。`
    }
  }
  
  // 系统错误
  return {
    type: 'system_error',
    severity: 'high',
    canAutoRecover: result.error?.recoverable || false,
    suggestedActions: ['重试', '稍后再试', '联系支持'],
    userMessage: `操作失败：${errorMessage}。`
  }
}

/**
 * 生成成功消息
 */
function generateSuccessMessage(result: SkillExecutionResult): string {
  const skillName = result.skillName
  
  // 根据技能类型生成不同的消息
  if (skillName.includes('meeting') || skillName.includes('会议')) {
    return `会议已成功创建。`
  }
  if (skillName.includes('trip') || skillName.includes('出差')) {
    return `出差申请已成功提交。`
  }
  if (skillName.includes('notify') || skillName.includes('通知')) {
    return `通知已发送。`
  }
  
  return `操作已完成。`
}

/**
 * 生成部分成功消息
 */
function generatePartialSuccessMessage(result: SkillExecutionResult): string {
  return `操作部分完成。${result.data?.message || '请查看详情并完成剩余部分。'}`
}

// ==================== 自愈决策器 ====================

/**
 * 自愈决策器 - 基于 LLM 推理生成自愈方案
 */
export class SelfHealingEngine {
  private llmConfig: LLMConfig
  
  constructor(llmConfig: LLMConfig) {
    this.llmConfig = llmConfig
  }
  
  /**
   * 生成自愈决策
   */
  async generateDecision(
    feedback: FeedbackInfo,
    context: SkillContext
  ): Promise<SelfHealingDecision> {
    console.log('[SelfHealing] 生成自愈决策:', feedback.type)
    
    // 如果可以自动恢复，尝试 LLM 推理
    if (feedback.possibleSolutions.length > 0) {
      try {
        return await this.llmDecision(feedback, context)
      } catch (error) {
        console.error('[SelfHealing] LLM 决策失败:', error)
      }
    }
    
    // 兜底：选择第一个解决方案或询问用户
    return this.fallbackDecision(feedback)
  }
  
  /**
   * LLM 推理决策
   */
  private async llmDecision(
    feedback: FeedbackInfo,
    context: SkillContext
  ): Promise<SelfHealingDecision> {
    const systemPrompt = `你是一个智能助手的自愈推理模块。

根据执行反馈，选择最合适的恢复方案。

## 输出格式
\`\`\`json
{
  "solutionId": "选择的方案ID",
  "reasoning": "选择理由",
  "userQuestion": "需要问用户的问题（可选）",
  "modifiedParams": { "修改后的参数（可选）" }
}
\`\`\``

    const userPrompt = `# 执行反馈
类型: ${feedback.type}
问题: ${feedback.problem}
原始结果: ${JSON.stringify(feedback.originalResult)}

# 可选方案
${feedback.possibleSolutions.map(s => `- ${s.id}: ${s.description} [${s.action}]`).join('\n')}

# 上下文
日期: ${context.currentDate}
用户: ${context.userId}

请选择最合适的恢复方案。`

    const response = await callLLMRaw(userPrompt, systemPrompt, this.llmConfig)
    
    if (response) {
      try {
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
        const jsonStr = jsonMatch ? jsonMatch[1] : response
        const parsed = JSON.parse(jsonStr || '{}')
        
        return {
          solutionId: parsed.solutionId || feedback.possibleSolutions[0]?.id || 'ask_user',
          reasoning: parsed.reasoning || 'LLM 推理决策',
          userQuestion: parsed.userQuestion,
          modifiedParams: parsed.modifiedParams
        }
      } catch {
        // JSON 解析失败
      }
    }
    
    return this.fallbackDecision(feedback)
  }
  
  /**
   * 兜底决策
   */
  private fallbackDecision(feedback: FeedbackInfo): SelfHealingDecision {
    // 优先选择 ask_user 方案
    const askUserSolution = feedback.possibleSolutions.find(s => s.action === 'ask_user')
    if (askUserSolution) {
      return {
        solutionId: askUserSolution.id,
        reasoning: '需要用户确认',
        userQuestion: askUserSolution.description
      }
    }
    
    // 选择第一个可用方案
    const firstSolution = feedback.possibleSolutions[0]
    if (firstSolution) {
      return {
        solutionId: firstSolution.id,
        reasoning: '选择默认方案'
      }
    }
    
    // 无方案可选
    return {
      solutionId: 'cancel',
      reasoning: '无可用恢复方案'
    }
  }
}

// ==================== 反馈循环管理器 ====================

/**
 * 反馈循环管理器
 */
export class FeedbackLoopManager {
  private selfHealingEngine: SelfHealingEngine
  
  constructor(llmConfig: LLMConfig) {
    this.selfHealingEngine = new SelfHealingEngine(llmConfig)
  }
  
  /**
   * 处理执行结果
   */
  async handleResult(
    result: SkillExecutionResult,
    context: SkillContext
  ): Promise<{
    shouldRetry: boolean
    decision?: SelfHealingDecision
    userMessage: string
    modifiedParams?: Record<string, any>
  }> {
    // 分析反馈
    const analysis = analyzeFeedback(result)
    
    console.log('[FeedbackLoop] 反馈分析:', analysis.type, analysis.severity)
    
    // 成功情况
    if (analysis.type === 'success' && result.status === 'success') {
      return {
        shouldRetry: false,
        userMessage: analysis.userMessage
      }
    }
    
    // 部分成功
    if (result.status === 'partial_success') {
      return {
        shouldRetry: false,
        userMessage: analysis.userMessage
      }
    }
    
    // 不可恢复的错误
    if (!analysis.canAutoRecover) {
      return {
        shouldRetry: false,
        userMessage: analysis.userMessage
      }
    }
    
    // 构建反馈信息
    const feedbackInfo = this.buildFeedbackInfo(result, analysis)
    
    // 生成自愈决策
    const decision = await this.selfHealingEngine.generateDecision(feedbackInfo, context)
    
    console.log('[FeedbackLoop] 自愈决策:', decision.solutionId, decision.reasoning)
    
    // 根据决策返回结果
    return this.processDecision(decision, analysis)
  }
  
  /**
   * 构建反馈信息
   */
  private buildFeedbackInfo(
    result: SkillExecutionResult,
    analysis: FeedbackAnalysis
  ): FeedbackInfo {
    return {
      type: analysis.type,
      originalResult: result,
      problem: result.error?.message || '执行失败',
      possibleSolutions: this.generateSolutions(result, analysis)
    }
  }
  
  /**
   * 生成可能的解决方案
   */
  private generateSolutions(
    result: SkillExecutionResult,
    analysis: FeedbackAnalysis
  ): FeedbackInfo['possibleSolutions'] {
    const solutions: FeedbackInfo['possibleSolutions'] = []
    
    // 时间冲突场景
    if (analysis.type === 'conflict') {
      solutions.push(
        {
          id: 'adjust_time',
          description: '自动调整到下一个可用时间段',
          action: 'modify_params'
        },
        {
          id: 'ask_time',
          description: '询问用户希望调整到什么时间',
          action: 'ask_user'
        },
        {
          id: 'force_create',
          description: '强制创建（忽略冲突）',
          action: 'retry',
          params: { force: true }
        }
      )
    }
    
    // 资源不可用场景
    if (analysis.type === 'resource_unavailable') {
      solutions.push(
        {
          id: 'find_alternative',
          description: '查找替代资源',
          action: 'use_alternative'
        },
        {
          id: 'wait_retry',
          description: '等待后重试',
          action: 'retry'
        },
        {
          id: 'cancel',
          description: '取消操作',
          action: 'cancel'
        }
      )
    }
    
    // 验证错误场景
    if (analysis.type === 'validation_error') {
      solutions.push(
        {
          id: 'ask_correct',
          description: '询问用户修正参数',
          action: 'ask_user'
        },
        {
          id: 'cancel',
          description: '取消操作',
          action: 'cancel'
        }
      )
    }
    
    // 通用方案
    if (result.error?.recoverable) {
      solutions.push({
        id: 'retry',
        description: '重试操作',
        action: 'retry'
      })
    }
    
    solutions.push({
      id: 'cancel',
      description: '取消并告知用户',
      action: 'cancel'
    })
    
    return solutions
  }
  
  /**
   * 处理决策结果
   */
  private processDecision(
    decision: SelfHealingDecision,
    analysis: FeedbackAnalysis
  ): {
    shouldRetry: boolean
    decision?: SelfHealingDecision
    userMessage: string
    modifiedParams?: Record<string, any>
  } {
    switch (decision.solutionId) {
      case 'retry':
        return {
          shouldRetry: true,
          decision,
          userMessage: '正在重试...'
        }
      
      case 'adjust_time':
      case 'find_alternative':
        return {
          shouldRetry: true,
          decision,
          userMessage: '正在寻找替代方案...',
          modifiedParams: decision.modifiedParams
        }
      
      case 'ask_time':
      case 'ask_correct':
        return {
          shouldRetry: false,
          decision,
          userMessage: decision.userQuestion || '请提供更多信息'
        }
      
      case 'cancel':
      default:
        return {
          shouldRetry: false,
          decision,
          userMessage: analysis.userMessage
        }
    }
  }
  
  /**
   * 查找替代技能
   */
  findAlternativeSkill(skillName: string): string | undefined {
    const spec = skillRegistry.getSkillSpec(skillName)
    if (!spec) return undefined
    
    // 查找同类别的其他技能
    const category = spec.category
    if (!category) return undefined
    
    const alternatives = skillRegistry.getSkillsByCategory(category)
      .filter(e => e.spec.name !== skillName && e.enabled)
    
    return alternatives[0]?.spec.name
  }
}

// ==================== 导出 ====================

export function createFeedbackLoop(llmConfig: LLMConfig): FeedbackLoopManager {
  return new FeedbackLoopManager(llmConfig)
}
