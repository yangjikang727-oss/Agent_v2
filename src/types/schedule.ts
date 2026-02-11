/**
 * 日程数据模型
 * 
 * 定义日程(Schedule)、资源(Resource)、交通方式(TransportMode)等核心类型，
 * 以及不同日程类型的主题配色方案。
 */

import type { PaymentOrderItem } from './message'

// 交通方式
export type TransportMode = 'flight' | 'train' | 'car' | 'ship' | 'other'

// 资源类型
export interface Resource {
  id: string
  name: string
  icon: string
  resourceType: 'transport' | 'hotel' | 'room'
}

// 日程类型
export type ScheduleType = 'meeting' | 'trip' | 'general'

// 日程
export interface Schedule {
  id: string
  content: string
  date: string
  startTime: string
  endTime: string
  endDate?: string        // 返程日期（仅跨天行程使用）
  type: ScheduleType
  location?: string
  resources: Resource[]
  attendees: string[]
  agenda: string
  meta?: {
    transport?: TransportMode
    roomType?: string
    location?: string
    attendeeCount?: number
    meetingTime?: string
    from?: string           // 出差出发地
    to?: string             // 出差目的地
    hotelLocation?: string  // 酒店商圈/地点
    tripApplied?: boolean   // 是否已提交出差申请
    pendingOrders?: PaymentOrderItem[]  // 待支付订单列表
  }
}

// 日程主题配置
export interface ScheduleTheme {
  border: string
  bg: string
  text: string
  shadow: string
}

export const SCHEDULE_THEMES: Record<ScheduleType, ScheduleTheme> = {
  meeting: { border: '#3b82f6', bg: '#eff6ff', text: '#1e3a8a', shadow: 'rgba(59, 130, 246, 0.1)' },
  trip: { border: '#8b5cf6', bg: '#f5f3ff', text: '#4c1d95', shadow: 'rgba(139, 92, 246, 0.1)' },
  general: { border: '#64748b', bg: '#f8fafc', text: '#334155', shadow: 'rgba(100, 116, 139, 0.1)' }
}
