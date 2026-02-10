import type { Tool, ToolContext, ToolResult } from '../services/react/toolRegistry'
import type { Schedule } from '../types'
import { timeToMinutes } from '../utils/dateUtils'

/**
 * 日期计算器工具
 * 用于解析相对日期表达式（如"今天"、"明天"、"下周三"等）
 */
export const dateCalculatorTool: Tool = {
  name: 'date_calculator',
  description: '计算相对日期，支持"今天"、"明天"、"后天"、"上周X"、"下周X"等表达式',
  category: 'utility',
  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: '日期表达式，如"今天"、"明天"、"下周三"',
      required: true
    },
    {
      name: 'referenceDate',
      type: 'string',
      description: '参考日期 (YYYY-MM-DD格式)，默认为当前日期',
      required: false
    }
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { expression, referenceDate } = params as { expression: string; referenceDate?: string }
      const refDate = referenceDate ? new Date(referenceDate) : new Date(context.currentDate)
      
      // 解析相对日期
      const result = parseRelativeDate(expression, refDate)
      
      if (!result) {
        return {
          success: false,
          error: `无法解析日期表达式: ${expression}`
        }
      }
      
      return {
        success: true,
        data: {
          originalExpression: expression,
          calculatedDate: result.toISOString().split('T')[0],
          dayOfWeek: getDayOfWeek(result),
          isWeekend: result.getDay() === 0 || result.getDay() === 6
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `日期计算错误: ${(error as Error).message}`
      }
    }
  }
}

/**
 * 日程查询工具
 * 查询用户的日程安排
 */
export const scheduleQueryTool: Tool = {
  name: 'schedule_query',
  description: '查询用户的日程安排，支持按日期、关键词搜索',
  category: 'query',
  parameters: [
    {
      name: 'date',
      type: 'string',
      description: '查询日期 (YYYY-MM-DD格式)',
      required: false
    },
    {
      name: 'keyword',
      type: 'string',
      description: '搜索关键词',
      required: false
    },
    {
      name: 'limit',
      type: 'number',
      description: '返回结果数量限制，默认10',
      required: false,
      default: 10
    }
  ],
  execute: async (params: { date?: string; keyword?: string; limit?: number }, context: ToolContext): Promise<ToolResult> => {
    try {
      const { date, keyword, limit = 10 } = params
      
      // 从store获取日程数据
      const schedules = context.scheduleStore.schedules || []
      
      let filtered = [...schedules]
      
      // 按日期过滤
      if (date) {
        filtered = filtered.filter((s: Schedule) => s.date === date)
      }
      
      // 按关键词过滤
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase()
        filtered = filtered.filter((s: Schedule) => 
          s.content.toLowerCase().includes(lowerKeyword) ||
          s.location?.toLowerCase().includes(lowerKeyword)
        )
      }
      
      // 限制结果数量
      const results = filtered.slice(0, limit)
      
      return {
        success: true,
        data: {
          totalCount: filtered.length,
          returnedCount: results.length,
          schedules: results.map((s: Schedule) => ({
            id: s.id,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            content: s.content,
            location: s.location,
            attendees: s.attendees
          }))
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `日程查询错误: ${(error as Error).message}`
      }
    }
  }
}

/**
 * 冲突检测工具
 * 检测时间段是否与其他日程冲突
 */
export const conflictDetectorTool: Tool = {
  name: 'conflict_detector',
  description: '检测指定时间段是否与现有日程冲突',
  category: 'schedule',
  parameters: [
    {
      name: 'date',
      type: 'string',
      description: '检查日期 (YYYY-MM-DD格式)',
      required: true
    },
    {
      name: 'startTime',
      type: 'string',
      description: '开始时间 (HH:MM格式)',
      required: true
    },
    {
      name: 'endTime',
      type: 'string',
      description: '结束时间 (HH:MM格式)',
      required: true
    }
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { date, startTime, endTime } = params as { date: string; startTime: string; endTime: string }
      
      // 从store获取日程数据
      const schedules = context.scheduleStore.schedules || []
      
      // 过滤同一天的日程
      const sameDaySchedules = schedules.filter((s: Schedule) => s.date === date)
      
      // 检查时间冲突（使用数值比较，与 scheduleStore.checkConflict 保持一致）
      const conflicts = sameDaySchedules.filter((s: Schedule) => {
        if (!s.startTime || !s.endTime) return false
        
        const newStart = timeToMinutes(startTime)
        const newEnd = timeToMinutes(endTime)
        const existStart = timeToMinutes(s.startTime)
        const existEnd = timeToMinutes(s.endTime)
        
        // 时间区间重叠检测
        return (
          (newStart >= existStart && newStart < existEnd) ||
          (newEnd > existStart && newEnd <= existEnd) ||
          (newStart <= existStart && newEnd >= existEnd)
        )
      })
      
      return {
        success: true,
        data: {
          hasConflicts: conflicts.length > 0,
          conflictCount: conflicts.length,
          conflicts: conflicts.map((s: Schedule) => ({
            id: s.id,
            content: s.content,
            startTime: s.startTime,
            endTime: s.endTime
          }))
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `冲突检测错误: ${(error as Error).message}`
      }
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 解析相对日期表达式
 */
function parseRelativeDate(expression: string, referenceDate: Date): Date | null {
  const expr = expression.trim().toLowerCase()
  const ref = new Date(referenceDate)
  
  // 重置时间为当天开始
  ref.setHours(0, 0, 0, 0)
  
  // 星期映射
  const weekdays: Record<string, number> = {
    '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 0,
    '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6, '星期日': 0
  }
  
  // 今天、明天、后天
  if (expr === '今天' || expr === '今日') {
    return ref
  }
  if (expr === '明天' || expr === '明日') {
    const tomorrow = new Date(ref)
    tomorrow.setDate(ref.getDate() + 1)
    return tomorrow
  }
  if (expr === '后天') {
    const dayAfterTomorrow = new Date(ref)
    dayAfterTomorrow.setDate(ref.getDate() + 2)
    return dayAfterTomorrow
  }
  
  // 上周/下周 + 星期几
  const weekPattern = /(上|下)周(.+)/
  const weekMatch = expr.match(weekPattern)
  if (weekMatch) {
    const [, direction, dayStr] = weekMatch
    const targetDay = dayStr ? weekdays[dayStr] : undefined
    if (targetDay !== undefined) {
      const result = new Date(ref)
      const currentDay = ref.getDay()
      const daysDiff = targetDay - currentDay
      
      if (direction === '上') {
        result.setDate(ref.getDate() + daysDiff - 7)
      } else {
        result.setDate(ref.getDate() + daysDiff + 7)
      }
      return result
    }
  }
  
  // 本周 + 星期几
  if (expr.startsWith('本周')) {
    const dayStr = expr.substring(2)
    const targetDay = weekdays[dayStr]
    if (targetDay !== undefined) {
      const result = new Date(ref)
      const currentDay = ref.getDay()
      const daysDiff = targetDay - currentDay
      result.setDate(ref.getDate() + daysDiff)
      return result
    }
  }
  
  return null
}

/**
 * 获取星期几的中文表示
 */
function getDayOfWeek(date: Date): string {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekdays[date.getDay()] || '未知'
}