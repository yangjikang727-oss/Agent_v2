import type { Schedule } from './schedule'
import type { ResourceCardData, TransportSelectorData, AttendeeTableData, ParamConfirmData, FlightListData, HotelListData, TripApplicationData, PaymentOrderItem } from './message'

// 技能元数据
export interface SkillMeta {
  code: string
  name: string
  icon: string
  description: string
  url?: string
  method?: string
  params?: SkillParam[]
}

// 技能参数
export interface SkillParam {
  key: string
  type: string
  desc: string
}

// 场景配置
export interface Scenario {
  code: string
  name: string
  keywords: string
  skills: string[]
}

// 自动订单数据（用于航班/酒店自动预下单）
export interface AutoOrderData {
  scheduleId: string
  orderType: 'flight' | 'hotel'
  orderItem: PaymentOrderItem
  message: string
}

// 技能执行结果
export interface SkillResult {
  type: 'action_notice' | 'resource_card' | 'transport_selector' | 'attendee_table' | 'ask_attendees' | 'param_confirm' | 'flight_list' | 'hotel_list' | 'ask_hotel_location' | 'trip_application' | 'auto_order'
  text?: string
  data?: ResourceCardData | TransportSelectorData | AttendeeTableData | ParamConfirmData | FlightListData | HotelListData | TripApplicationData | AutoOrderData
}

// 技能处理函数类型
export type SkillHandler = (schedule: Schedule) => Promise<SkillResult>

// 通讯录用户
export interface DirectoryUser {
  id: string
  name: string
  dept: string
  email: string
  title: string
}

// 默认技能元数据
export const DEFAULT_SKILLS: SkillMeta[] = [
  { code: 'apply_trip', name: '出差申请', icon: 'fa-file-lines', description: '提交出差申请表单' },
  { code: 'arrange_transport', name: '交通安排', icon: 'fa-map-location-dot', description: '智能匹配/选择交通工具' },
  { code: 'check_hotel', name: '预订酒店', icon: 'fa-hotel', description: '住宿安排' },
  { code: 'book_meeting_room', name: '预订会议室', icon: 'fa-door-open', description: '资源锁定' },
  { code: 'search_contacts', name: '通讯录查询', icon: 'fa-address-book', description: '人员消歧与确认' },
  { code: 'notify_attendees', name: '通知参会人', icon: 'fa-envelope', description: '发送邀请' }
]

// 默认场景配置
export const DEFAULT_SCENARIOS: Scenario[] = [
  { code: 'TRIP', name: '差旅出行', keywords: '出差,飞,前往,机票,酒店', skills: ['apply_trip', 'arrange_transport', 'check_hotel'] },
  { code: 'MEETING', name: '会议', keywords: '例会,会议,复盘,沟通,开会,约,聊,讨论', skills: ['search_contacts', 'book_meeting_room', 'notify_attendees'] }
]
