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
      
      const existStart = timeToMinutes(s.startTime)
      const existEnd = timeToMinutes(s.endTime)
      
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
    clearAll
  }
})
