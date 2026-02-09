/**
 * 出差申请表单管理器
 * 管理出差申请表单的状态、参数回填和任务生成
 */

import type { Schedule, TransportMode } from '../../types'

export interface TripFormFields {
  startDate?: string      // 开始日期
  startTime?: string      // 开始时间
  endDate?: string        // 结束日期
  endTime?: string        // 结束时间
  from?: string           // 出发地
  to?: string             // 目的地
  transport?: TransportMode // 交通方式
  reason?: string         // 出差说明
}

export interface FormCompletionStatus {
  completed: boolean
  missingFields: string[]
  completionRate: number
}

export class TripFormManager {
  private static readonly REQUIRED_FIELDS = [
    'startDate', 'startTime', 'endDate', 'endTime', 'from', 'to', 'transport', 'reason'
  ]

  private static readonly FIELD_NAMES: Record<string, string> = {
    'startDate': '开始日期',
    'startTime': '开始时间',
    'endDate': '结束日期',
    'endTime': '结束时间',
    'from': '出发地',
    'to': '目的地',
    'transport': '交通方式',
    'reason': '出差说明'
  }

  /**
   * 评估表单完成状态
   */
  static evaluateCompletion(fields: TripFormFields): FormCompletionStatus {
    const missingFields: string[] = []
    
    for (const field of this.REQUIRED_FIELDS) {
      const value = fields[field as keyof TripFormFields]
      
      if (
        value === undefined || 
        value === null || 
        (typeof value === 'string' && value.trim() === '')
      ) {
        missingFields.push(field)
      }
    }
    
    const completed = missingFields.length === 0
    const completionRate = (this.REQUIRED_FIELDS.length - missingFields.length) / this.REQUIRED_FIELDS.length
    
    return {
      completed,
      missingFields,
      completionRate
    }
  }

  /**
   * 生成待完成任务表单
   */
  static generateTaskForm(
    fields: TripFormFields,
    _scheduleId: string
  ): {
    formTitle: string
    formFields: Array<{
      name: string
      displayName: string
      currentValue: any
      required: boolean
      inputType: 'text' | 'select' | 'multiselect' | 'datetime' | 'textarea'
    }>
    completionStatus: FormCompletionStatus
  } {
    const completionStatus = this.evaluateCompletion(fields)
    
    const formFields = this.REQUIRED_FIELDS.map(field => {
      const fieldName = field as keyof TripFormFields
      const currentValue = fields[fieldName]
      
      return {
        name: field,
        displayName: this.FIELD_NAMES[field] || field,
        currentValue,
        required: true,
        inputType: this.getFieldInputType(field)
      }
    })
    
    return {
      formTitle: `出差申请 - ${fields.from || ''} 到 ${fields.to || '未指定'}`,
      formFields,
      completionStatus
    }
  }

  /**
   * 获取字段输入类型
   */
  private static getFieldInputType(field: string): 'text' | 'select' | 'multiselect' | 'datetime' | 'textarea' {
    switch (field) {
      case 'startDate':
      case 'endDate':
        return 'datetime'
      case 'startTime':
      case 'endTime':
        return 'datetime'
      case 'transport':
        return 'select'
      case 'reason':
        return 'textarea'
      default:
        return 'text'
    }
  }

  /**
   * 创建出差日程对象
   */
  static createScheduleFromForm(
    fields: TripFormFields,
    scheduleId?: string
  ): Schedule {

    return {
      id: scheduleId || `TRIP-${Date.now()}`,
      content: `出差: ${fields.from || '未指定'} → ${fields.to || '未指定'}`,
      date: (fields.startDate || new Date().toISOString().split('T')[0]) as string,
      startTime: fields.startTime || '09:00',
      endTime: fields.endTime || '18:00',
      endDate: fields.endDate,
      type: 'trip',
      location: fields.to || '待定',
      resources: [],
      attendees: [],
      agenda: '',
      meta: {
        from: fields.from || undefined,
        to: fields.to || undefined,
        transport: fields.transport,
        tripApplied: true
      }
    }
  }

  /**
   * 生成通知确认提示
   */
  static generateNotificationPrompt(
    fields: TripFormFields,
    _schedule: Schedule
  ): string {
    const transportMap: Record<TransportMode, string> = {
      flight: '✈️ 飞机',
      train: '🚄 火车',
      car: '🚗 汽车',
      ship: '⛵ 轮船',
      other: '🛤️ 其他'
    }
    
    const transportText = fields.transport ? transportMap[fields.transport] : '未指定'
    
    return `📋 出差信息确认：
出发地：${fields.from}
目的地：${fields.to}
时间：${fields.startDate} ${fields.startTime} 至 ${fields.endDate} ${fields.endTime}
交通方式：${transportText}
出差说明：${fields.reason}

是否确认提交出差申请？(回复"确认"提交申请)`
  }

  /**
   * 格式化表单状态显示
   */
  static formatFormStatus(status: FormCompletionStatus): string {
    if (status.completed) {
      return '✅ 出差申请信息已完整，可以提交'
    }
    
    const missingNames = status.missingFields
      .map(field => this.FIELD_NAMES[field] || field)
      .join('、')
    
    return `📋 还需要完善以下信息：${missingNames} (${Math.round(status.completionRate * 100)}% 完成)`
  }

  /**
   * 验证表单数据
   */
  static validateForm(fields: TripFormFields): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    
    // 验证必填字段
    if (!fields.from?.trim()) {
      errors.push('出发地不能为空')
    }
    
    if (!fields.to?.trim()) {
      errors.push('目的地不能为空')
    }
    
    if (!fields.startDate) {
      errors.push('开始日期不能为空')
    }
    
    if (!fields.startTime) {
      errors.push('开始时间不能为空')
    }
    
    if (!fields.endDate) {
      errors.push('结束日期不能为空')
    }
    
    if (!fields.endTime) {
      errors.push('结束时间不能为空')
    }
    
    if (!fields.transport) {
      errors.push('交通方式不能为空')
    }
    
    if (!fields.reason?.trim()) {
      errors.push('出差说明不能为空')
    }
    
    // 验证时间逻辑
    if (fields.startDate && fields.endDate) {
      const start = new Date(`${fields.startDate}T${fields.startTime}`)
      const end = new Date(`${fields.endDate}T${fields.endTime}`)
      
      if (start >= end) {
        errors.push('结束时间必须晚于开始时间')
      }
    }
    
    // 验证出发地和目的地不能相同
    if (fields.from && fields.to && fields.from.trim() === fields.to.trim()) {
      errors.push('出发地和目的地不能相同')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
}