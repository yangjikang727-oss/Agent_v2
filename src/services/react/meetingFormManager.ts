/**
 * 会议表单管理器
 * 管理会议创建表单的状态、参数回填和任务生成
 */

import type { Schedule } from '../../types'

export interface MeetingFormFields {
  title?: string        // 会议主题
  date?: string         // 日期
  startTime?: string    // 开始时间
  endTime?: string      // 结束时间
  location?: string     // 会议室地点
  roomType?: string     // 会议室类型
  attendees?: string[]  // 参会人员
}

export interface FormCompletionStatus {
  completed: boolean
  missingFields: string[]
  completionRate: number
}

export class MeetingFormManager {
  private static readonly REQUIRED_FIELDS = [
    'title', 'date', 'startTime', 'endTime', 'location', 'attendees'
  ]

  private static readonly FIELD_NAMES: Record<string, string> = {
    'title': '会议主题',
    'date': '会议日期',
    'startTime': '开始时间',
    'endTime': '结束时间',
    'location': '会议室地点',
    'roomType': '会议室类型',
    'attendees': '参会人员'
  }

  /**
   * 评估表单完成状态
   */
  static evaluateCompletion(fields: MeetingFormFields): FormCompletionStatus {
    const missingFields: string[] = []
    
    for (const field of this.REQUIRED_FIELDS) {
      const value = fields[field as keyof MeetingFormFields]
      
      if (
        value === undefined || 
        value === null || 
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0)
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
    fields: MeetingFormFields,
    _scheduleId: string
  ): {
    formTitle: string
    formFields: Array<{
      name: string
      displayName: string
      currentValue: any
      required: boolean
      inputType: 'text' | 'select' | 'multiselect' | 'datetime'
    }>
    completionStatus: FormCompletionStatus
  } {
    const completionStatus = this.evaluateCompletion(fields)
    
    const formFields = this.REQUIRED_FIELDS.map(field => {
      const fieldName = field as keyof MeetingFormFields
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
      formTitle: `会议信息完善 - ${fields.title || '未命名会议'}`,
      formFields,
      completionStatus
    }
  }

  /**
   * 获取字段输入类型
   */
  private static getFieldInputType(field: string): 'text' | 'select' | 'multiselect' | 'datetime' {
    switch (field) {
      case 'date':
        return 'datetime'
      case 'startTime':
      case 'endTime':
        return 'datetime'
      case 'attendees':
        return 'multiselect'
      case 'roomType':
        return 'select'
      default:
        return 'text'
    }
  }

  /**
   * 创建会议日程对象
   */
  static createScheduleFromForm(
    fields: MeetingFormFields,
    scheduleId?: string
  ): Schedule {
    return {
      id: scheduleId || `MTG-${Date.now()}`,
      content: fields.title || '会议',
      date: fields.date || new Date().toISOString().split('T')[0] || '2024-01-01',
      startTime: fields.startTime || '09:00',
      endTime: fields.endTime || '10:00',
      type: 'meeting',
      location: fields.location || '待分配',
      resources: [],
      attendees: fields.attendees || [],
      agenda: '',
      meta: {
        location: fields.location || '待分配',
        roomType: fields.roomType
      }
    }
  }

  /**
   * 生成通知确认提示
   */
  static generateNotificationPrompt(
    _fields: MeetingFormFields,
    schedule: Schedule
  ): string {
    const timeRange = `${schedule.startTime}-${schedule.endTime}`
    const attendeesList = schedule.attendees.length > 0 
      ? schedule.attendees.join('、')
      : '未指定'
    
    return `📋 会议信息确认：
主题：${schedule.content}
时间：${schedule.date} ${timeRange}
地点：${schedule.location}
参会人：${attendeesList}

是否需要发送会议通知给参会人员？(回复"确认"发送通知，"跳过"暂不通知)`
  }

  /**
   * 格式化表单状态显示
   */
  static formatFormStatus(status: FormCompletionStatus): string {
    if (status.completed) {
      return '✅ 会议信息已完整，可以创建日程'
    }
    
    const missingNames = status.missingFields
      .map(field => this.FIELD_NAMES[field] || field)
      .join('、')
    
    return `📋 还需要完善以下信息：${missingNames} (${Math.round(status.completionRate * 100)}% 完成)`
  }
}