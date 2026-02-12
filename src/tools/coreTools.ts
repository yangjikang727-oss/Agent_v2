/**
 * 核心工具集
 * 
 * 提供 ReAct 引擎可调用的基础工具：
 * - load_skill: 按名称懒加载技能指令（OpenCode 式 Skill 即 Tool）
 * - trigger_action: 通用 UI 动作触发器
 * - date_calculator: 相对日期表达式解析（今天/明天/下周X）
 * - schedule_query: 按日期/关键词查询日程
 * - conflict_detector: 时间段冲突检测
 */

import type { Tool, ToolContext, ToolResult } from '../services/react/toolRegistry'
import type { Schedule } from '../types'
import { timeToMinutes } from '../utils/dateUtils'
import { skillStore } from '../services/react/skills/skillStore'

// ==================== OpenCode 式 Skill 工具 ====================

/**
 * load_skill 工具 - 按名称懒加载技能的完整指令
 * 
 * OpenCode 核心机制：Agent 在系统提示中看到可用技能列表（name + description），
 * 当识别到用户意图可能匹配某个技能时，调用此工具获取完整操作指南，
 * 然后按指令中的步骤执行后续动作。
 * 
 * 集成 ContextManager：加载技能时自动创建任务上下文，追踪参数收集状态
 */
export const loadSkillTool: Tool = {
  name: 'load_skill',
  description: '加载技能的完整操作指令。当识别到用户意图匹配某个技能时，必须先调用此工具获取详细操作步骤和参数说明，然后按指令执行',
  category: 'utility',
  parameters: [
    {
      name: 'name',
      type: 'string',
      description: '技能名称（从可用技能列表中选择）',
      required: true
    }
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { name } = params as { name: string }
      
      if (!name) {
        return { success: false, error: '缺少技能名称参数' }
      }

      // 确保 skillStore 已初始化
      skillStore.loadAllSkills()

      const skill = skillStore.getSkill(name)
      if (!skill) {
        const stats = skillStore.getStats()
        return {
          success: false,
          error: `技能 "${name}" 不存在。可用技能: ${stats.names.join(', ')}`
        }
      }

      // ===== 集成 ContextManager：创建任务上下文 =====
      if (context.contextManager && context.sessionId) {
        // 从技能指令中提取必需参数列表
        const requiredParams = extractRequiredParams(skill.instruction.instructions)
        
        // 在 contextManager 中启动任务
        context.contextManager.startTask(
          context.sessionId,
          name,
          {}, // 初始参数为空
          requiredParams
        )
        
        // 触发状态转换到 collecting 阶段
        context.contextManager.transition(context.sessionId, 'intent_recognized')
        
        console.log(`[load_skill] 已创建任务上下文: ${name}, 待收集参数: ${requiredParams.join(', ')}`)
      }

      // 返回纯文本格式的技能指令，让 LLM 直接阅读（而非 JSON 嵌套）
      const instructionText = [
        `技能: ${name}`,
        `动作: ${skill.metadata.action}`,
        `说明: ${skill.metadata.description}`,
        '',
        skill.instruction.instructions
      ].join('\n')

      return {
        success: true,
        data: instructionText
      }
    } catch (error) {
      return {
        success: false,
        error: `加载技能失败: ${(error as Error).message}`
      }
    }
  }
}

/**
 * 从技能指令中提取必需参数列表
 */
function extractRequiredParams(instructions: string): string[] {
  const params: string[] = []
  
  // 匹配 "必填" 或 "required" 标记的参数
  const requiredPattern = /[*\-]\s*(\w+)[:\uff1a].*(?:\u5fc5\u586b|required|\*)/gi
  let match
  while ((match = requiredPattern.exec(instructions)) !== null) {
    if (match[1]) {
      params.push(match[1])
    }
  }
  
  // 如果没有显式标记，尝试从参数列表中提取
  if (params.length === 0) {
    // 常见的日程类参数
    const commonParams = ['title', 'date', 'startTime', 'endTime', 'from', 'to', 'startDate', 'endDate']
    const lowerInstructions = instructions.toLowerCase()
    for (const p of commonParams) {
      if (lowerInstructions.includes(p.toLowerCase())) {
        params.push(p)
      }
    }
  }
  
  return params
}

/**
 * trigger_action 工具 - 通用 UI 动作触发器
 * 
 * Agent 阅读技能指令后，调用此工具触发对应的 UI 动作（如打开会议表单、出差申请表单）。
 * 参数由 Agent 根据技能指令中的参数说明 + 用户输入自主提取。
 * 
 * 集成 ContextManager：触发动作时更新任务参数，记录已收集的参数
 */
export const triggerActionTool: Tool = {
  name: 'trigger_action',
  description: '触发UI动作。阅读 load_skill 返回的技能指令后，调用此工具执行动作（如打开会议创建表单、出差申请表单等），并传入从用户输入中提取的参数',
  category: 'utility',
  parameters: [
    {
      name: 'action',
      type: 'string',
      description: '动作名称（从技能指令中获取，如 open_create_meeting_modal、open_trip_application_modal）',
      required: true
    },
    {
      name: 'params',
      type: 'object',
      description: '动作参数（根据技能指令中的参数说明，从用户输入中提取）',
      required: false
    }
  ],
  execute: async (params: Record<string, any>, context: ToolContext): Promise<ToolResult> => {
    try {
      const { action, params: actionParams } = params as { action: string; params?: Record<string, any> }
      
      if (!action) {
        return { success: false, error: '缺少动作名称参数' }
      }

      // ===== 集成 ContextManager：更新任务参数 =====
      if (context.contextManager && context.sessionId) {
        const activeTask = context.contextManager.getActiveTask(context.sessionId)
        
        if (activeTask && actionParams) {
          // 更新已收集的参数
          context.contextManager.updateTaskParams(context.sessionId, actionParams)
          
          // 触发状态转换到 confirming 阶段
          context.contextManager.transition(context.sessionId, 'params_complete')
          
          console.log(`[trigger_action] 已更新任务参数:`, actionParams)
          console.log(`[trigger_action] 任务状态: ${activeTask.skillName} -> confirming`)
        }
        
        // 记录动作语义到消息历史
        const history = context.contextManager.getHistory(context.sessionId)
        if (history.length > 0) {
          const lastMsg = history[history.length - 1]
          if (lastMsg) {
            context.contextManager.updateMessageSemantics(context.sessionId, lastMsg.id, {
              intent: action,
              slots: actionParams
            })
          }
        }
      }

      return {
        success: true,
        data: {
          action,
          params: actionParams || {},
          taskId: `SKILL-${Date.now()}`,
          message: `已触发动作: ${action}`
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `触发动作失败: ${(error as Error).message}`
      }
    }
  }
}

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
      
      // 按日期过滤（支持跨天日程：查询日期落在 s.date ~ s.endDate 范围内即匹配）
      if (date) {
        filtered = filtered.filter((s: Schedule) => {
          if (s.date === date) return true
          // 跨天日程：有 endDate 且查询日期在 date ~ endDate 之间
          if (s.endDate && s.endDate >= date && s.date <= date) return true
          return false
        })
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
          queryDate: date || null,
          queryKeyword: keyword || null,
          totalCount: filtered.length,
          returnedCount: results.length,
          schedules: results.map((s: Schedule) => ({
            id: s.id,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            endDate: s.endDate,
            content: s.content,
            type: s.type,
            location: s.location,
            attendees: s.attendees,
            resources: s.resources,
            meta: s.meta
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

/**
 * 取消日程工具
 * 根据用户描述匹配并展示取消确认卡片
 * 支持批量取消（如"取消上午的所有会议"）
 */
export const cancelScheduleTool: Tool = {
  name: 'cancel_schedule',
  description: '取消/删除日程。根据日期、时间段、类型、关键词匹配日程并展示确认卡片。支持批量取消（如"取消上午的所有会议"）。【重要】当用户提到"上午"、"早上"时必须设置timeRange=morning；"下午"设置timeRange=afternoon；"晚上"设置timeRange=evening',
  category: 'schedule',
  parameters: [
    {
      name: 'date',
      type: 'string',
      description: '要取消的日程日期 (YYYY-MM-DD格式)',
      required: false
    },
    {
      name: 'timeRange',
      type: 'string',
      description: '【必须识别】时间段过滤。用户说"上午/早上"→morning，"下午"→afternoon，"晚上"→evening。morning=12:00前，afternoon=12:00-18:00，evening=18:00后',
      required: false,
      enum: ['morning', 'afternoon', 'evening', 'all']
    },
    {
      name: 'keyword',
      type: 'string',
      description: '日程关键词（主题、地点等）',
      required: false
    },
    {
      name: 'type',
      type: 'string',
      description: '日程类型：meeting(会议)、trip(出差)、general(普通)',
      required: false,
      enum: ['meeting', 'trip', 'general']
    },
    {
      name: 'batchMode',
      type: 'boolean',
      description: '是否批量模式。当用户说"所有"、"全部"等词时设为true',
      required: false,
      default: false
    }
  ],
  execute: async (params: Record<string, any>, _context: ToolContext): Promise<ToolResult> => {
    try {
      return {
        success: true,
        data: {
          action: 'show_cancel_confirm',
          date: params.date || null,
          timeRange: params.timeRange || null,
          keyword: params.keyword || null,
          type: params.type || null,
          batchMode: params.batchMode || false
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `取消日程错误: ${(error as Error).message}`
      }
    }
  }
}

/**
 * 修改日程工具
 * 根据用户描述匹配并展示修改确认卡片
 */
export const editScheduleTool: Tool = {
  name: 'edit_schedule',
  description: '修改/编辑一个已有日程。根据日期、类型、关键词匹配日程并展示确认卡片',
  category: 'schedule',
  parameters: [
    {
      name: 'date',
      type: 'string',
      description: '要修改的日程日期 (YYYY-MM-DD格式)',
      required: false
    },
    {
      name: 'keyword',
      type: 'string',
      description: '日程关键词（主题、地点等）',
      required: false
    },
    {
      name: 'type',
      type: 'string',
      description: '日程类型：meeting(会议)、trip(出差)、general(普通)',
      required: false,
      enum: ['meeting', 'trip', 'general']
    }
  ],
  execute: async (params: Record<string, any>, _context: ToolContext): Promise<ToolResult> => {
    try {
      return {
        success: true,
        data: {
          action: 'show_edit_confirm',
          date: params.date || null,
          keyword: params.keyword || null,
          type: params.type || null
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `修改日程错误: ${(error as Error).message}`
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