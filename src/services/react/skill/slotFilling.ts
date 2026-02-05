/**
 * Slot Filling - 槽位填充与澄清机制
 * 
 * 设计目标：关键信息不完备时，模型必须主动与用户交互补齐信息
 * 
 * 核心原则：
 * - 禁止猜测：关键信息缺失时必须反问用户
 * - 禁止补全：不要假设任何未明确提供的信息
 * - 一次一问：需要澄清时，一次只问一个最关键的问题
 */

import type { 
  SkillSpec, 
  FieldSchema, 
  SkillContext,
  FieldExtractionResult
} from './skillTypes'
import { skillContextManager } from './skillContext'

// ==================== 槽位填充配置 ====================

interface SlotFillingConfig {
  maxQuestionsPerTurn: number
  allowContextInference: boolean
  inferenceConfidenceThreshold: number
}

const DEFAULT_CONFIG: SlotFillingConfig = {
  maxQuestionsPerTurn: 1,
  allowContextInference: true,
  inferenceConfidenceThreshold: 0.8
}

// ==================== 澄清问题生成 ====================

export function generateClarificationQuestion(
  field: FieldSchema,
  _context: SkillContext
): string {
  if (field.clarificationPrompt) {
    return field.clarificationPrompt
  }
  
  switch (field.type) {
    case 'date':
      return `请问具体是哪一天？（如：2024年1月15日、下周三、明天）`
    case 'time':
      return `请问具体是什么时间？（如：14:30、下午3点）`
    case 'datetime':
      return `请问具体是什么时候？（如：明天下午3点）`
    case 'string':
      if (field.enum && field.enum.length > 0) {
        return `请选择${field.description}：${field.enum.join('、')}`
      }
      return `请提供${field.description}`
    case 'number':
      return `请提供${field.description}（数字）`
    case 'boolean':
      return `请确认是否${field.description}？（是/否）`
    case 'array':
      return `请提供${field.description}（可以提供多个，用顿号分隔）`
    default:
      return `请提供${field.description}`
  }
}

export function generateFriendlyQuestion(
  _skillName: string,
  missingFields: FieldSchema[],
  existingParams: Record<string, any>,
  context: SkillContext
): string {
  if (missingFields.length === 0) {
    return ''
  }
  
  const primaryField = missingFields[0]
  if (!primaryField) {
    return ''
  }
  
  const question = generateClarificationQuestion(primaryField, context)
  
  const existingInfo = Object.entries(existingParams)
    .map(([k, v]) => `${k}: ${v}`)
    .join('，')
  
  if (existingInfo) {
    return `好的，我已经知道 ${existingInfo}。${question}`
  }
  
  return question
}

// ==================== 字段值提取 ====================

export function extractFieldValue(
  input: string,
  field: FieldSchema,
  context: SkillContext
): FieldExtractionResult | null {
  const inputLower = input.toLowerCase().trim()
  
  switch (field.type) {
    case 'date':
      return extractDateValue(input, field, context)
    case 'time':
      return extractTimeValue(input, field)
    case 'datetime':
      return extractDateTimeValue(input, field, context)
    case 'number':
      return extractNumberValue(input, field)
    case 'boolean':
      return extractBooleanValue(inputLower, field)
    case 'string':
      return extractStringValue(input, field)
    case 'array':
      return extractArrayValue(input, field)
    default:
      return null
  }
}

function extractDateValue(
  input: string,
  field: FieldSchema,
  context: SkillContext
): FieldExtractionResult | null {
  const today = new Date(context.currentDate)
  
  // 相对日期
  const relativeDates: Record<string, number> = {
    '今天': 0, '明天': 1, '后天': 2, '大后天': 3
  }
  
  for (const [keyword, offset] of Object.entries(relativeDates)) {
    if (input.includes(keyword)) {
      const date = new Date(today)
      date.setDate(date.getDate() + offset)
      return {
        field: field.name,
        value: date.toISOString().split('T')[0],
        confidence: 0.95,
        source: 'explicit'
      }
    }
  }
  
  // 下周X
  const weekdayMatch = input.match(/下周([一二三四五六日天])/)
  if (weekdayMatch && weekdayMatch[1]) {
    const weekdayMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0
    }
    const targetDay = weekdayMap[weekdayMatch[1]]
    if (targetDay !== undefined) {
      const currentDay = today.getDay()
      let daysToAdd = targetDay - currentDay
      if (daysToAdd <= 0) daysToAdd += 7
      daysToAdd += 7
      
      const date = new Date(today)
      date.setDate(date.getDate() + daysToAdd)
      return {
        field: field.name,
        value: date.toISOString().split('T')[0],
        confidence: 0.9,
        source: 'explicit'
      }
    }
  }
  
  // 这周X/周X
  const thisWeekMatch = input.match(/(?:这周|周)([一二三四五六日天])/)
  if (thisWeekMatch && thisWeekMatch[1]) {
    const weekdayMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0
    }
    const targetDay = weekdayMap[thisWeekMatch[1]]
    if (targetDay !== undefined) {
      const currentDay = today.getDay()
      let daysToAdd = targetDay - currentDay
      if (daysToAdd < 0) daysToAdd += 7
      
      const date = new Date(today)
      date.setDate(date.getDate() + daysToAdd)
      return {
        field: field.name,
        value: date.toISOString().split('T')[0],
        confidence: 0.85,
        source: 'explicit'
      }
    }
  }
  
  // 绝对日期 YYYY-MM-DD
  const fullDateMatch = input.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日号]?/)
  if (fullDateMatch && fullDateMatch[1] && fullDateMatch[2] && fullDateMatch[3]) {
    const year = parseInt(fullDateMatch[1])
    const month = parseInt(fullDateMatch[2])
    const day = parseInt(fullDateMatch[3])
    const date = new Date(year, month - 1, day)
    return {
      field: field.name,
      value: date.toISOString().split('T')[0],
      confidence: 0.95,
      source: 'explicit'
    }
  }
  
  // MM-DD
  const shortDateMatch = input.match(/(\d{1,2})[-/月](\d{1,2})[日号]?/)
  if (shortDateMatch && shortDateMatch[1] && shortDateMatch[2]) {
    const month = parseInt(shortDateMatch[1])
    const day = parseInt(shortDateMatch[2])
    const date = new Date(today.getFullYear(), month - 1, day)
    return {
      field: field.name,
      value: date.toISOString().split('T')[0],
      confidence: 0.9,
      source: 'explicit'
    }
  }
  
  return null
}

function extractTimeValue(
  input: string,
  field: FieldSchema
): FieldExtractionResult | null {
  // HH:MM
  const timeMatch = input.match(/(\d{1,2})[:.：](\d{2})/)
  if (timeMatch && timeMatch[1] && timeMatch[2]) {
    const hour = parseInt(timeMatch[1])
    const minute = parseInt(timeMatch[2])
    
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        field: field.name,
        value: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        confidence: 0.95,
        source: 'explicit'
      }
    }
  }
  
  // X点/X点半
  const hourMatch = input.match(/(\d{1,2})点(半)?/)
  if (hourMatch && hourMatch[1]) {
    let hour = parseInt(hourMatch[1])
    const isHalf = hourMatch[2] === '半'
    
    if (input.includes('下午') || input.includes('晚上')) {
      if (hour < 12) hour += 12
    }
    
    return {
      field: field.name,
      value: `${hour.toString().padStart(2, '0')}:${isHalf ? '30' : '00'}`,
      confidence: 0.9,
      source: 'explicit'
    }
  }
  
  return null
}

function extractDateTimeValue(
  input: string,
  field: FieldSchema,
  context: SkillContext
): FieldExtractionResult | null {
  const dateResult = extractDateValue(input, { ...field, type: 'date' }, context)
  const timeResult = extractTimeValue(input, { ...field, type: 'time' })
  
  if (dateResult && timeResult) {
    return {
      field: field.name,
      value: `${dateResult.value}T${timeResult.value}`,
      confidence: Math.min(dateResult.confidence, timeResult.confidence),
      source: 'explicit'
    }
  }
  
  if (dateResult) {
    return {
      field: field.name,
      value: `${dateResult.value}T09:00`,
      confidence: dateResult.confidence * 0.8,
      source: 'inferred'
    }
  }
  
  return null
}

function extractNumberValue(
  input: string,
  field: FieldSchema
): FieldExtractionResult | null {
  const match = input.match(/(\d+)/)
  if (match && match[1]) {
    const value = parseInt(match[1])
    
    if (field.validation) {
      if (field.validation.min !== undefined && value < field.validation.min) return null
      if (field.validation.max !== undefined && value > field.validation.max) return null
    }
    
    return {
      field: field.name,
      value,
      confidence: 0.9,
      source: 'explicit'
    }
  }
  return null
}

function extractBooleanValue(
  input: string,
  field: FieldSchema
): FieldExtractionResult | null {
  const positiveWords = ['是', '好', '对', '可以', '确认', '同意', 'yes', 'ok', '嗯']
  const negativeWords = ['否', '不', '取消', '不要', '不用', 'no', '算了']
  
  if (positiveWords.some(w => input.includes(w))) {
    return { field: field.name, value: true, confidence: 0.9, source: 'explicit' }
  }
  
  if (negativeWords.some(w => input.includes(w))) {
    return { field: field.name, value: false, confidence: 0.9, source: 'explicit' }
  }
  
  return null
}

function extractStringValue(
  input: string,
  field: FieldSchema
): FieldExtractionResult | null {
  if (field.enum && field.enum.length > 0) {
    const inputLower = input.toLowerCase()
    for (const option of field.enum) {
      if (inputLower.includes(option.toLowerCase())) {
        return { field: field.name, value: option, confidence: 0.95, source: 'explicit' }
      }
    }
    return null
  }
  
  if (input.trim().length > 0) {
    return { field: field.name, value: input.trim(), confidence: 0.7, source: 'explicit' }
  }
  
  return null
}

function extractArrayValue(
  input: string,
  field: FieldSchema
): FieldExtractionResult | null {
  const items = input.split(/[,，、;；\s]+/).filter(s => s.trim().length > 0)
  
  if (items.length > 0) {
    return { field: field.name, value: items, confidence: 0.8, source: 'explicit' }
  }
  
  return null
}

// ==================== 槽位填充管理器 ====================

export class SlotFillingManager {
  private config: SlotFillingConfig
  
  constructor(config?: Partial<SlotFillingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }
  
  processInput(
    userInput: string,
    spec: SkillSpec,
    context: SkillContext
  ): {
    filledSlots: FieldExtractionResult[]
    remainingFields: FieldSchema[]
    nextQuestion?: string
  } {
    const filledSlots: FieldExtractionResult[] = []
    const remainingFields: FieldSchema[] = []
    const existingParams = skillContextManager.getFilledParams(context.sessionId)
    
    for (const field of spec.input_schema) {
      if (existingParams[field.name] !== undefined) continue
      
      const extracted = extractFieldValue(userInput, field, context)
      
      if (extracted && extracted.confidence >= this.config.inferenceConfidenceThreshold) {
        filledSlots.push(extracted)
      } else if (spec.required_fields.includes(field.name)) {
        remainingFields.push(field)
      }
    }
    
    let nextQuestion: string | undefined
    if (remainingFields.length > 0) {
      const questionsToAsk = remainingFields.slice(0, this.config.maxQuestionsPerTurn)
      nextQuestion = generateFriendlyQuestion(
        spec.name,
        questionsToAsk,
        { ...existingParams, ...Object.fromEntries(filledSlots.map(s => [s.field, s.value])) },
        context
      )
    }
    
    return { filledSlots, remainingFields, nextQuestion }
  }
  
  isComplete(spec: SkillSpec, context: SkillContext): boolean {
    const filledParams = skillContextManager.getFilledParams(context.sessionId)
    return spec.required_fields.every(f => filledParams[f] !== undefined)
  }
  
  getMissingRequiredFields(spec: SkillSpec, context: SkillContext): FieldSchema[] {
    const filledParams = skillContextManager.getFilledParams(context.sessionId)
    return spec.input_schema.filter(field => 
      spec.required_fields.includes(field.name) && 
      filledParams[field.name] === undefined
    )
  }
}

export const slotFillingManager = new SlotFillingManager()
