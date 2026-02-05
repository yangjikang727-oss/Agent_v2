/**
 * 示例 Skills - 预定义的技能模板
 * 
 * 包含：
 * - meetingSkill: 预定会议室
 * - tripSkill: 出差申请
 * - notifySkill: 发送通知
 */

import type { SkillSpec, SkillContext, SkillExecutionResult, SkillExecutor } from './skillTypes'
import { skillRegistry } from './skillRegistry'
import { registerLocalExecutor } from './skillExecutor'

// ==================== 预定会议室 Skill ====================

export const meetingSkillSpec: SkillSpec = {
  name: 'book_meeting_room',
  version: '1.0.0',
  description: '预定会议室，创建会议日程',
  tags: ['会议', '日程', '会议室', '预定'],
  category: 'schedule',
  when_to_use: '当用户想要预定会议室、安排会议、创建会议日程时使用',
  when_not_to_use: '用户只是查询会议信息而不是创建新会议时不要使用',
  priority: 1,
  
  input_schema: [
    {
      name: 'title',
      type: 'string',
      description: '会议主题',
      required: true,
      clarificationPrompt: '请问会议主题是什么？'
    },
    {
      name: 'date',
      type: 'date',
      description: '会议日期',
      required: true,
      examples: ['2024-01-15', '明天', '下周三'],
      clarificationPrompt: '请问会议安排在哪一天？'
    },
    {
      name: 'startTime',
      type: 'time',
      description: '开始时间',
      required: true,
      examples: ['09:00', '14:30', '下午3点'],
      clarificationPrompt: '请问会议几点开始？'
    },
    {
      name: 'endTime',
      type: 'time',
      description: '结束时间',
      required: false,
      examples: ['10:00', '16:00'],
      clarificationPrompt: '请问会议几点结束？'
    },
    {
      name: 'attendees',
      type: 'array',
      description: '参会人员列表',
      required: true,
      clarificationPrompt: '请问有哪些人参加会议？'
    },
    {
      name: 'location',
      type: 'string',
      description: '会议地点/会议室',
      required: false,
      enum: ['会议室A', '会议室B', '会议室C', '线上会议'],
      clarificationPrompt: '请问在哪个会议室开会？'
    },
    {
      name: 'roomType',
      type: 'string',
      description: '会议室类型',
      required: false,
      enum: ['小型', '中型', '大型'],
      default: '小型'
    },
    {
      name: 'description',
      type: 'string',
      description: '会议描述/议程',
      required: false
    }
  ],
  
  required_fields: ['title', 'date', 'startTime', 'attendees'],
  
  constraints: [
    {
      id: 'time_in_future',
      description: '会议时间必须在未来',
      type: 'precondition',
      condition: 'date >= today',
      onViolation: 'reject',
      violationMessage: '会议时间不能是过去的时间'
    },
    {
      id: 'end_after_start',
      description: '结束时间必须在开始时间之后',
      type: 'precondition',
      condition: 'endTime > startTime',
      onViolation: 'warn',
      violationMessage: '结束时间应该在开始时间之后'
    }
  ],
  
  sop: {
    name: '会议预定流程',
    description: '标准会议预定操作流程',
    steps: [
      { step: 1, description: '收集会议主题', action: 'collect', fields: ['title'] },
      { step: 2, description: '确认会议时间', action: 'collect', fields: ['date', 'startTime', 'endTime'] },
      { step: 3, description: '确认参会人员', action: 'collect', fields: ['attendees'] },
      { step: 4, description: '检查会议室可用性', action: 'validate', fields: ['location', 'date', 'startTime'] },
      { step: 5, description: '创建会议日程', action: 'execute' },
      { step: 6, description: '发送会议邀请', action: 'execute' }
    ],
    preconditions: ['用户已登录', '有预定会议室权限']
  },
  
  composable: true,
  composable_with: ['send_notification'],
  deferred_allowed: false,
  
  executorType: 'local',
  
  examples: [
    {
      userInput: '帮我预定明天下午3点的会议室，和张三李四开项目周会',
      expectedAction: 'book_meeting_room(title="项目周会", date="明天", startTime="15:00", attendees=["张三", "李四"])'
    },
    {
      userInput: '下周三上午10点在大会议室开全员大会',
      expectedAction: 'book_meeting_room(title="全员大会", date="下周三", startTime="10:00", location="大会议室")'
    }
  ]
}

/**
 * 会议预定执行函数
 */
async function executeMeetingBooking(
  params: Record<string, any>,
  _context: SkillContext
): Promise<any> {
  console.log('[MeetingSkill] 执行会议预定:', params)
  
  try {
    // 直接导入依赖
    const scheduleStoreModule = await import('../../../stores/scheduleStore')
    const taskStoreModule = await import('../../../stores/taskStore')
    const configStoreModule = await import('../../../stores/configStore')
    
    const scheduleStore = scheduleStoreModule.useScheduleStore()
    const taskStore = taskStoreModule.useTaskStore()
    const configStore = configStoreModule.useConfigStore()
    
    // 构造 Schedule 对象
    const schedule = {
      id: `MTG-${Date.now()}`,
      content: params.title || '会议',
      date: params.date || new Date().toISOString().split('T')[0],
      startTime: params.startTime || '09:00',
      endTime: params.endTime || '10:00',
      type: 'meeting' as const,
      location: params.location || '待分配',
      resources: [],
      attendees: params.attendees || [],
      agenda: '',
      meta: {
        location: params.location || '待分配'
      }
    }
    
    // 添加到日程存储
    const success = scheduleStore.addSchedule(schedule)
    
    if (success) {
      console.log('[MeetingSkill] 会议预定成功:', schedule.id)
      
      // 生成技能任务（参考传统模式）
      const scenario = configStore.getScenario('MEETING')
      if (scenario && scenario.skills.length > 0) {
        const newTasks = scenario.skills.map(skillCode => {
          const skillMeta = configStore.getSkill(skillCode)
          return {
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            scheduleId: schedule.id,
            title: skillMeta?.name || skillCode,
            desc: skillMeta?.description || '',
            icon: skillMeta?.icon || 'fa-cube',
            skill: skillCode,
            actionBtn: '执行',
            date: schedule.date,
            status: 'pending' as const
          }
        })
        taskStore.addTasks(newTasks)
      }
      
      return {
        success: true,
        scheduleId: schedule.id,
        title: schedule.content,
        date: schedule.date,
        time: `${schedule.startTime} - ${schedule.endTime}`,
        location: schedule.location,
        attendees: schedule.attendees,
        message: `✅ 会议「${schedule.content}」预定成功，ID: ${schedule.id}`
      }
    } else {
      console.log('[MeetingSkill] 会议预定失败：时间冲突')
      
      return {
        success: false,
        error: '时间冲突，无法预定该时段的会议',
        message: '❌ 时间冲突，请选择其他时间或地点'
      }
    }
    
  } catch (error) {
    console.error('[MeetingSkill] 执行异常:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      message: '❌ 会议预定失败，请稍后重试'
    }
  }
}

// ==================== 出差申请 Skill ====================

export const tripSkillSpec: SkillSpec = {
  name: 'apply_business_trip',
  version: '1.0.0',
  description: '申请出差，包括交通和住宿安排',
  tags: ['出差', '差旅', '申请', '交通', '酒店'],
  category: 'travel',
  when_to_use: '当用户需要申请出差、安排差旅行程时使用',
  when_not_to_use: '用户只是查询差旅政策或历史出差记录时不要使用',
  priority: 2,
  
  input_schema: [
    {
      name: 'destination',
      type: 'string',
      description: '出差目的地',
      required: true,
      clarificationPrompt: '请问出差去哪个城市？'
    },
    {
      name: 'departure',
      type: 'string',
      description: '出发城市',
      required: true,
      default: '北京',
      clarificationPrompt: '请问从哪个城市出发？'
    },
    {
      name: 'startDate',
      type: 'date',
      description: '出发日期',
      required: true,
      clarificationPrompt: '请问什么时候出发？'
    },
    {
      name: 'endDate',
      type: 'date',
      description: '返回日期',
      required: true,
      clarificationPrompt: '请问什么时候返回？'
    },
    {
      name: 'purpose',
      type: 'string',
      description: '出差事由',
      required: true,
      clarificationPrompt: '请问出差的目的是什么？'
    },
    {
      name: 'transportType',
      type: 'string',
      description: '交通方式',
      required: false,
      enum: ['飞机', '高铁', '火车', '自驾'],
      default: '飞机'
    },
    {
      name: 'needHotel',
      type: 'boolean',
      description: '是否需要预定酒店',
      required: false,
      default: true
    },
    {
      name: 'hotelLocation',
      type: 'string',
      description: '酒店位置偏好',
      required: false,
      clarificationPrompt: '请问酒店希望在什么位置？（如：公司附近、市中心）'
    },
    {
      name: 'budget',
      type: 'number',
      description: '预算（元/天）',
      required: false,
      validation: { min: 100, max: 2000 }
    }
  ],
  
  required_fields: ['destination', 'departure', 'startDate', 'endDate', 'purpose'],
  
  constraints: [
    {
      id: 'date_range_valid',
      description: '返回日期必须在出发日期之后',
      type: 'precondition',
      condition: 'endDate >= startDate',
      onViolation: 'reject',
      violationMessage: '返回日期不能早于出发日期'
    },
    {
      id: 'advance_booking',
      description: '建议提前3天申请',
      type: 'precondition',
      condition: 'startDate >= today + 3',
      onViolation: 'warn',
      violationMessage: '建议提前3天以上申请出差'
    }
  ],
  
  sop: {
    name: '出差申请流程',
    description: '标准出差申请操作流程',
    steps: [
      { step: 1, description: '收集出差基本信息', action: 'collect', fields: ['destination', 'departure', 'startDate', 'endDate', 'purpose'] },
      { step: 2, description: '确认交通方式', action: 'collect', fields: ['transportType'] },
      { step: 3, description: '推荐航班/车次', action: 'execute' },
      { step: 4, description: '用户选择交通', action: 'confirm' },
      { step: 5, description: '确认住宿需求', action: 'collect', fields: ['needHotel', 'hotelLocation'] },
      { step: 6, description: '推荐酒店', action: 'execute', condition: 'needHotel == true' },
      { step: 7, description: '用户选择酒店', action: 'confirm', condition: 'needHotel == true' },
      { step: 8, description: '提交出差申请', action: 'execute' }
    ],
    preconditions: ['用户已登录', '有出差申请权限']
  },
  
  composable: true,
  composable_with: ['book_flight', 'book_hotel', 'send_notification'],
  deferred_allowed: true,
  deferred_timeout: 86400000, // 24小时
  
  executorType: 'local',
  
  examples: [
    {
      userInput: '我要去上海出差，下周一出发，周三回来，参加客户会议',
      expectedAction: 'apply_business_trip(destination="上海", startDate="下周一", endDate="下周三", purpose="参加客户会议")'
    },
    {
      userInput: '申请明天去深圳的出差，坐高铁',
      expectedAction: 'apply_business_trip(destination="深圳", startDate="明天", transportType="高铁")'
    }
  ]
}

/**
 * 出差申请执行函数
 */
async function executeTripApplication(
  params: Record<string, any>,
  _context: SkillContext
): Promise<any> {
  console.log('[TripSkill] 执行出差申请:', params)
  
  const tripId = `TRIP-${Date.now()}`
  
  return {
    success: true,
    tripId,
    destination: params.destination,
    departure: params.departure,
    dateRange: `${params.startDate} - ${params.endDate}`,
    purpose: params.purpose,
    transportType: params.transportType || '待选择',
    needHotel: params.needHotel !== false,
    status: 'pending',
    message: `出差申请已创建，申请ID: ${tripId}，请继续选择交通和住宿`
  }
}

// ==================== 发送通知 Skill ====================

export const notifySkillSpec: SkillSpec = {
  name: 'send_notification',
  version: '1.0.0',
  description: '发送通知给指定人员',
  tags: ['通知', '消息', '提醒'],
  category: 'communication',
  when_to_use: '当用户需要发送通知、提醒他人时使用',
  when_not_to_use: '用户只是查看通知或询问通知状态时不要使用',
  priority: 3,
  
  input_schema: [
    {
      name: 'recipients',
      type: 'array',
      description: '接收人列表',
      required: true,
      clarificationPrompt: '请问要通知谁？'
    },
    {
      name: 'message',
      type: 'string',
      description: '通知内容',
      required: true,
      clarificationPrompt: '请问通知内容是什么？'
    },
    {
      name: 'channel',
      type: 'string',
      description: '通知渠道',
      required: false,
      enum: ['邮件', '短信', '企业微信', '钉钉', '系统通知'],
      default: '系统通知'
    },
    {
      name: 'priority',
      type: 'string',
      description: '优先级',
      required: false,
      enum: ['低', '普通', '高', '紧急'],
      default: '普通'
    },
    {
      name: 'scheduleTime',
      type: 'datetime',
      description: '定时发送时间',
      required: false,
      clarificationPrompt: '需要定时发送吗？如果是，请问什么时候发送？'
    }
  ],
  
  required_fields: ['recipients', 'message'],
  
  sop: {
    name: '通知发送流程',
    description: '标准通知发送操作流程',
    steps: [
      { step: 1, description: '确认接收人', action: 'collect', fields: ['recipients'] },
      { step: 2, description: '确认通知内容', action: 'collect', fields: ['message'] },
      { step: 3, description: '选择通知渠道', action: 'collect', fields: ['channel'] },
      { step: 4, description: '发送通知', action: 'execute' }
    ]
  },
  
  composable: true,
  deferred_allowed: true,
  deferred_timeout: 604800000, // 7天
  
  executorType: 'local',
  
  examples: [
    {
      userInput: '通知张三明天的会议改到下午3点',
      expectedAction: 'send_notification(recipients=["张三"], message="明天的会议改到下午3点")'
    },
    {
      userInput: '给全体成员发邮件通知项目上线',
      expectedAction: 'send_notification(recipients=["全体成员"], message="项目上线通知", channel="邮件")'
    }
  ]
}

/**
 * 发送通知执行函数
 */
async function executeNotification(
  params: Record<string, any>,
  _context: SkillContext
): Promise<any> {
  console.log('[NotifySkill] 执行发送通知:', params)
  
  const notifyId = `NOTIFY-${Date.now()}`
  
  return {
    success: true,
    notifyId,
    recipients: params.recipients,
    message: params.message,
    channel: params.channel || '系统通知',
    sentAt: new Date().toISOString(),
    message_result: `通知已发送给 ${params.recipients.length} 人`
  }
}

// ==================== 创建通用执行器 ====================

/**
 * 创建 Skill 执行器
 */
function createSkillExecutor(
  executeFn: (params: Record<string, any>, context: SkillContext) => Promise<any>
): SkillExecutor {
  return {
    async execute(
      skillName: string,
      params: Record<string, any>,
      context: SkillContext
    ): Promise<SkillExecutionResult> {
      const startTime = Date.now()
      
      try {
        const data = await executeFn(params, context)
        
        return {
          status: 'success',
          skillName,
          params,
          data,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      } catch (error) {
        return {
          status: 'error',
          skillName,
          params,
          error: {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : '执行失败',
            recoverable: true
          },
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }
    }
  }
}

// ==================== 注册所有示例 Skills ====================

/**
 * 注册所有示例 Skills
 */
export function registerExampleSkills(): void {
  console.log('[ExampleSkills] 注册示例技能...')
  
  // 注册会议预定
  skillRegistry.registerSkill(
    meetingSkillSpec,
    createSkillExecutor(executeMeetingBooking)
  )
  registerLocalExecutor('book_meeting_room', executeMeetingBooking)
  
  // 注册出差申请
  skillRegistry.registerSkill(
    tripSkillSpec,
    createSkillExecutor(executeTripApplication)
  )
  registerLocalExecutor('apply_business_trip', executeTripApplication)
  
  // 注册发送通知
  skillRegistry.registerSkill(
    notifySkillSpec,
    createSkillExecutor(executeNotification)
  )
  registerLocalExecutor('send_notification', executeNotification)
  
  console.log('[ExampleSkills] 示例技能注册完成')
}

// ==================== 导出 ====================

export const exampleSkills = {
  meeting: meetingSkillSpec,
  trip: tripSkillSpec,
  notify: notifySkillSpec
}
