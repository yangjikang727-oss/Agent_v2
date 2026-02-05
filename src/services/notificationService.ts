/**
 * 浏览器推送通知服务
 * 
 * 通知规则：
 * - 会议日程(meeting)：开始前1小时推送，开始前5分钟提醒
 * - 出行日程(trip)：开始前4小时推送
 */

import type { Schedule, ScheduleType } from '../types'

// 通知配置：不同类型日程的提醒时间（分钟）
const NOTIFICATION_CONFIG: Record<ScheduleType, number[]> = {
  meeting: [60, 5],      // 会议：1小时、5分钟
  trip: [240],           // 出行：4小时
  general: [30]          // 通用：30分钟
}

// 已发送的通知记录（避免重复推送）
const sentNotifications = new Set<string>()

// 定时器ID
let checkIntervalId: number | null = null

/**
 * 请求浏览器通知权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('当前浏览器不支持通知功能')
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission === 'denied') {
    console.warn('用户已拒绝通知权限')
    return false
  }

  // 请求权限
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

/**
 * 获取通知权限状态
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

/**
 * 发送浏览器通知
 */
export function sendNotification(title: string, options?: NotificationOptions): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return null
  }

  const notification = new Notification(title, {
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    ...options
  })

  // 点击通知时聚焦窗口
  notification.onclick = () => {
    window.focus()
    notification.close()
  }

  return notification
}

/**
 * 生成通知唯一标识（用于去重）
 */
function getNotificationKey(scheduleId: string, minutesBefore: number): string {
  return `${scheduleId}_${minutesBefore}`
}

/**
 * 计算日程开始时间与当前时间的差值（分钟）
 */
function getMinutesUntilStart(schedule: Schedule): number {
  const now = new Date()
  const [hours, minutes] = schedule.startTime.split(':').map(Number)
  
  const scheduleDateTime = new Date(schedule.date)
  scheduleDateTime.setHours(hours || 0, minutes || 0, 0, 0)
  
  const diffMs = scheduleDateTime.getTime() - now.getTime()
  return Math.floor(diffMs / (1000 * 60))
}

/**
 * 获取日程类型的中文名称
 */
function getScheduleTypeName(type: ScheduleType): string {
  const names: Record<ScheduleType, string> = {
    meeting: '会议',
    trip: '出行',
    general: '日程'
  }
  return names[type] || '日程'
}

/**
 * 获取提醒时间的中文描述
 */
function getTimeDescription(minutesBefore: number): string {
  if (minutesBefore >= 60) {
    const hours = Math.floor(minutesBefore / 60)
    return `${hours}小时后`
  }
  return `${minutesBefore}分钟后`
}

/**
 * 检查并发送日程通知
 */
export function checkAndNotify(schedules: Schedule[]): void {
  const now = new Date()
  const today = now.toISOString().split('T')[0] || ''

  for (const schedule of schedules) {
    // 只检查今天及之后的日程
    if (!today || schedule.date < today) continue

    const minutesUntil = getMinutesUntilStart(schedule)
    
    // 已经开始或过期的日程不通知
    if (minutesUntil < 0) continue

    // 获取该类型日程的通知时间点
    const notifyTimes = NOTIFICATION_CONFIG[schedule.type] || NOTIFICATION_CONFIG.general

    for (const minutesBefore of notifyTimes) {
      const key = getNotificationKey(schedule.id, minutesBefore)
      
      // 已发送过此通知，跳过
      if (sentNotifications.has(key)) continue

      // 检查是否在通知时间窗口内（允许1分钟误差）
      if (minutesUntil <= minutesBefore && minutesUntil > minutesBefore - 2) {
        const typeName = getScheduleTypeName(schedule.type)
        const timeDesc = getTimeDescription(minutesUntil)
        
        sendNotification(`${typeName}提醒`, {
          body: `「${schedule.content}」将在${timeDesc}开始\n时间：${schedule.startTime} - ${schedule.endTime}`,
          tag: key,
          requireInteraction: minutesBefore <= 5 // 5分钟内的提醒需要用户手动关闭
        })

        // 记录已发送
        sentNotifications.add(key)
        
        console.log(`[通知] ${typeName}提醒已发送: ${schedule.content} (${minutesBefore}分钟前)`)
      }
    }
  }
}

/**
 * 启动通知服务
 * @param getSchedules 获取日程列表的函数
 * @param intervalMs 检查间隔（毫秒），默认30秒
 */
export function startNotificationService(
  getSchedules: () => Schedule[],
  intervalMs: number = 30000
): void {
  // 先停止已有的定时器
  stopNotificationService()

  // 请求权限
  requestNotificationPermission().then(granted => {
    if (!granted) {
      console.warn('通知权限未授予，通知服务未启动')
      return
    }

    console.log('[通知服务] 已启动，检查间隔:', intervalMs / 1000, '秒')

    // 立即检查一次
    checkAndNotify(getSchedules())

    // 设置定时检查
    checkIntervalId = window.setInterval(() => {
      checkAndNotify(getSchedules())
    }, intervalMs)
  })
}

/**
 * 停止通知服务
 */
export function stopNotificationService(): void {
  if (checkIntervalId !== null) {
    clearInterval(checkIntervalId)
    checkIntervalId = null
    console.log('[通知服务] 已停止')
  }
}

/**
 * 清除已发送通知记录（用于测试）
 */
export function clearSentNotifications(): void {
  sentNotifications.clear()
}

/**
 * 手动触发日程通知（用于测试）
 */
export function triggerTestNotification(schedule: Schedule, minutesBefore: number = 5): void {
  const typeName = getScheduleTypeName(schedule.type)
  const timeDesc = getTimeDescription(minutesBefore)
  
  sendNotification(`${typeName}提醒 (测试)`, {
    body: `「${schedule.content}」将在${timeDesc}开始\n时间：${schedule.startTime} - ${schedule.endTime}`,
    tag: `test_${schedule.id}`,
    requireInteraction: false
  })
}
