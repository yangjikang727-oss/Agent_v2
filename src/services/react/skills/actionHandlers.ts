/**
 * Skill Action 处理器
 * 
 * 将 App.vue 中的硬编码业务逻辑抽离到此，实现 Skill 驱动
 * 每个 action 对应一个处理函数
 */

import type { Schedule, Task, TransportMode } from '../../../types'
import { TripFormManager } from '../tripFormManager'

// ==================== Action 处理器接口 ====================

export interface ActionContext {
  scheduleStore: any
  taskStore: any
  messageStore: any
  configStore: any
  brain?: any
}

export interface ActionResult {
  success: boolean
  message?: string
  data?: any
  error?: string
  nextAction?: string  // 链式调用下一个 action
  nextActionInput?: any
}

// ==================== 出差申请相关 Actions ====================

/**
 * 审批出差申请
 * action: approve_business_trip
 */
export async function approveTripAction(
  input: {
    scheduleId: string
    from: string
    to: string
    transport: string
  },
  context: ActionContext
): Promise<ActionResult> {
  console.log('[Action] approve_business_trip:', input)
  
  try {
    const { scheduleStore, messageStore } = context
    
    // 1. 模拟审批延迟
    messageStore.addSystemMessage(`📋 出差申请已提交：${input.from} → ${input.to}，审批中...`)
    await new Promise(r => setTimeout(r, 1000))
    
    // 2. 更新日程 meta（审批通过）
    const transportMap: Record<string, TransportMode> = {
      'flight': 'flight',
      'train': 'train',
      'car': 'car',
      'ship': 'ship',
      'other': 'other'
    }
    
    const schedule = scheduleStore.getSchedule(input.scheduleId)
    if (!schedule) {
      return { success: false, error: '日程不存在' }
    }
    
    scheduleStore.updateSchedule(input.scheduleId, {
      meta: {
        ...(schedule.meta || {}),
        tripApplied: true,
        from: input.from,
        to: input.to,
        transport: transportMap[input.transport] || undefined
      }
    })
    
    messageStore.addSystemMessage(`✅ 出差申请已通过!`)
    
    console.log('[Action] approve_business_trip: 成功')
    
    return {
      success: true,
      message: '审批通过',
      nextAction: 'generate_trip_task_list',
      nextActionInput: { 
        scheduleId: input.scheduleId,
        startDate: schedule.date
      }
    }
  } catch (error) {
    console.error('[Action] approve_business_trip 失败:', error)
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

/**
 * 生成出差任务列表
 * action: generate_trip_task_list
 */
export async function generateTripTasksAction(
  input: {
    scheduleId: string
    startDate?: string
  },
  context: ActionContext
): Promise<ActionResult> {
  console.log('[Action] generate_trip_task_list:', input)
  
  try {
    const { taskStore, configStore, scheduleStore } = context
    
    // 获取日程信息
    const schedule = scheduleStore.getSchedule(input.scheduleId)
    if (!schedule) {
      return { success: false, error: '日程不存在' }
    }
    
    // 获取 TRIP 场景配置
    const scenario = configStore.getScenario('TRIP')
    if (!scenario || !scenario.skills || scenario.skills.length === 0) {
      return { success: false, error: 'TRIP 场景未配置技能' }
    }
    
    // 生成任务列表
    const newTasks: Task[] = scenario.skills.map((skillCode: string) => {
      const skillMeta = configStore.getSkill(skillCode)
      return {
        id: crypto.randomUUID(),
        scheduleId: input.scheduleId,
        title: skillMeta?.name || skillCode,
        desc: skillMeta?.description || '',
        icon: skillMeta?.icon || 'fa-cube',
        skill: skillCode,
        actionBtn: '执行',
        date: input.startDate || schedule.date,
        status: 'pending' as const
      }
    })
    
    taskStore.addTasks(newTasks)
    console.log(`[Action] 已生成 ${newTasks.length} 个任务`)
    
    // apply_trip 任务直接标记为已完成
    const applyTripTask = newTasks.find(t => t.skill === 'apply_trip')
    if (applyTripTask) {
      taskStore.completeTask(applyTripTask.id)
      console.log('[Action] apply_trip 任务已完成')
    }
    
    // 获取可自动执行的任务
    const AUTO_EXECUTABLE_SKILLS = ['arrange_transport']
    const autoTasks = newTasks.filter(task => AUTO_EXECUTABLE_SKILLS.includes(task.skill))
    
    if (autoTasks.length > 0) {
      console.log(`[Action] 发现 ${autoTasks.length} 个可自动执行任务`)
      return {
        success: true,
        message: '任务列表已生成',
        nextAction: 'ask_auto_execute',
        nextActionInput: {
          scheduleId: input.scheduleId,
          autoExecTaskIds: autoTasks.map(t => t.id)
        }
      }
    }
    
    return {
      success: true,
      message: '任务列表已生成'
    }
  } catch (error) {
    console.error('[Action] generate_trip_task_list 失败:', error)
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

/**
 * 询问是否自动执行推荐任务
 * action: ask_auto_execute
 */
export async function askAutoExecuteAction(
  input: {
    scheduleId: string
    autoExecTaskIds: string[]
  },
  context: ActionContext
): Promise<ActionResult> {
  console.log('[Action] ask_auto_execute:', input)
  
  try {
    const { brain, messageStore } = context
    
    if (!brain) {
      return { success: false, error: 'brain 未初始化' }
    }
    
    brain.setMode('WAIT_AUTO_EXEC_CONFIRM')
    brain.setDraft({
      scheduleId: input.scheduleId,
      autoExecTaskIds: input.autoExecTaskIds
    })
    
    messageStore.addSystemMessage(
      '已生成交通安排任务,需要我现在自动帮你跑一遍推荐吗?(回复“是”或“否”)'
    )
    
    console.log('[Action] ask_auto_execute: 已询问用户')
    
    return {
      success: true,
      message: '已询问用户'
    }
  } catch (error) {
    console.error('[Action] ask_auto_execute 失败:', error)
    return {
      success: false,
      error: (error as Error).message
    }
  }
}

// ==================== Action 注册表 ====================

export const ACTION_HANDLERS: Record<string, Function> = {
  'approve_business_trip': approveTripAction,
  'generate_trip_task_list': generateTripTasksAction,
  'ask_auto_execute': askAutoExecuteAction
}

/**
 * 执行 action 处理器
 */
export async function executeAction(
  actionName: string,
  input: any,
  context: ActionContext
): Promise<ActionResult> {
  console.log(`[ActionHandlers] 执行 action: ${actionName}`)
  
  const handler = ACTION_HANDLERS[actionName]
  
  if (!handler) {
    console.error(`[ActionHandlers] 未知 action: ${actionName}`)
    return {
      success: false,
      error: `未知 action: ${actionName}`
    }
  }
  
  try {
    const result = await handler(input, context)
    console.log(`[ActionHandlers] action ${actionName} 执行结果:`, result)
    return result
  } catch (error) {
    console.error(`[ActionHandlers] action ${actionName} 执行异常:`, error)
    return {
      success: false,
      error: (error as Error).message
    }
  }
}
