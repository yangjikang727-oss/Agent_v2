/**
 * 获取星期几
 */
export function getWeekDay(date: string): string {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(date).getDay()] || ''
}

/**
 * 计算时间轴上的位置 (px)
 */
export function calculateTimePosition(
  time: string, 
  hourHeight: number = 80, 
  startHour: number = 7
): number {
  const parts = time.split(':').map(Number)
  const h = parts[0] || 0
  const m = parts[1] || 0
  return (h - startHour) * hourHeight + (m / 60) * hourHeight
}

/**
 * 计算事件卡片高度 (px)
 */
export function calculateEventHeight(
  startTime: string, 
  endTime: string, 
  hourHeight: number = 80,
  minHeight: number = 45
): number {
  const startParts = startTime.split(':').map(Number)
  const endParts = endTime.split(':').map(Number)
  const startH = startParts[0] || 0
  const startM = startParts[1] || 0
  const endH = endParts[0] || 0
  const endM = endParts[1] || 0
  
  let durationMin = (endH * 60 + endM) - (startH * 60 + startM)
  if (durationMin < minHeight) durationMin = minHeight
  
  return (durationMin / 60) * hourHeight
}

/**
 * 计算结束时间（默认1小时后）
 * @param startTime 开始时间 HH:MM
 * @param durationMinutes 持续分钟数，默认60分钟
 */
export function getEndTime(startTime: string, durationMinutes: number = 60): string {
  const parts = startTime.split(':').map(Number)
  const hours = parts[0] || 0
  const minutes = parts[1] || 0
  
  const start = new Date()
  start.setHours(hours, minutes, 0, 0)
  
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
}

/**
 * 获取当前时间在时间轴上的位置
 * 时间轴显示 8:00 - 21:00，每小时 80px
 */
export function getCurrentTimePosition(hourHeight: number = 80, startHour: number = 8): number {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  
  // 如果超出时间轴范围，不显示当前时间线
  if (h < startHour || h >= startHour + 14) return -10
  
  // 加上 20px 的偏移（与背景线位置一致）
  const offset = 20
  return (h - startHour) * hourHeight + (m / 60) * hourHeight + offset
}

/**
 * 标准化时间格式为 HH:MM
 * 支持输入："9:00", "09:00", "9:0", "14:30" 等
 */
export function normalizeTime(time: string): string {
  if (!time) return ''
  const parts = time.split(':').map(s => parseInt(s, 10))
  const h = parts[0] || 0
  const m = parts[1] || 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 将时间转换为分钟数（用于比较）
 * "09:30" -> 570
 */
export function timeToMinutes(time: string): number {
  const parts = time.split(':').map(s => parseInt(s, 10))
  const h = parts[0] || 0
  const m = parts[1] || 0
  return h * 60 + m
}
