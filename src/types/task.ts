/**
 * 任务数据模型
 * 
 * 定义任务(Task)和任务状态(TaskStatus)类型。
 * 任务是日程下的可执行操作单元，如预订会议室、通知参会人等。
 */

import type { PaymentOrderItem } from './message'

// 任务状态
export type TaskStatus = 'pending' | 'done' | 'skipped'

// 任务
export interface Task {
  id: string
  scheduleId: string
  title: string
  desc: string
  icon: string
  skill: string
  actionBtn: string
  date: string
  status: TaskStatus
  meta?: {
    taskType?: 'payment'           // 任务类型：支付任务
    paymentOrders?: PaymentOrderItem[]  // 待支付订单列表
    totalAmount?: number           // 总金额
    [key: string]: any
  }
}
