/**
 * ReAct 模式专用：自动预下单辅助模块
 * 
 * Human out of the loop：调用传统 executeSkill 获取推荐列表后，
 * 自动选择推荐项并生成订单，无需人工干预。
 * 
 * 不修改任何传统模式代码。
 */

import type { FlightOption, HotelOption, FlightListData, HotelListData, PaymentOrderItem, PaymentOrderData } from '../../types/message'
import type { Task } from '../../types/task'
import type { Schedule } from '../../types/schedule'
import { executeSkill } from '../traditional/skillRegistry'

// ==================== 自动选择逻辑 ====================

/** 从航班列表中自动选择推荐航班 */
export function selectRecommendedFlight(flights: FlightOption[]): FlightOption | null {
  if (flights.length === 0) return null

  // 优先选择带"推荐"标签的
  const recommended = flights.find(f => f.tags?.includes('推荐'))
  if (recommended) return recommended

  // 否则选择优先级最高的（priority 最小）
  const sorted = [...flights].sort((a, b) => a.priority - b.priority)
  return sorted[0] || null
}

/** 从酒店列表中自动选择推荐酒店 */
export function selectRecommendedHotel(hotels: HotelOption[]): HotelOption | null {
  if (hotels.length === 0) return null

  // 优先选择带"推荐"标签的
  const recommended = hotels.find(h => h.tags?.includes('推荐'))
  if (recommended) return recommended

  // 否则选择评分最高的
  const sorted = [...hotels].sort((a, b) => b.rating - a.rating)
  return sorted[0] || null
}

// ==================== 订单生成 ====================

/** 根据航班信息生成支付订单项 */
export function createFlightOrderItem(flight: FlightOption): PaymentOrderItem {
  return {
    id: `flight-order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'flight',
    title: `${flight.airline} ${flight.flightNo}`,
    details: `${flight.from} → ${flight.to} | ${flight.departTime}-${flight.arriveTime} | ${flight.duration}`,
    price: flight.price,
    paymentUrl: `https://flight.example.com/pay?order=${flight.flightNo}&price=${flight.price}`,
    status: 'pending'
  }
}

/** 根据酒店信息生成支付订单项 */
export function createHotelOrderItem(hotel: HotelOption, checkInDate: string, nights: number = 1): PaymentOrderItem {
  const totalPrice = hotel.price * nights
  return {
    id: `hotel-order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'hotel',
    title: hotel.name,
    details: `${hotel.address} | ${hotel.roomType} | ${checkInDate} 入住 ${nights}晚 | ${hotel.star}星级`,
    price: totalPrice,
    paymentUrl: `https://hotel.example.com/pay?order=${hotel.hotelId}&price=${totalPrice}`,
    status: 'pending'
  }
}

/** 创建统一支付任务 */
export function createPaymentTask(
  scheduleId: string,
  orders: PaymentOrderItem[],
  date: string
): Task {
  const totalAmount = orders.reduce((sum, order) => sum + order.price, 0)
  const flightCount = orders.filter(o => o.type === 'flight').length
  const hotelCount = orders.filter(o => o.type === 'hotel').length

  let title = '待支付订单'
  const parts: string[] = []
  if (flightCount > 0) parts.push(`${flightCount}个航班订单`)
  if (hotelCount > 0) parts.push(`${hotelCount}个酒店订单`)
  if (parts.length > 0) title = `待支付：${parts.join(' + ')}`

  return {
    id: `payment-task-${scheduleId}-${Date.now()}`,
    scheduleId,
    title,
    desc: `共 ${orders.length} 个订单，总金额 ¥${totalAmount}`,
    icon: 'fa-credit-card',
    skill: 'payment',
    actionBtn: '查看订单',
    date,
    status: 'pending',
    meta: {
      taskType: 'payment',
      paymentOrders: orders,
      totalAmount
    }
  }
}

// ==================== 核心：自动执行单个任务 ====================

export interface AutoExecResult {
  orderItems: PaymentOrderItem[]
  messages: string[]
}

/**
 * 自动执行任务并从返回的推荐列表中自动选择
 * 
 * 调用传统 executeSkill 获取 flight_list / hotel_list，
 * 然后自动选择推荐项，生成订单项返回。
 */
export async function autoExecuteTask(
  task: Task,
  schedule: Schedule
): Promise<AutoExecResult> {
  const result = await executeSkill(task.skill, schedule)
  const orderItems: PaymentOrderItem[] = []
  const messages: string[] = []

  if (result.type === 'flight_list' && result.data) {
    // 航班列表 → 自动选择推荐航班
    const flightData = result.data as FlightListData
    const selected = selectRecommendedFlight(flightData.flights)
    if (selected) {
      const orderItem = createFlightOrderItem(selected)
      orderItems.push(orderItem)
      messages.push(
        `✈️ 已为您自动预下单：${selected.airline} ${selected.flightNo}` +
        `（${selected.from}→${selected.to}，${selected.departTime}-${selected.arriveTime}），` +
        `价格 ¥${selected.price}`
      )
    } else {
      messages.push('⚠️ 未找到适合的航班。')
    }
  } else if (result.type === 'hotel_list' && result.data) {
    // 酒店列表 → 自动选择推荐酒店
    const hotelData = result.data as HotelListData
    const selected = selectRecommendedHotel(hotelData.hotels)
    if (selected) {
      // 计算入住天数
      let nights = 1
      if (schedule.endDate && schedule.date) {
        const start = new Date(schedule.date)
        const end = new Date(schedule.endDate)
        const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays > 0) nights = diffDays
      }
      const orderItem = createHotelOrderItem(selected, schedule.date, nights)
      orderItems.push(orderItem)
      messages.push(
        `🏨 已为您自动预下单：${selected.name}` +
        `（${selected.address}），` +
        `¥${selected.price}/晚 × ${nights}晚 = ¥${selected.price * nights}`
      )
    } else {
      messages.push('⚠️ 未找到适合的酒店。')
    }
  } else if (result.type === 'action_notice') {
    // 普通通知（如火车票提示等）
    if (result.text) messages.push(result.text)
  } else {
    // 其他类型（transport_selector / ask_hotel_location 等）
    console.warn('[autoOrderHelper] 未处理的技能结果类型:', result.type)
  }

  return { orderItems, messages }
}
