/**
 * 表单补全 LLM 提示词
 * 用于从用户输入中提取表单字段值
 */

import { MEETING_FORM_FIELDS, TRIP_FORM_FIELDS, type FormFieldMeta } from './formFields'

/**
 * 构建字段提取 prompt
 * 让 LLM 从用户输入中提取指定字段的值
 */
export function buildFormExtractionPrompt(
  formType: 'meeting' | 'trip',
  missingFields: string[],
  userInput: string,
  currentAskingField?: string  // 当前正在询问的字段
): string {
  const fields = formType === 'meeting' ? MEETING_FORM_FIELDS : TRIP_FORM_FIELDS
  
  // 构建字段描述
  const fieldDescriptions = missingFields.map(fieldKey => {
    const meta = fields[fieldKey] as FormFieldMeta | undefined
    if (!meta) return `- ${fieldKey}`
    
    let desc = `- ${fieldKey} (${meta.label})`
    if (meta.type === 'select' && meta.options) {
      desc += `, 可选值: ${meta.options.join('/')}`
    }
    // 标注当前正在询问的字段
    if (fieldKey === currentAskingField) {
      desc += ' [当前询问]'
    }
    return desc
  }).join('\n')

  // 会议表单特殊处理：添加时长识别说明
  const durationNote = formType === 'meeting' && missingFields.includes('endTime')
    ? `\n- duration (会议时长), 如用户说"1小时"、"半小时"、"90分钟"等`
    : ''

  // 根据表单类型生成不同的示例
  const examples = formType === 'meeting' 
    ? `- 用户说"下午3点开始，开1小时" → {"startTime": "15:00", "duration": "1小时"}
- 用户说"A会议室" → {"location": "A会议室"}
- 用户说"中型" → {"roomType": "中型会议室"}`
    : `- 当前询问"返回日期"，用户说"后天" → {"endDate": "后天"}
- 当前询问"返回时间"，用户说"晚上8点" → {"endTime": "20:00"}
- 当前询问"返回时间"，用户说"下午5点半" → {"endTime": "17:30"}
- 当前询问"出行方式"，用户说"飞机" → {"transport": "飞机"}
- 当前询问"出差事由"，用户说"客户拜访" → {"reason": "客户拜访"}`

  // 当前日期（供相对日期转换参考）
  const today = new Date()
  const dateInfo = `今天是 ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return `你是一个表单字段提取助手。请从用户输入中提取以下字段的值。

当前表单类型: ${formType === 'meeting' ? '会议创建' : '出差申请'}
${dateInfo}
${currentAskingField ? `当前正在询问: ${fields[currentAskingField]?.label || currentAskingField}` : ''}

需要提取的字段:
${fieldDescriptions}${durationNote}

用户输入: "${userInput}"

请提取用户输入中涉及的字段值，以 JSON 格式返回。
注意:
1. 用户的回答通常对应当前正在询问的字段，请优先匹配 [当前询问] 标注的字段
2. **必须使用上方列出的字段名（如 endDate, transport, reason），不要使用其他名称**
3. 相对日期保持原样返回（如"后天"、"明天"、"下周一"），后续会统一转换
4. 具体日期请转换为 YYYY-MM-DD 格式（如"2月15号" → "2026-02-15"）
5. 时间字段请转换为标准格式 (如 "15:00")
6. 如果用户输入不包含任何有效字段信息，返回空对象 {}

示例:
${examples}

请直接返回 JSON，不要添加任何解释文字。`
}

/**
 * 构建下一个问题的 prompt
 * 生成友好的询问语
 */
export function buildAskFieldPrompt(
  formType: 'meeting' | 'trip',
  fieldKey: string,
  currentData: Record<string, any>
): string {
  const fields = formType === 'meeting' ? MEETING_FORM_FIELDS : TRIP_FORM_FIELDS
  const meta = fields[fieldKey] as FormFieldMeta | undefined
  
  if (!meta) {
    return `请提供 ${fieldKey}`
  }

  // 如果有选项，在提示中列出
  if (meta.type === 'select' && meta.options) {
    return `${meta.askPrompt} (${meta.options.join('/')})`
  }

  // 会议表单：endTime 询问时可以提供时长选项
  if (formType === 'meeting' && fieldKey === 'endTime' && currentData.startTime) {
    return `${meta.askPrompt} 或者说明会议时长（如"1小时"、"2小时"）`
  }

  return meta.askPrompt
}

/**
 * 构建表单完成确认消息
 */
export function buildFormCompleteMessage(formType: 'meeting' | 'trip'): string {
  return formType === 'meeting' 
    ? '会议信息已完善，请确认并提交：'
    : '出差申请信息已完善，请确认并提交：'
}

/**
 * 构建欢迎/开始消息
 */
export function buildFormStartMessage(
  formType: 'meeting' | 'trip',
  preFilledFields: string[]
): string {
  const prefix = formType === 'meeting' ? '好的，我来帮你创建会议。' : '好的，我来帮你申请出差。'
  
  if (preFilledFields.length > 0) {
    const fields = formType === 'meeting' ? MEETING_FORM_FIELDS : TRIP_FORM_FIELDS
    const filledLabels = preFilledFields
      .map(key => (fields[key] as FormFieldMeta | undefined)?.label || key)
      .join('、')
    return `${prefix}已识别到${filledLabels}。`
  }
  
  return prefix
}

/**
 * 解析 LLM 返回的 JSON 结果
 */
export function parseExtractedFields(llmResponse: string): Record<string, any> {
  try {
    // 尝试提取 JSON 块
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {}
    }
    return JSON.parse(jsonMatch[0])
  } catch {
    console.warn('Failed to parse LLM response as JSON:', llmResponse)
    return {}
  }
}

/**
 * 处理时间相关的智能转换
 * 如果用户输入"1小时"、"半小时"等，结合 startTime 计算 endTime
 */
export function processTimeFields(
  extracted: Record<string, any>,
  currentData: Record<string, any>
): Record<string, any> {
  const result = { ...extracted }

  // 获取 startTime：优先用新提取的，否则用已有的
  const effectiveStartTime = extracted.startTime || currentData.startTime

  // 处理相对时长 -> endTime 转换
  if (extracted.duration && effectiveStartTime && !extracted.endTime) {
    const durationStr = String(extracted.duration)
    let totalMinutes = 0
    
    // 支持多种时长表达
    if (durationStr.includes('半小时') || durationStr.includes('半个小时')) {
      totalMinutes = 30
    } else {
      // 匹配 "1小时"、"2小时"、"90分钟" 等
      const hourMatch = durationStr.match(/(\d+)\s*(小时|hour)/i)
      const minMatch = durationStr.match(/(\d+)\s*(分钟|分|min)/i)
      
      if (hourMatch && hourMatch[1]) {
        totalMinutes += parseInt(hourMatch[1]) * 60
      }
      if (minMatch && minMatch[1]) {
        totalMinutes += parseInt(minMatch[1])
      }
    }
    
    if (totalMinutes > 0) {
      // 解析 startTime (支持 "HH:mm" 或 "YYYY-MM-DDTHH:mm" 格式)
      const timeMatch = effectiveStartTime.match(/(\d{2}):(\d{2})/)
      if (timeMatch && timeMatch[1] && timeMatch[2]) {
        let hours = parseInt(timeMatch[1])
        let minutes = parseInt(timeMatch[2])
        
        // 加上时长
        minutes += totalMinutes
        hours += Math.floor(minutes / 60)
        minutes = minutes % 60
        hours = hours % 24
        
        // 保留日期部分（如果有的话）
        const dateMatch = effectiveStartTime.match(/^(\d{4}-\d{2}-\d{2}[T ])/)
        const datePrefix = dateMatch ? dateMatch[1] : ''
        result.endTime = `${datePrefix}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      }
    }
    delete result.duration
  }

  return result
}

/**
 * 处理相对日期转换
 * 将"今天"、"明天"、"后天"、"大后天"等转换为具体日期
 */
export function processRelativeDates(
  extracted: Record<string, any>,
  referenceDate?: string  // 参考日期（如出发日期）
): Record<string, any> {
  const result = { ...extracted }
  const today = new Date()
  
  // 日期字段列表
  const dateFields = ['startDate', 'endDate', 'date']
  
  for (const field of dateFields) {
    if (result[field] && typeof result[field] === 'string') {
      const dateStr = result[field]
      
      // 已经是标准格式，跳过
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) continue
      
      let targetDate: Date | null = null
      
      // 相对日期处理
      if (dateStr.includes('今天') || dateStr === '今日') {
        targetDate = new Date(today)
      } else if (dateStr.includes('明天') || dateStr === '明日') {
        targetDate = new Date(today)
        targetDate.setDate(targetDate.getDate() + 1)
      } else if (dateStr.includes('后天')) {
        targetDate = new Date(today)
        targetDate.setDate(targetDate.getDate() + 2)
      } else if (dateStr.includes('大后天')) {
        targetDate = new Date(today)
        targetDate.setDate(targetDate.getDate() + 3)
      } else if (dateStr.includes('下周')) {
        // 下周X
        targetDate = new Date(today)
        const dayMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }
        const dayMatch = dateStr.match(/下周([一二三四五六日天])/)
        if (dayMatch && dayMatch[1]) {
          const targetDay = dayMap[dayMatch[1]]
          if (targetDay !== undefined) {
            const currentDay = today.getDay()
            let daysToAdd = (7 - currentDay + targetDay) % 7
            if (daysToAdd === 0) daysToAdd = 7 // 下周同一天
            daysToAdd += 7 // 确保是下周
            if (daysToAdd > 7) daysToAdd -= 7
            targetDate.setDate(targetDate.getDate() + daysToAdd + 7)
          }
        }
      } else if (/(\d{1,2})[号日]/.test(dateStr)) {
        // X号/X日
        const dayMatch = dateStr.match(/(\d{1,2})[号日]/)
        if (dayMatch && dayMatch[1]) {
          targetDate = new Date(today)
          const targetDay = parseInt(dayMatch[1])
          targetDate.setDate(targetDay)
          // 如果目标日期已过，推到下个月
          if (targetDate < today) {
            targetDate.setMonth(targetDate.getMonth() + 1)
          }
        }
      }
      
      if (targetDate) {
        const pad = (n: number) => String(n).padStart(2, '0')
        result[field] = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}`
      }
    }
  }
  
  // 出行方式中英文映射
  if (result.transport && typeof result.transport === 'string') {
    const transportMap: Record<string, string> = {
      '飞机': 'flight',
      '火车': 'train',
      '汽车': 'car',
      '轮船': 'ship',
      '其他': 'other'
    }
    const mapped = transportMap[result.transport]
    if (mapped) {
      result.transport = mapped
    }
  }
  
  return result
}
