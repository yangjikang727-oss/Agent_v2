/**
 * 支付订单辅助函数
 * 用于生成航班和酒店的待支付订单
 */

import type { PaymentOrderItem, FlightOption, HotelOption } from '../../types/message'
import type { Task } from '../../types/task'

/**
 * 根据航班信息生成支付订单项
 */
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

/**
 * 根据酒店信息生成支付订单项
 */
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

/**
 * 创建支付任务
 */
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
  
  if (parts.length > 0) {
    title = `待支付：${parts.join(' + ')}`
  }
  
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

/**
 * 选择推荐航班（优先选择带“推荐”标签的）
 */
export function selectRecommendedFlight(flights: FlightOption[]): FlightOption | null {
  if (flights.length === 0) return null
  
  // 优先选择带“推荐”标签的
  const recommended = flights.find(f => f.tags?.includes('推荐'))
  if (recommended) return recommended
  
  // 否则选择优先级最高的（priority最小）
  const sorted = flights.sort((a, b) => a.priority - b.priority)
  return sorted[0] || null
}

/**
 * 选择推荐酒店（优先选择带“推荐”标签的）
 */
export function selectRecommendedHotel(hotels: HotelOption[]): HotelOption | null {
  if (hotels.length === 0) return null
  
  // 优先选择带“推荐”标签的
  const recommended = hotels.find(h => h.tags?.includes('推荐'))
  if (recommended) return recommended
  
  // 否则选择评分最高的
  const sorted = hotels.sort((a, b) => b.rating - a.rating)
  return sorted[0] || null
}
