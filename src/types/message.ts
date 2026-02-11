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

// 消息
export interface Message {
  id: number
  role: MessageRole
  type: MessageType
  content: string
  thoughts?: string[]
  data?: Task[] | ResourceCardData | TransportSelectorData | AttendeeTableData | ParamConfirmData | ScheduleListData | FlightListData | HotelListData | TripApplicationData | NotifyOptionData | PaymentOrderData | null
}
