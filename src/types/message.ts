/**
 * 消息数据模型
 * 
 * 定义聊天面板中所有消息类型及其关联数据结构，包括：
 * 文本消息、航班/酒店推荐列表、出差申请表单、通知选项、待支付订单等。
 */

import type { Task } from './task'
import type { TransportMode, Schedule } from './schedule'

// 消息角色
export type MessageRole = 'user' | 'system'

// 消息类型
export type MessageType = 
  | 'text' 
  | 'action_list' 
  | 'resource_card' 
  | 'transport_selector' 
  | 'attendee_table'
  | 'action_notice'
  | 'param_confirm'
  | 'schedule_list'
  | 'flight_list'         // 航班列表类型
  | 'hotel_list'          // 酒店列表类型
  | 'trip_application'    // 出差申请表单
  | 'notify_option'       // 通知参会人选项
  | 'payment_order'       // 待支付订单
  | 'conflict_resolution' // 冲突解决推荐时段
  | 'schedule_query_result' // 日程查询结果
  | 'create_meeting'        // 会议创建表单
  | 'cancel_confirm'        // 取消日程确认
  | 'edit_confirm'          // 修改日程确认

// 交通选项
export interface TransportOption {
  key: TransportMode
  label: string
  icon: string
}

// 航班选项数据
export interface FlightOption {
  flightNo: string      // 航班号
  airline: string       // 航空公司
  departTime: string    // 起飞时间
  arriveTime: string    // 到达时间
  duration: string      // 飞行时长
  price: number         // 价格
  from: string          // 出发地
  to: string            // 目的地
  priority: number      // 优先级（1-5，数字越小优先级越高）
  tags?: string[]       // 标签：如 ["最便宜", "最快", "推荐"]
}

// 换单上下文（标记从支付清单发起的换单操作）
export interface ChangeOrderContext {
  paymentMsgId: number    // 支付清单所在消息 ID
  orderId: string         // 要替换的订单项 ID
}

// 航班列表数据
export interface FlightListData {
  scheduleId: string
  taskId?: string
  from: string
  to: string
  date: string
  flights: FlightOption[]
  selected: string | null  // 选中的航班号
  locked: boolean
  changeContext?: ChangeOrderContext  // 换单上下文
}

// 酒店选项数据
export interface HotelOption {
  hotelId: string       // 酒店ID
  name: string          // 酒店名称
  star: number          // 星级 (3-5)
  rating: number        // 评分 (0-5)
  price: number         // 价格
  distance: string      // 距离目的地
  address: string       // 地址
  amenities: string[]   // 设施（如 ["含早", "免费WiFi", "停车场"])
  roomType: string      // 房型
  tags?: string[]       // 标签：如 ["推荐", "性价比高"]
}

// 酒店列表数据
export interface HotelListData {
  scheduleId: string
  taskId?: string
  location: string      // 商圈/地点
  checkInDate: string   // 入住日期
  hotels: HotelOption[]
  selected: string | null  // 选中的酒店ID
  locked: boolean
  changeContext?: ChangeOrderContext  // 换单上下文
}

// 出差申请数据
export interface TripApplicationData {
  scheduleId: string
  taskId?: string
  startDate: string       // 开始日期
  endDate: string         // 结束日期
  startTime: string       // 开始时间
  endTime: string         // 结束时间
  from: string            // 出发地
  to: string              // 目的地
  transport: string       // 出行方式
  reason: string          // 出差理由
  status: 'draft' | 'submitted' | 'approved' | 'rejected'  // 申请状态
  submittedAt?: string    // 提交时间
}

// 通知选项数据
export interface NotifyOptionData {
  scheduleId: string
  scheduleContent: string   // 会议主题
  meetingTime: string       // 会议时间
  attendees: string[]       // 参会人
  selected: 'now' | 'before_15min' | null  // 选中的选项
  confirmed: boolean        // 是否已确认
}

// 待支付订单项
export interface PaymentOrderItem {
  id: string                // 订单ID
  type: 'flight' | 'hotel'  // 订单类型
  title: string             // 订单标题
  details: string           // 订单详情
  price: number             // 价格
  paymentUrl: string        // 支付链接
  status: 'pending' | 'paid' | 'cancelled'  // 订单状态
}

// 待支付订单数据
export interface PaymentOrderData {
  scheduleId: string
  taskId?: string
  orders: PaymentOrderItem[]   // 订单列表
  totalAmount: number          // 总金额
  confirmed: boolean           // 是否已确认查看
}

// 资源卡片数据
export interface ResourceCardData {
  icon: string
  title: string
  price: number
  details: string
  resourceType: 'transport' | 'hotel' | 'room'
  taskId?: string
  scheduleId?: string
}

// 交通选择器数据
export interface TransportSelectorData {
  scheduleId: string
  taskId?: string
  options: TransportOption[]
  selected: TransportMode | null
  locked: boolean
}

// 参会人行数据
export interface AttendeeRow {
  uid: string
  name: string
  dept: string
  email: string
  title: string
  isAmbiguous: boolean
  deleted: boolean
}

// 参会人表格数据
export interface AttendeeTableData {
  rows: AttendeeRow[]
  hasConflict: boolean
  confirmed: boolean
  scheduleId?: string
  taskId?: string
}

// 参数字段类型
export interface ParamField {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  value: string | number
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  required?: boolean
}

// 参数确认卡片数据
export interface ParamConfirmData {
  skillCode: string
  skillName: string
  skillIcon: string
  scheduleId: string
  taskId?: string
  fields: ParamField[]
  confirmed: boolean
  executing: boolean
}

// 日程列表数据
export interface ScheduleListData {
  schedules: Schedule[]
}

// 冲突解决推荐时段数据
export interface ConflictResolutionData {
  conflictInfo: {
    content: string
    startTime: string
    endTime: string
  }
  nearestSlot?: {                   // 就近推荐时段（第一层）
    date: string
    startTime: string
    endTime: string
  }
  availableSlots: Array<{           // 全部可选时段（第二/三层）
    date: string
    startTime: string
    endTime: string
  }>
  originalCtx: Record<string, any>  // 原始创建上下文（新日程）
  isNextDay: boolean                // 是否为跨日推荐
  selectedIndex: number | null      // 已选中的时段索引
  userAction: 'pending' | 'accepted' | 'cancelled' | 'show_more'  // 用户操作状态
  adjustTarget: 'pending' | 'existing' | 'new'  // 调整目标：pending=等待选择, existing=调整原日程, new=调整新日程
  existingScheduleId?: string       // 冲突的原日程 ID（用于调整原日程时更新）
  noSlotsMessage?: string           // 无可用时段时的提示信息（有值时进入 noSlots 状态）
}

// 日程查询结果中的日程项
export interface ScheduleQueryItem {
  id: string
  date: string
  startTime: string
  endTime: string
  endDate?: string
  content: string
  type: 'meeting' | 'trip' | 'general'
  location?: string
  attendees?: string[]
  resources?: Array<{ id: string; name: string; icon: string; resourceType: string }>
  meta?: Record<string, any>
}

// 会议创建表单数据
export interface CreateMeetingData {
  title: string
  startTime: string       // datetime-local 格式
  endTime: string
  location: string
  roomType: string
  attendees: string[]
  remarks: string
  status: 'draft' | 'submitted'  // draft=可编辑, submitted=锁定
}

// 日程查询结果数据
export interface ScheduleQueryResultData {
  queryDate?: string | null        // 查询日期
  queryKeyword?: string | null     // 查询关键词
  summary: string                  // LLM生成的摘要
  totalCount: number               // 总结果数
  schedules: ScheduleQueryItem[]   // 日程列表
}

// 取消日程确认数据
export interface CancelConfirmData {
  matchedSchedule: ScheduleQueryItem | null  // 系统匹配到的单个日程（单选模式）
  matchedSchedules: ScheduleQueryItem[]      // 系统匹配到的多个日程（批量模式）
  allSchedules: ScheduleQueryItem[]          // 全部候选日程（用于重新选择）
  userAction: 'pending' | 'cancelled' | 'kept'  // 用户操作状态
  selectedId: string | null                  // 最终选中要取消的日程ID（单选）
  selectedIds: string[]                      // 批量选中要取消的日程ID列表
  batchMode: boolean                         // 是否批量模式
}

// 修改日程确认数据
export interface EditConfirmData {
  matchedSchedule: ScheduleQueryItem | null  // 系统匹配到的日程
  allSchedules: ScheduleQueryItem[]          // 全部候选日程（用于重新选择）
  userAction: 'pending' | 'editing' | 'skipped'  // 用户操作状态
  selectedId: string | null                  // 最终选中要修改的日程ID
}

// 消息
export interface Message {
  id: number
  role: MessageRole
  type: MessageType
  content: string
  thoughts?: string[]
  data?: Task[] | ResourceCardData | TransportSelectorData | AttendeeTableData | ParamConfirmData | ScheduleListData | FlightListData | HotelListData | TripApplicationData | NotifyOptionData | PaymentOrderData | ConflictResolutionData | ScheduleQueryResultData | CreateMeetingData | CancelConfirmData | EditConfirmData | null
  timestamp?: number  // 消息时间戳（毫秒）
}
