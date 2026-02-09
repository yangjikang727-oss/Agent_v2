import type { 
  Schedule, 
  SkillResult, 
  SkillHandler, 
  DirectoryUser,
  ResourceCardData,
  TransportSelectorData,
  AttendeeTableData,
  AttendeeRow,
  TransportMode,
  ParamConfirmData
} from '../../types'

// 模拟通讯录数据
export const MOCK_DIRECTORY: DirectoryUser[] = [
  { id: 'u1', name: '王总', dept: 'CEO', email: 'ceo@company.com', title: '总经理' },
  { id: 'u2', name: '李明', dept: '销售部', email: 'liming.sales@company.com', title: '销售总监' },
  { id: 'u3', name: '李明', dept: '技术部', email: 'liming.tech@company.com', title: '架构师' },
  { id: 'u4', name: '张三', dept: '人事部', email: 'zhangsan@company.com', title: 'HRBP' }
]

// ==================== 参数确认机制 ====================

/** 需要参数确认的技能列表 */
const SKILLS_NEED_CONFIRM = ['search_contacts', 'book_meeting_room', 'notify_attendees']

/** 参数提取器类型 */
type ParamExtractor = (schedule: Schedule) => ParamConfirmData

/** 参数提取器注册表 */
const paramExtractors: Record<string, ParamExtractor> = {
  /**
   * 通讯录查询 - 参数提取器
   */
  search_contacts: (schedule: Schedule): ParamConfirmData => {
    const attendees = schedule.attendees?.join('、') || ''
    
    return {
      skillCode: 'search_contacts',
      skillName: '通讯录查询',
      skillIcon: 'fa-address-book',
      scheduleId: schedule.id,
      confirmed: false,
      executing: false,
      fields: [
        {
          key: 'attendees',
          label: '与会人员',
          type: 'text',
          value: attendees,
          placeholder: '请输入姓名，用逗号或顿号分隔',
          required: true
        }
      ]
    }
  },

  /**
   * 预订会议室 - 参数提取器
   */
  book_meeting_room: (schedule: Schedule): ParamConfirmData => {
    const count = schedule.attendees?.length || 0
    let roomType = '中会议室'
    if (count > 10) roomType = '大会议室'
    else if (count <= 3) roomType = '小会议室'
      
    // 优先使用 schedule.location，否则从 content 提取
    let location = schedule.location || ''
    if (!location) {
      const locationMatch = schedule.content.match(/在(.{2,10}?)(开会|会议室|讨论)/)
      location = (locationMatch && locationMatch[1]) ? locationMatch[1] : ''
    }
  
    // 会议时间
    const meetingTime = `${schedule.startTime} - ${schedule.endTime}`

    return {
      skillCode: 'book_meeting_room',
      skillName: '预订会议室',
      skillIcon: 'fa-door-open',
      scheduleId: schedule.id,
      confirmed: false,
      executing: false,
      fields: [
        {
          key: 'meeting_time',
          label: '会议时间',
          type: 'text',
          value: meetingTime,
          placeholder: '例如：10:00 - 11:00',
          required: true
        },
        {
          key: 'attendee_count',
          label: '人数',
          type: 'number',
          value: count || 1,
          placeholder: '参会人数',
          required: true
        },
        {
          key: 'room_type',
          label: '会议室类型',
          type: 'select',
          value: roomType,
          required: true,
          options: [
            { label: '大会议室', value: '大会议室' },
            { label: '中会议室', value: '中会议室' },
            { label: '小会议室', value: '小会议室' },
            { label: '线上会议', value: '线上会议' }
          ]
        },
        {
          key: 'location',
          label: '地点',
          type: 'text',
          value: location || '',
          placeholder: '例如：3楼、总部大厦'
        }
      ]
    }
  },

  /**
   * 通知参会人 - 参数提取器
   */
  notify_attendees: (schedule: Schedule): ParamConfirmData => {
    const attendees = schedule.attendees?.join('、') || ''
    
    return {
      skillCode: 'notify_attendees',
      skillName: '通知参会人',
      skillIcon: 'fa-envelope',
      scheduleId: schedule.id,
      confirmed: false,
      executing: false,
      fields: [
        {
          key: 'attendees',
          label: '与会人员',
          type: 'text',
          value: attendees,
          placeholder: '请输入姓名，用逗号或顿号分隔',
          required: true
        }
      ]
    }
  }
}

/**
 * 检查技能是否需要参数确认
 */
export function needParamConfirm(skillCode: string): boolean {
  return SKILLS_NEED_CONFIRM.includes(skillCode)
}

/**
 * 获取参数确认数据
 */
export function getParamConfirmData(skillCode: string, schedule: Schedule): ParamConfirmData | null {
  const extractor = paramExtractors[skillCode]
  return extractor ? extractor(schedule) : null
}

/**
 * 应用确认后的参数到 schedule
 */
export function applyConfirmedParams(
  schedule: Schedule, 
  skillCode: string, 
  params: Record<string, string | number>
): Schedule {
  const updatedSchedule = { ...schedule }

  switch (skillCode) {
    case 'search_contacts':
    case 'notify_attendees':
      if (params.attendees) {
        updatedSchedule.attendees = String(params.attendees)
          .split(/[、,，\s]+/)
          .filter((n: string) => n.length > 0)
      }
      break

    case 'book_meeting_room':
      // 解析会议时间
      if (params.meeting_time) {
        const timeStr = String(params.meeting_time)
        const timeMatch = timeStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
        if (timeMatch && timeMatch[1] && timeMatch[2]) {
          updatedSchedule.startTime = timeMatch[1]
          updatedSchedule.endTime = timeMatch[2]
        }
      }
      // 将参数存储到 meta 中供后续使用，并更新 schedule.location
      updatedSchedule.meta = {
        ...updatedSchedule.meta,
        roomType: String(params.room_type),
        location: String(params.location || ''),
        attendeeCount: Number(params.attendee_count),
        meetingTime: String(params.meeting_time || '')
      }
      // 同时更新 schedule.location 以便在 EventCard 中显示
      if (params.location) {
        updatedSchedule.location = String(params.location)
      }
      break
  }

  return updatedSchedule
}

/**
 * 生成航班列表（根据出发地、目的地、日期和时间）
 */
export function generateFlightList(
  schedule: Schedule,
  from: string,
  to: string
): import('../../types/skill').SkillResult {
  const startTimeStr = schedule.startTime || '09:00'
  const timeParts = startTimeStr.split(':')
  const baseHour = timeParts[0] ? parseInt(timeParts[0]) : 9
  
  // 根据出发地和目的地生成航班
  const flights: import('../../types/message').FlightOption[] = [
    {
      flightNo: 'CA1502',
      airline: '国航',
      departTime: `${String(baseHour).padStart(2, '0')}:30`,
      arriveTime: `${String(baseHour + 3).padStart(2, '0')}:00`,
      duration: '2h 30m',
      price: 1250,
      from,
      to,
      priority: 1,
      tags: ['推荐']
    },
    {
      flightNo: 'MU5318',
      airline: '东航',
      departTime: `${String(baseHour - 1).padStart(2, '0')}:45`,
      arriveTime: `${String(baseHour + 2).padStart(2, '0')}:10`,
      duration: '2h 25m',
      price: 980,
      from,
      to,
      priority: 2,
      tags: ['最便宜']
    },
    {
      flightNo: 'CZ3156',
      airline: '南航',
      departTime: `${String(baseHour + 1).padStart(2, '0')}:15`,
      arriveTime: `${String(baseHour + 3).padStart(2, '0')}:30`,
      duration: '2h 15m',
      price: 1480,
      from,
      to,
      priority: 3,
      tags: ['最快']
    },
    {
      flightNo: 'HU7802',
      airline: '海航',
      departTime: `${String(baseHour + 2).padStart(2, '0')}:00`,
      arriveTime: `${String(baseHour + 5).padStart(2, '0')}:00`,
      duration: '3h 00m',
      price: 850,
      from,
      to,
      priority: 4
    },
    {
      flightNo: 'ZH9128',
      airline: '深航',
      departTime: `${String(baseHour - 2).padStart(2, '0')}:30`,
      arriveTime: `${String(baseHour + 1).padStart(2, '0')}:15`,
      duration: '2h 45m',
      price: 1120,
      from,
      to,
      priority: 5
    }
  ]
  
  // 按优先级排序
  flights.sort((a, b) => a.priority - b.priority)
  
  return {
    type: 'flight_list',
    data: {
      scheduleId: schedule.id,
      from,
      to,
      date: schedule.date,
      flights,
      selected: null,
      locked: false
    } as import('../../types/message').FlightListData
  }
}

/**
 * 生成酒店列表（根据商圈/地点）
 */
export function generateHotelList(
  schedule: Schedule,
  location: string
): import('../../types/skill').SkillResult {
  // 根据地点生成酒店推荐
  const hotels: import('../../types/message').HotelOption[] = [
    {
      hotelId: 'h001',
      name: '全季酒店',
      star: 4,
      rating: 4.8,
      price: 450,
      distance: `距${location}500米`,
      address: `${location}中心商业区`,
      amenities: ['含早', '免费WiFi', '健身房'],
      roomType: '商务大床房',
      tags: ['推荐', '优质服务']
    },
    {
      hotelId: 'h002',
      name: '汉庭酒店',
      star: 3,
      rating: 4.5,
      price: 280,
      distance: `距${location}800米`,
      address: `${location}商业街`,
      amenities: ['免费WiFi', '停车场'],
      roomType: '标准双床房',
      tags: ['性价比高']
    },
    {
      hotelId: 'h003',
      name: '亚朗酒店',
      star: 4,
      rating: 4.6,
      price: 520,
      distance: `距${location}300米`,
      address: `${location}核心地段`,
      amenities: ['含早', '免费WiFi', '健身房', '泳池'],
      roomType: '豪华大床房',
      tags: ['位置最佳']
    },
    {
      hotelId: 'h004',
      name: '如家酒店',
      star: 3,
      rating: 4.3,
      price: 220,
      distance: `距${location}1.2公里`,
      address: `${location}附近`,
      amenities: ['免费WiFi'],
      roomType: '经济大床房',
      tags: ['最便宜']
    },
    {
      hotelId: 'h005',
      name: '万豪酒店',
      star: 5,
      rating: 4.9,
      price: 980,
      distance: `距${location}200米`,
      address: `${location}核心商圈`,
      amenities: ['含早', '免费WiFi', '健身房', '泳池', '行政酒廊'],
      roomType: '行政套房',
      tags: ['高端之选']
    }
  ]
  
  // 按评分和性价比综合排序
  hotels.sort((a, b) => {
    // 综合评分：评分权重0.6 + 价格反向权重0.4
    const scoreA = a.rating * 0.6 + (1000 - a.price) / 1000 * 0.4
    const scoreB = b.rating * 0.6 + (1000 - b.price) / 1000 * 0.4
    return scoreB - scoreA
  })
  
  return {
    type: 'hotel_list',
    data: {
      scheduleId: schedule.id,
      location,
      checkInDate: schedule.date,
      hotels,
      selected: null,
      locked: false
    } as import('../../types/message').HotelListData
  }
}

/**
 * 生成交通资源卡片
 */
export function generateTransportCard(mode: TransportMode, schedule: Schedule): SkillResult {
  const details: Record<TransportMode, { icon: string; title: string; price: number; desc: string }> = {
    flight: { icon: 'fa-plane-up', title: '推荐航班 CA1502', price: 1250, desc: `${schedule.startTime} 出发 | 耗时 2h 30m` },
    train: { icon: 'fa-train', title: '高铁 G14', price: 550, desc: `${schedule.startTime} 出发 | 耗时 4h 15m` },
    car: { icon: 'fa-car', title: '商务专车', price: 300, desc: '预计 35 分钟到达 | 别克GL8' },
    ship: { icon: 'fa-ship', title: '轮渡班次 B2', price: 180, desc: `${schedule.startTime} 启航` },
    other: { icon: 'fa-person-walking', title: '自行前往', price: 0, desc: '无预订' }
  }

  const info = details[mode] || { icon: 'fa-ticket', title: '未知行程', price: 0, desc: '' }

  return {
    type: 'resource_card',
    data: {
      icon: info.icon,
      title: info.title,
      price: info.price,
      details: info.desc,
      resourceType: 'transport'
    } as ResourceCardData
  }
}

// 技能处理函数注册表
const skillHandlers: Record<string, SkillHandler> = {
  /**
   * 交通安排技能
   */
  arrange_transport: async (schedule: Schedule): Promise<SkillResult> => {
    // 如果 meta 中已有交通方式且已预订
    if (schedule.meta?.transport && schedule.resources.some(r => r.resourceType === 'transport')) {
      return {
        type: 'action_notice',
        text: '✅ 已安排交通，无需重复操作。'
      }
    }

    // 出差场景：从多个来源获取出发地和目的地
    const meta = schedule.meta || {}
    const from = meta.from || ''
    const to = meta.to || schedule.location || ''
    
    // 调试输出
    console.log('[arrange_transport] from:', from, 'to:', to, 'meta:', meta)
    
    // 如果有出发地和目的地，默认推荐航班列表
    if (from && to) {
      return generateFlightList(schedule, from, to)
    }

    // 从内容中识别交通方式
    const text = schedule.content
    if (/飞机|航班|飞/.test(text)) return generateTransportCard('flight', schedule)
    if (/火车|高铁|动车/.test(text)) return generateTransportCard('train', schedule)
    if (/车|打车|专车/.test(text)) return generateTransportCard('car', schedule)
    if (/船|轮渡|轮船/.test(text)) return generateTransportCard('ship', schedule)

    // 返回选择器让用户选择
    return {
      type: 'transport_selector',
      data: {
        scheduleId: schedule.id,
        options: [
          { key: 'flight', label: '飞机', icon: 'fa-plane' },
          { key: 'train', label: '火车', icon: 'fa-train' },
          { key: 'ship', label: '轮船', icon: 'fa-ship' },
          { key: 'car', label: '汽车', icon: 'fa-car' },
          { key: 'other', label: '其他', icon: 'fa-person-walking' }
        ],
        selected: null,
        locked: false
      } as TransportSelectorData
    }
  },

  /**
   * 预订酒店技能
   */
  check_hotel: async (schedule: Schedule): Promise<SkillResult> => {
    // 检查是否已预订
    if (schedule.resources.some(r => r.resourceType === 'hotel')) {
      return {
        type: 'action_notice',
        text: '✅ 已为您预订了酒店，无需重复操作。'
      }
    }
  
    // 检查 meta 中是否已有酒店地点
    const hotelLocation = (schedule.meta as any)?.hotelLocation
    if (hotelLocation) {
      // 有地点，直接生成酒店列表
      return generateHotelList(schedule, hotelLocation)
    }
  
    // 没有地点，返回追问
    return {
      type: 'ask_hotel_location',
      text: '🏨 请问您希望住在哪个商圈或地点？<br><span class="text-xs text-gray-500">(如：国贸附近、中关村、陆家嘴等)</span>'
    }
  },

  /**
   * 出差申请技能
   */
  apply_trip: async (schedule: Schedule): Promise<SkillResult> => {
    // 检查是否已提交过申请
    if ((schedule.meta as any)?.tripApplied) {
      return {
        type: 'action_notice',
        text: '✅ 出差申请已提交，无需重复操作。'
      }
    }

    // 从 schedule 中提取已有信息预填
    const meta = schedule.meta || {}
    const transportMap: Record<string, string> = {
      'flight': 'flight',
      'train': 'train',
      'car': 'car',
      '飞机': 'flight',
      '航班': 'flight',
      '高铁': 'train',
      '火车': 'train',
      '汽车': 'car'
    }
    
    // 尝试从内容中识别出行方式
    let transport = ''
    if (meta.transport) {
      transport = transportMap[meta.transport] || meta.transport
    } else {
      const text = schedule.content
      if (/飞机|航班|飞/.test(text)) transport = 'flight'
      else if (/高铁|火车|动车/.test(text)) transport = 'train'
      else if (/汽车|开车|自驾/.test(text)) transport = 'car'
    }

    return {
      type: 'trip_application',
      data: {
        scheduleId: schedule.id,
        startDate: schedule.date,
        endDate: schedule.date,  // 默认当天返回，用户可修改
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        from: meta.from || '',
        to: meta.to || schedule.location || '',
        transport: transport,
        reason: schedule.content || '',
        status: 'draft'
      } as import('../../types/message').TripApplicationData
    }
  },

  /**
   * 预订会议室技能
   */
  book_meeting_room: async (schedule: Schedule): Promise<SkillResult> => {
    // 检查是否已预订
    if (schedule.resources.some(r => r.resourceType === 'room')) {
      return {
        type: 'action_notice',
        text: '⚠️ <b>重复操作</b>：该会议已绑定会议室。<br><span class="text-xs text-gray-500">无需再次预订。</span>'
      }
    }

    // 优先使用 meta 中的参数（来自用户确认）
    const count = schedule.meta?.attendeeCount || schedule.attendees?.length || 0
    const roomType = schedule.meta?.roomType || (count > 3 ? '大会议室' : '中会议室')
    const location = schedule.meta?.location || schedule.location || ''
    const meetingTime = schedule.meta?.meetingTime || `${schedule.startTime} - ${schedule.endTime}`

    // 线上会议不需要预订
    if (roomType === '线上会议') {
      return {
        type: 'action_notice',
        text: '📹 已设置为线上会议，无需预订实体会议室。'
      }
    }

    const roomName = roomType === '大会议室' ? '大会议室 (Board Room)' 
                   : roomType === '中会议室' ? '中型会议室 (Meeting Room A)'
                   : '小会议室 (Meeting Room B)'

    return {
      type: 'resource_card',
      data: {
        icon: 'fa-door-closed',
        title: roomName,
        price: 0,
        details: `${meetingTime} · ${count} 人 · ${roomType}${location ? ' · ' + location : ''}<br><span class="text-xs text-blue-500">（参数已确认）</span>`,
        resourceType: 'room'
      } as ResourceCardData
    }
  },

  /**
   * 通知参会人技能
   */
  notify_attendees: async (schedule: Schedule): Promise<SkillResult> => {
    if (!schedule.attendees || schedule.attendees.length === 0) {
      return {
        type: 'action_notice',
        text: '⚠️ 暂无参会人，请先执行[通讯录查询]或手动添加人员。'
      }
    }

    let location = '线上会议'
    let locationSource = '默认'

    if (schedule.resources?.length > 0) {
      const room = schedule.resources.find(r => r.resourceType === 'room' || r.icon.includes('door'))
      if (room) {
        location = room.name
        locationSource = '已锁定资源'
      }
    }

    const names = schedule.attendees.map(n => n.split('(')[0]).join('、')

    return {
      type: 'action_notice',
      text: `📧 已向 ${schedule.attendees.length} 位参会人发送邀请：${names}<br><span class="text-xs text-gray-400">地点：${location} （来源：${locationSource}）</span>`
    }
  },

  /**
   * 通讯录查询技能
   */
  search_contacts: async (schedule: Schedule): Promise<SkillResult> => {
    if (!schedule.attendees || schedule.attendees.length === 0) {
      return {
        type: 'ask_attendees',
        text: '需要通知谁？'
      }
    }

    const rows: AttendeeRow[] = []
    let hasConflict = false

    for (const name of schedule.attendees) {
      // 如果已经包含部门信息 (格式: "姓名(部门)")
      if (name.includes('(')) {
        const match = name.match(/\((.*?)\)/)
        rows.push({
          uid: crypto.randomUUID(),
          name: name.split('(')[0] || name,
          dept: match && match[1] ? match[1] : '',
          email: 'confirmed',
          title: '-',
          isAmbiguous: false,
          deleted: false
        })
        continue
      }

      // 在通讯录中查找
      const matches = MOCK_DIRECTORY.filter(u => u.name === name)

      if (matches.length > 1) {
        // 重名情况
        hasConflict = true
        matches.forEach(m => {
          rows.push({
            uid: m.id,
            name: m.name,
            dept: m.dept,
            email: m.email,
            title: m.title,
            isAmbiguous: true,
            deleted: false
          })
        })
      } else if (matches.length === 1) {
        // 唯一匹配
        const m = matches[0]
        if (m) {
          rows.push({
            uid: m.id,
            name: m.name,
            dept: m.dept,
            email: m.email,
            title: m.title,
            isAmbiguous: false,
            deleted: false
          })
        }
      } else {
        // 未找到，标记为外部人员
        rows.push({
          uid: crypto.randomUUID(),
          name: name,
          dept: '外部人员',
          email: '-',
          title: '-',
          isAmbiguous: false,
          deleted: false
        })
      }
    }

    return {
      type: 'attendee_table',
      data: {
        rows,
        hasConflict,
        confirmed: false
      } as AttendeeTableData
    }
  },

  /**
   * 叫车技能
   */
  call_car: async (_schedule: Schedule): Promise<SkillResult> => {
    return {
      type: 'action_notice',
      text: '🚖 已预约专车。'
    }
  }
}

/**
 * 执行技能
 * @param skillCode 技能代码
 * @param schedule 日程数据
 * @param confirmedParams 用户确认的参数（可选，若有则跳过参数确认）
 */
export async function executeSkill(
  skillCode: string, 
  schedule: Schedule,
  confirmedParams?: Record<string, string | number>
): Promise<SkillResult> {
  // 如果技能需要参数确认，且尚未提供确认参数
  if (needParamConfirm(skillCode) && !confirmedParams) {
    const extractor = paramExtractors[skillCode]
    if (extractor) {
      const paramData = extractor(schedule)
      return {
        type: 'param_confirm',
        data: paramData
      }
    }
  }

  // 如果有确认参数，先应用到 schedule
  if (confirmedParams) {
    schedule = applyConfirmedParams(schedule, skillCode, confirmedParams)
  }

  // 执行原有的技能处理逻辑
  const handler = skillHandlers[skillCode]
  
  if (!handler) {
    // 通用技能处理
    return {
      type: 'action_notice',
      text: `✨ 通用技能 [${skillCode}] 执行完毕。<br><span class="text-xs text-gray-400">（此为自定义技能，无特定业务逻辑）</span>`
    }
  }

  return await handler(schedule)
}

/**
 * 注册自定义技能
 */
export function registerSkill(code: string, handler: SkillHandler): void {
  skillHandlers[code] = handler
}

/**
 * 检查技能是否存在
 */
export function hasSkillHandler(code: string): boolean {
  return code in skillHandlers
}
