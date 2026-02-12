/**
 * 表单字段元数据定义
 * 用于对话式填充交互：定义必填字段、字段标签、询问提示词
 */

export interface FormFieldMeta {
  label: string           // 字段中文标签
  required: boolean       // 是否必填
  askPrompt: string       // LLM询问用户时的提示语
  type?: 'text' | 'date' | 'time' | 'datetime' | 'select'  // 字段类型
  options?: string[]      // 选项（用于select类型）
}

/**
 * 会议表单字段定义
 */
export const MEETING_FORM_FIELDS: Record<string, FormFieldMeta> = {
  title: {
    label: '会议主题',
    required: true,
    askPrompt: '请问会议主题是什么?',
    type: 'text'
  },
  startTime: {
    label: '开始时间',
    required: true,
    askPrompt: '会议几点开始?',
    type: 'datetime'
  },
  endTime: {
    label: '结束时间',
    required: true,
    askPrompt: '会议几点结束? (如不确定可说"1小时")',
    type: 'datetime'
  },
  location: {
    label: '会议地点',
    required: true,
    askPrompt: '会议在哪里举行?',
    type: 'text'
  },
  roomType: {
    label: '会议室类型',
    required: true,
    askPrompt: '需要什么类型的会议室?',
    type: 'select',
    options: ['大型会议室', '中型会议室', '小型会议室', '培训室', '视频会议室', '线上会议']
  },
  attendees: {
    label: '参会人员',
    required: false,
    askPrompt: '有哪些参会人员?',
    type: 'text'
  },
  remarks: {
    label: '备注',
    required: false,
    askPrompt: '有什么备注信息?',
    type: 'text'
  }
}

/**
 * 出差申请表单字段定义
 */
export const TRIP_FORM_FIELDS: Record<string, FormFieldMeta> = {
  startDate: {
    label: '出发日期',
    required: true,
    askPrompt: '什么时候出发?',
    type: 'date'
  },
  startTime: {
    label: '出发时间',
    required: true,
    askPrompt: '几点出发?',
    type: 'time'
  },
  endDate: {
    label: '返回日期',
    required: true,
    askPrompt: '什么时候返回?',
    type: 'date'
  },
  endTime: {
    label: '返回时间',
    required: true,
    askPrompt: '几点返回?',
    type: 'time'
  },
  from: {
    label: '出发地',
    required: true,
    askPrompt: '从哪里出发?',
    type: 'text'
  },
  to: {
    label: '目的地',
    required: true,
    askPrompt: '去哪里?',
    type: 'text'
  },
  transport: {
    label: '出行方式',
    required: true,
    askPrompt: '选择什么交通方式?',
    type: 'select',
    options: ['飞机', '火车', '汽车', '轮船', '其他']
  },
  reason: {
    label: '出差事由',
    required: true,
    askPrompt: '出差事由是什么?',
    type: 'text'
  }
}

/**
 * 获取表单的必填字段列表
 */
export function getRequiredFields(formType: 'meeting' | 'trip'): string[] {
  const fields = formType === 'meeting' ? MEETING_FORM_FIELDS : TRIP_FORM_FIELDS
  return Object.entries(fields)
    .filter(([_, meta]) => meta.required)
    .map(([key]) => key)
}

/**
 * 计算缺失的必填字段
 */
export function getMissingFields(
  formData: Record<string, any>,
  formType: 'meeting' | 'trip'
): string[] {
  const requiredFields = getRequiredFields(formType)
  return requiredFields.filter(field => {
    const value = formData[field]
    if (value === undefined || value === null || value === '') return true
    if (Array.isArray(value) && value.length === 0) return false // 数组允许为空（如attendees）
    return false
  })
}

/**
 * 获取字段的询问提示语
 */
export function getFieldAskPrompt(field: string, formType: 'meeting' | 'trip'): string {
  const fields = formType === 'meeting' ? MEETING_FORM_FIELDS : TRIP_FORM_FIELDS
  return fields[field]?.askPrompt || `请提供${fields[field]?.label || field}`
}

/**
 * 获取字段标签
 */
export function getFieldLabel(field: string, formType: 'meeting' | 'trip'): string {
  const fields = formType === 'meeting' ? MEETING_FORM_FIELDS : TRIP_FORM_FIELDS
  return fields[field]?.label || field
}

/**
 * 计算表单填充进度
 */
export function getFormProgress(
  formData: Record<string, any>,
  formType: 'meeting' | 'trip'
): { filled: number; total: number; percentage: number } {
  const requiredFields = getRequiredFields(formType)
  const filled = requiredFields.filter(field => {
    const value = formData[field]
    return value !== undefined && value !== null && value !== ''
  }).length
  const total = requiredFields.length
  return {
    filled,
    total,
    percentage: Math.round((filled / total) * 100)
  }
}
