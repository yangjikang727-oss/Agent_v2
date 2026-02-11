/**
 * 日程状态管理
 * 
 * 管理所有日程的 CRUD 操作，提供：
 * - 当天日程过滤（含跨天行程支持）
 * - 日期切换与导航
 * - 时间冲突检测
 * - 资源/参会人/议程的更新
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Schedule, Resource } from '../types'
import { timeToMinutes } from '../utils/dateUtils'

// 禁排时段（分钟数）：不允许在这些时段内安排日程
const BLOCKED_PERIODS = [
  { start: 0, end: 510 },    // 00:00 - 08:30
  { start: 720, end: 810 }   // 12:00 - 13:30
]

// 优先可排时段（工作时间）——推荐时优先使用
const PRIORITY_WINDOWS = [
  { start: 510, end: 720 },   // 08:30 - 12:00
  { start: 810, end: 1050 }   // 13:30 - 17:30
]

// 扩展可排时段（加班时间）——仅在优先时段无可用时启用
const EXTENDED_WINDOWS = [
  { start: 1050, end: 1440 }  // 17:30 - 24:00
]

// 全部可排时段 = 优先 + 扩展
const ALL_ALLOWED_WINDOWS = [...PRIORITY_WINDOWS, ...EXTENDED_WINDOWS]

// 一天的总分钟数上限（24:00）
const DAY_END_MINUTES = 1440

/**
 * 将分钟数向上对齐到最近的15分钟整数倍
 * 例如：512 → 525 (8:45)，510 → 510 (8:30)，516 → 525 (8:45)
 */
function roundUpTo15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15
}

/**
 * 将分钟数向下对齐到最近的15分钟整数倍
 * 例如：524 → 510 (8:30)，525 → 525 (8:45)
 */
function roundDownTo15(minutes: number): number {
  return Math.floor(minutes / 15) * 15
}

/**
 * 判断时段是否完全落在允许的窗口内
 */
function isInAllowedWindow(
  startMin: number,
  endMin: number,
  windows: Array<{ start: number; end: number }>
): boolean {
  return windows.some(w => startMin >= w.start && endMin <= w.end)
}

/**
 * 分钟数转 HH:MM 字符串
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const useScheduleStore = defineStore('schedule', () => {
  // 状态
  const schedules = ref<Schedule[]>([])
  const currentDate = ref<string>(new Date().toISOString().split('T')[0] || '')
  
  // 获取系统当前日期
  const systemCurrentDate = computed(() => new Date().toISOString().split('T')[0])

  // 计算属性：当天日程（包括跨天行程）
  const currentDaySchedules = computed(() => {
    const current = currentDate.value
    return schedules.value
      .filter(s => {
        // 普通日程：直接匹配 date
        if (!s.endDate) {
          return s.date === current
        }
        // 跨天行程：检查 current 是否在 date 和 endDate 之间
        return current >= s.date && current <= s.endDate
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  })

  // 计算属性：统计
  const dailyStats = computed(() => ({
    total: currentDaySchedules.value.length
  }))

  // 切换日期
  function changeDate(delta: number) {
    const baseDate = currentDate.value || new Date().toISOString().split('T')[0] || ''
    const dt = new Date(baseDate)
    dt.setDate(dt.getDate() + delta)
    currentDate.value = dt.toISOString().split('T')[0] || ''
  }

  // 回到当前日期 (系统时间)
  function resetToToday() {
    currentDate.value = new Date().toISOString().split('T')[0] || ''
  }

  // 设置日期
  function setDate(date: string) {
    currentDate.value = date
  }

  // 添加日程（内置冲突检测防护）
  function addSchedule(schedule: Schedule): boolean {
    // 最后一道防线：检测冲突
    const conflict = checkConflict(schedule.date, schedule.startTime, schedule.endTime)
    if (conflict) {
      return false
    }
    schedules.value.push(schedule)
    return true
  }

  // 更新日程
  function updateSchedule(id: string, updates: Partial<Schedule>) {
    const idx = schedules.value.findIndex(s => s.id === id)
    if (idx !== -1) {
      const updated = { ...schedules.value[idx], ...updates }
      // 确保必需字段存在
      if (updated.id && updated.content && updated.date && updated.startTime && updated.endTime) {
        schedules.value[idx] = updated as Schedule
      }
    }
  }

  // 删除日程
  function deleteSchedule(id: string) {
    schedules.value = schedules.value.filter(s => s.id !== id)
  }

  // 获取日程
  function getSchedule(id: string): Schedule | undefined {
    return schedules.value.find(s => s.id === id)
  }

  // 添加资源到日程
  function addResource(scheduleId: string, resource: Resource) {
    const schedule = schedules.value.find(s => s.id === scheduleId)
    if (schedule) {
      schedule.resources.push(resource)
    }
  }

  // 更新日程参会人
  function updateAttendees(scheduleId: string, attendees: string[]) {
    const schedule = schedules.value.find(s => s.id === scheduleId)
    if (schedule) {
      schedule.attendees = attendees
    }
  }

  // 更新日程议程
  function updateAgenda(scheduleId: string, agenda: string) {
    const schedule = schedules.value.find(s => s.id === scheduleId)
    if (schedule) {
      schedule.agenda = agenda
    }
  }

  // 检测时间冲突（使用数字比较避免字符串格式问题，支持跨天日程）
  function checkConflict(date: string, startTime: string, endTime: string, excludeId?: string): Schedule | null {
    // 防护：参数无效时返回 null
    if (!date || !startTime || !endTime) {
      console.warn('[checkConflict] 参数无效:', { date, startTime, endTime })
      return null
    }
    
    const newStart = timeToMinutes(startTime)
    const newEnd = timeToMinutes(endTime)
    
    return schedules.value.find(s => {
      if (s.id === excludeId) return false
      
      // 检查日期是否相关：同一天，或者新日程日期落在跨天日程的日期范围内
      const dateMatch = s.date === date || 
        (s.endDate && date >= s.date && date <= s.endDate)
      if (!dateMatch) return false
      
      // 跨天日程：根据查询日期调整冲突检测的有效时间范围
      let existStart: number
      let existEnd: number
      if (s.endDate && s.date !== s.endDate) {
        if (date === s.date) {
          // 出发日：从 startTime 到当天结束
          existStart = timeToMinutes(s.startTime)
          existEnd = DAY_END_MINUTES
        } else if (date === s.endDate) {
          // 返程日：从当天开始到 endTime
          existStart = 0
          existEnd = timeToMinutes(s.endTime)
        } else {
          // 中间日：全天占用
          existStart = 0
          existEnd = DAY_END_MINUTES
        }
      } else {
        existStart = timeToMinutes(s.startTime)
        existEnd = timeToMinutes(s.endTime)
      }
      
      // 冲突条件：
      // 1. 新日程开始时间在现有日程时间范围内
      // 2. 新日程结束时间在现有日程时间范围内
      // 3. 新日程完全包含现有日程
      return (
        (newStart >= existStart && newStart < existEnd) ||
        (newEnd > existStart && newEnd <= existEnd) ||
        (newStart <= existStart && newEnd >= existEnd)
      )
    }) || null
  }

  // 清空所有日程
  function clearAll() {
    schedules.value = []
    currentDate.value = new Date().toISOString().split('T')[0] || ''
  }

  /**
   * 获取下一个工作日（跳过周六日）
   */
  function getNextWorkday(dateStr: string): string {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + 1)
    // 跳过周末：周六(6)→周一, 周日(0)→周一
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1)
    }
    return d.toISOString().split('T')[0] || dateStr
  }

  /**
   * 双向查找离原始时间最近的可用时段
   * 在冲突日程前后同时搜索，跳过禁排时段和已有日程
   * @param minStartMin 最小起始时间（分钟），用于过滤当前时间之前的时段
   * @returns { start: HH:MM, end: HH:MM } 或 null
   */
  function findNearestAvailableSlot(
    date: string,
    originalStartTime: string,
    duration: number,
    excludeId?: string,
    minStartMin?: number,
    additionalOccupied?: Array<{ start: number; end: number }>
  ): { start: string; end: string } | null {
    const originalStart = timeToMinutes(originalStartTime)
    
    // 获取当天所有已有日程的占用时段（排序），合并额外占用
    const occupied = getOccupiedSlots(date, excludeId)
    if (additionalOccupied) {
      occupied.push(...additionalOccupied)
      occupied.sort((a, b) => a.start - b.start)
    }
    
    // 策略：先在优先时段（工作时间）找，找不到再扩展到加班时段
    for (const windows of [PRIORITY_WINDOWS, ALL_ALLOWED_WINDOWS]) {
      // 向后搜索
      const forwardSlot = findSlotInDirection(originalStart, duration, occupied, 'forward', windows, minStartMin)
      // 向前搜索
      const backwardSlot = findSlotInDirection(originalStart, duration, occupied, 'backward', windows, minStartMin)
      
      if (!forwardSlot && !backwardSlot) continue
      if (!forwardSlot) return { start: minutesToTime(backwardSlot!.startMin), end: minutesToTime(backwardSlot!.endMin) }
      if (!backwardSlot) return { start: minutesToTime(forwardSlot.startMin), end: minutesToTime(forwardSlot.endMin) }
      
      // 选择离原始时间最近的
      const forwardDist = Math.abs(forwardSlot.startMin - originalStart)
      const backwardDist = Math.abs(backwardSlot.startMin - originalStart)
      
      const chosen = forwardDist <= backwardDist ? forwardSlot : backwardSlot
      return { start: minutesToTime(chosen.startMin), end: minutesToTime(chosen.endMin) }
    }
    
    return null
  }

  /**
   * 在指定方向查找可用时段
   * @param allowedWindows 允许安排的时段窗口列表
   * @param minStartMin 最小起始时间（分钟），候选时段起始必须 >= 此值
   */
  function findSlotInDirection(
    fromMin: number,
    duration: number,
    occupied: Array<{ start: number; end: number }>,
    direction: 'forward' | 'backward',
    allowedWindows: Array<{ start: number; end: number }>,
    minStartMin?: number
  ): { startMin: number; endMin: number } | null {
    const step = 15 // 每次移动15分钟（对齐到15分钟整数倍）
    const maxIterations = 200 // 最多搜索 200 步
    
    // 初始 cursor 对齐到15分钟边界
    let cursor = direction === 'forward'
      ? roundUpTo15(fromMin)            // 向后搜索：向上对齐
      : roundDownTo15(fromMin - duration) // 向前搜索：向下对齐
    
    for (let i = 0; i < maxIterations; i++) {
      const candidateStart = cursor
      const candidateEnd = cursor + duration
      
      // 边界检查
      if (candidateStart < 0) break
      if (candidateEnd > DAY_END_MINUTES) break
      
      // 过滤当前时间之前的时段
      if (minStartMin !== undefined && candidateStart < minStartMin) {
        if (direction === 'backward') break // 向前搜索已经到了当前时间之前，停止
        cursor += step // 向后搜索跳过
        continue
      }
      
      // 检查是否在允许的时段窗口内
      if (isInAllowedWindow(candidateStart, candidateEnd, allowedWindows)) {
        // 检查是否与已有日程冲突
        const hasConflict = occupied.some(slot =>
          (candidateStart < slot.end && candidateEnd > slot.start)
        )
        
        if (!hasConflict) {
          return { startMin: candidateStart, endMin: candidateEnd }
        }
      }
      
      cursor += direction === 'forward' ? step : -step
    }
    
    return null
  }

  /**
   * 获取指定日期已占用的时段列表（按开始时间排序）
   */
  function getOccupiedSlots(date: string, excludeId?: string): Array<{ start: number; end: number }> {
    return schedules.value
      .filter(s => {
        if (s.id === excludeId) return false
        const dateMatch = s.date === date ||
          (s.endDate && date >= s.date && date <= s.endDate)
        return dateMatch
      })
      .map(s => {
        // 跨天日程：根据查询日期调整占用时间范围
        if (s.endDate && s.date !== s.endDate) {
          if (date === s.date) {
            // 出发日：从 startTime 到当天结束
            return { start: timeToMinutes(s.startTime), end: DAY_END_MINUTES }
          } else if (date === s.endDate) {
            // 返程日：从当天开始到 endTime
            return { start: 0, end: timeToMinutes(s.endTime) }
          } else {
            // 中间日：全天占用
            return { start: 0, end: DAY_END_MINUTES }
          }
        }
        return {
          start: timeToMinutes(s.startTime),
          end: timeToMinutes(s.endTime)
        }
      })
      .sort((a, b) => a.start - b.start)
  }

  /**
   * 扫描指定日期的所有可用空闲时段
   * 优先搜索工作时段（08:30-12:00, 13:30-17:30），
   * 若无可用再扩展搜索加班时段（17:30-24:00）
   * @param minStartMin 最小起始时间（分钟），过滤当前时间之前的时段
   * @returns 可用时段列表 [{ start: HH:MM, end: HH:MM }]
   */
  function findAvailableSlots(
    date: string,
    duration: number,
    excludeId?: string,
    minStartMin?: number,
    additionalOccupied?: Array<{ start: number; end: number }>
  ): Array<{ start: string; end: string }> {
    const occupied = getOccupiedSlots(date, excludeId)
    if (additionalOccupied) {
      occupied.push(...additionalOccupied)
      occupied.sort((a, b) => a.start - b.start)
    }
    
    // 先在优先时段（工作时间）内查找
    const priorityResults = scanWindows(PRIORITY_WINDOWS, occupied, duration, minStartMin)
    if (priorityResults.length > 0) return priorityResults
    
    // 优先时段无可用，扩展到全部可排时段
    return scanWindows(ALL_ALLOWED_WINDOWS, occupied, duration, minStartMin)
  }

  /**
   * 在指定窗口列表内扫描空闲时段
   */
  function scanWindows(
    windows: Array<{ start: number; end: number }>,
    occupied: Array<{ start: number; end: number }>,
    duration: number,
    minStartMin?: number
  ): Array<{ start: string; end: string }> {
    const result: Array<{ start: string; end: string }> = []
    
    for (const window of windows) {
      // 如果设置了 minStartMin，窗口起点不能早于它（并对齐到15分钟边界）
      const effectiveMin = minStartMin !== undefined ? roundUpTo15(Math.max(window.start, minStartMin)) : window.start
      let cursor = effectiveMin
      
      // 如果 cursor 已超出窗口，跳过
      if (cursor >= window.end) continue
      
      // 获取在此窗口内的占用时段
      const windowOccupied = occupied.filter(o => o.start < window.end && o.end > window.start)
      
      for (const slot of windowOccupied) {
        // cursor 到 slot.start 之间是空闲的
        const rawGapStart = Math.max(cursor, window.start)
        const gapStart = roundUpTo15(rawGapStart) // 对齐到15分钟整数倍
        const gapEnd = Math.min(slot.start, window.end)
        
        if (gapEnd - gapStart >= duration) {
          result.push({
            start: minutesToTime(gapStart),
            end: minutesToTime(gapStart + duration)
          })
        }
        
        cursor = Math.max(cursor, slot.end)
      }
      
      // 最后一个占用时段之后到窗口结束
      const rawFinalGapStart = Math.max(cursor, window.start)
      const finalGapStart = roundUpTo15(rawFinalGapStart) // 对齐到15分钟整数倍
      const finalGapEnd = window.end
      if (finalGapEnd - finalGapStart >= duration) {
        result.push({
          start: minutesToTime(finalGapStart),
          end: minutesToTime(finalGapStart + duration)
        })
      }
    }
    
    return result
  }

  return {
    // 状态
    schedules,
    currentDate,
    systemCurrentDate,
    // 计算属性
    currentDaySchedules,
    dailyStats,
    // 方法
    changeDate,
    resetToToday,
    setDate,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    getSchedule,
    addResource,
    updateAttendees,
    updateAgenda,
    checkConflict,
    clearAll,
    getNextWorkday,
    findNearestAvailableSlot,
    findAvailableSlots
  }
})
