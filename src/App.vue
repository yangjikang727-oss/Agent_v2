<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { 
  Schedule, 
  Task, 
  ResourceCardData, 
  TransportSelectorData, 
  AttendeeTableData,
  TransportOption,
  Resource,
  ParamConfirmData,
  ScheduleListData,
  IntentData
} from './types'

// Stores
import { useScheduleStore, useTaskStore, useMessageStore, useConfigStore } from './stores'

// Services
import { executeSkill, generateTransportCard, applyConfirmedParams } from './services/skillRegistry'
import { parseIntent, generateAgenda, processWithReAct, initializeReAct } from './services/llmService'
import { contextManager } from './services/context'
import { startNotificationService, stopNotificationService } from './services/notificationService'

// Utils
import { extractDate, extractTime, extractAttendees, extractTransport, detectScenarioType } from './utils/nlpUtils'
import { getEndTime } from './utils/dateUtils'

// Composables
import { useBrain } from './composables/useBrain'
import { useSpeech } from './composables/useSpeech'

// Components
import ChatPanel from './components/chat/ChatPanel.vue'
import TimelinePanel from './components/timeline/TimelinePanel.vue'
import StatsBar from './components/dashboard/StatsBar.vue'
import TaskStack from './components/dashboard/TaskStack.vue'
import DetailModal from './components/modals/DetailModal.vue'
import ConfigModal from './components/modals/ConfigModal.vue'
import CreateMeetingModal from './components/modals/CreateMeetingModal.vue'

// Stores
const scheduleStore = useScheduleStore()
const taskStore = useTaskStore()
const messageStore = useMessageStore()
const configStore = useConfigStore()

// Composables
const brain = useBrain()
const speech = useSpeech()

// Refs
const timelineRef = ref<InstanceType<typeof TimelinePanel> | null>(null)
const showDetailModal = ref(false)
const selectedEvent = ref<Schedule | null>(null)
const showConfigModal = ref(false)
const showCreateMeetingModal = ref(false)
const createMeetingData = ref<Record<string, any>>({})
const showProcessing = ref(false)
const currentActionType = ref('')

// ReAct模式开关
const useReActMode = ref(true)  // 默认启用ReAct模式
const reactEngine = ref<any>(null)

// 冲突检测相关
const conflictSchedule = ref<Schedule | null>(null)  // 当前冲突的日程
const pendingScheduleUpdate = ref<Schedule | null>(null)  // 等待保存的日程（修改场景）
const pendingScheduleCreate = ref<any>(null)  // 等待创建的日程（插队场景）

// Computed
const placeholder = computed(() => {
  if (speech.isRecording.value) return '正在听...'
  if (brain.state.value.mode !== 'IDLE') return '请输入...'
  return '输入指令...'
})

// ==================== 核心业务逻辑 ====================

// 创建日程
async function createSchedule(ctx: {
  date: string
  startTime: string
  endTime: string
  endDate?: string    // 返程日期（跨天行程）
  content: string
  scenarioCode?: string
  location?: string
  attendees?: string[]
  transport?: string
  from?: string    // 出差出发地
  to?: string      // 出差目的地
}) {
  brain.startThinking('写入日程...')
  await new Promise(r => setTimeout(r, 300))

  const schedule: Schedule = {
    id: crypto.randomUUID(),
    content: ctx.content,
    date: ctx.date,
    startTime: ctx.startTime,
    endTime: ctx.endTime,
    endDate: ctx.endDate,  // 跨天行程的返程日期
    type: ctx.scenarioCode ? ctx.scenarioCode.toLowerCase() as Schedule['type'] : 'general',
    location: ctx.location || '',
    resources: [],
    attendees: ctx.attendees || [],
    agenda: '',
    meta: { 
      transport: ctx.transport as Schedule['meta']['transport'],
      from: ctx.from,
      to: ctx.to
    }
  }

  const success = scheduleStore.addSchedule(schedule)
  if (!success) {
    messageStore.addSystemMessage('❌ 无法创建：该时段已有日程。')
    brain.stopThinking()
    return
  }
  
  timelineRef.value?.scrollToTime(ctx.startTime)

  // 获取场景配置
  const scenario = configStore.getScenario(ctx.scenarioCode || 'GENERAL')
  const thoughts = [
    `场景: ${scenario?.name || '普通'}`,
    `创建: ${ctx.content}`,
    `技能: ${scenario?.skills.join(', ') || '无'}`
  ]

  // 生成技能任务
  if (scenario && scenario.skills.length > 0) {
    const newTasks: Task[] = scenario.skills.map(skillCode => {
      const skillMeta = configStore.getSkill(skillCode)
      return {
        id: crypto.randomUUID(),
        scheduleId: schedule.id,
        title: skillMeta?.name || skillCode,
        desc: skillMeta?.description || '',
        icon: skillMeta?.icon || 'fa-cube',
        skill: skillCode,
        actionBtn: '执行',
        date: ctx.date,
        status: 'pending'
      }
    })
    taskStore.addTasks(newTasks)
    messageStore.addDataMessage('action_list', '✅ 已创建', newTasks, thoughts)
  } else {
    messageStore.addSystemMessage('✅ 已创建', thoughts)
  }

  brain.stopThinking()
}

// 执行工作流 (带冲突检测)
async function executeWorkflow(ctx: {
  date: string
  startTime: string
  endTime: string
  endDate?: string    // 跨天行程的返程日期
  content: string
  scenarioCode?: string
  location?: string
  attendees?: string[]
  transport?: string
  from?: string    // 出差出发地
  to?: string      // 出差目的地
}) {
  brain.startThinking('检查冲突...')
  await new Promise(r => setTimeout(r, 400))

  // 参数验证
  if (!ctx.date || !ctx.startTime || !ctx.endTime) {
    brain.stopThinking()
    messageStore.addSystemMessage('❌ 缺少必要信息，请提供完整的日期和时间。')
    return
  }

  if (ctx.date && ctx.date !== scheduleStore.currentDate) {
    scheduleStore.setDate(ctx.date)
  }

  // 检测冲突
  const conflict = scheduleStore.checkConflict(ctx.date, ctx.startTime, ctx.endTime)
  if (conflict) {
    // 询问用户是否插队
    brain.waitForInput('CONFIRM_CONFLICT', {
      ...ctx,
      transport: ctx.transport as import('./types').TransportMode | undefined
    })
    // 保存冲突日程信息，用于后续编辑
    conflictSchedule.value = conflict
    messageStore.addSystemMessage(
      `<div class="bg-orange-50 border-l-4 border-orange-400 p-3 rounded">
        <div class="font-bold text-orange-600 text-xs mb-1"><i class="fa-solid fa-triangle-exclamation"></i> 时间冲突</div>
        <div class="text-sm text-gray-700">该时段 <b>${ctx.startTime}-${ctx.endTime}</b> 与现有日程 <b>「${conflict.content}」</b> (${conflict.startTime}-${conflict.endTime}) 冲突。</div>
        <div class="mt-2 text-xs text-gray-500">是否插队？确认后需先调整原日程时间。(回复"确认"或"取消")</div>
      </div>`
    )
    return
  }

  await createSchedule(ctx)
}

// 处理用户输入（ReAct模式）
async function processInputWithReAct(text: string) {
  const sessionId = 'session_default'
  const userId = 'user1'
  
  console.log('[App] 开始ReAct处理:', text)
  brain.startThinking('ReAct推理中...')
  brain.startReAct(3)
  
  try {
    // 1. 获取或创建会话上下文
    const session = contextManager.getOrCreateSession(sessionId, userId)
    
    // 2. 记录用户消息
    contextManager.addMessage(sessionId, 'user', text)
    
    // 3. 触发状态转换
    contextManager.transition(sessionId, 'user_input')
    
    // 4. 获取对话历史
    // const historyContext = contextManager.getFormattedHistory(sessionId)
    
    console.log('[App] 当前配置:', {
      provider: configStore.llmProvider,
      hasApiKey: !!configStore.llmApiKey,
      apiUrl: configStore.llmApiUrl,
      model: configStore.llmModel,
      historyLength: session.history.length
    })
    
    // 5. 确保ReAct引擎已初始化
    if (!reactEngine.value) {
      reactEngine.value = initializeReAct({
        provider: configStore.llmProvider,
        apiKey: configStore.llmApiKey,
        apiUrl: configStore.llmApiUrl,
        model: configStore.llmModel
      })
    }
    
    // 6. 调用ReAct引擎处理（传递对话历史）
    const result = await processWithReAct(
      text,
      {
        userId,
        currentDate: new Date().toISOString().split('T')[0] || '2024-01-01',
        scheduleStore: scheduleStore,
        taskStore: taskStore,
        conversationHistory: session.history
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          }))
      },
      {
        provider: configStore.llmProvider,
        apiKey: configStore.llmApiKey,
        apiUrl: configStore.llmApiUrl,
        model: configStore.llmModel
      }
    )
    
    // 7. 更新ReAct状态
    result.steps.forEach(step => {
      brain.updateReActStep(step)
    })
    
    if (result.success) {
      brain.finishReAct(result.finalAnswer)
      messageStore.addSystemMessage(result.finalAnswer)
      
      // 8. 记录助手回复
      contextManager.addMessage(sessionId, 'assistant', result.finalAnswer)
      
      // 9. 更新状态
      contextManager.transition(sessionId, 'intent_recognized')
      
      if (result.steps.length > 0) {
        console.log('[ReAct] 推理步骤:', result.steps)
        
        // 检查是否有创建会议的动作
        const createMeetingStep = result.steps.find(step => 
          step.action === 'open_create_meeting_modal'
        )
        
        if (createMeetingStep && createMeetingStep.actionInput) {
          // 设置模态框数据并显示
          createMeetingData.value = createMeetingStep.actionInput.formData || {}
          showCreateMeetingModal.value = true
        }
      }
    } else {
      brain.resetReAct()
      const errorMsg = `处理失败: ${result.error || '未知错误'}`
      messageStore.addSystemMessage(errorMsg)
      contextManager.addMessage(sessionId, 'assistant', errorMsg)
    }
  } catch (error) {
    brain.resetReAct()
    console.error('[ReAct] 处理错误:', error)
    const errorMsg = `ReAct模式处理出错: ${(error as Error).message}`
    messageStore.addSystemMessage(errorMsg)
    contextManager.addMessage(sessionId, 'assistant', errorMsg)
  } finally {
    brain.stopThinking()
  }
}

// 处理用户输入（传统模式）
async function processInput(text: string) {
  brain.startThinking()
  
  const time = extractTime(text)
  // const content = text.replace(/明天|后天|今天|[上下]午|晚上|\d{1,2}[:点]\d{0,2}/g, '').trim()

  // 处理等待时间模式
  if (brain.state.value.mode === 'WAIT_TIME' && time && brain.state.value.draft) {
    await executeWorkflow({
      ...brain.state.value.draft as any,
      startTime: time,
      endTime: getEndTime(time)
    })
    brain.reset()
    return
  }

  // 处理等待内容模式
  if (brain.state.value.mode === 'WAIT_CONTENT' && text.trim() && brain.state.value.draft) {
    await executeWorkflow({
      ...brain.state.value.draft as any,
      content: text,
      scenarioCode: 'GENERAL'
    })
    brain.reset()
    return
  }

  // 处理等待出差信息补充模式
  if (brain.state.value.mode === 'WAIT_TRIP_INFO' && text.trim() && brain.state.value.draft) {
    const draft = brain.state.value.draft
    // 尝试识别用户补充的是什么信息
    const trimmedText = text.trim()
    
    // 如果缺少出发地，假设用户补充的是出发地
    if (!draft.from) {
      draft.from = trimmedText
      // 检查是否还缺少其他必要信息
      if (!draft.to) {
        messageStore.addSystemMessage('请问出差去哪里？')
        brain.stopThinking()
        return
      }
      if (!draft.date) {
        messageStore.addSystemMessage('请问哪天出发？')
        brain.stopThinking()
        return
      }
      if (!draft.startTime) {
        messageStore.addSystemMessage('请问几点出发？')
        brain.stopThinking()
        return
      }
    } else if (!draft.to) {
      draft.to = trimmedText
      if (!draft.date) {
        messageStore.addSystemMessage('请问哪天出发？')
        brain.stopThinking()
        return
      }
      if (!draft.startTime) {
        messageStore.addSystemMessage('请问几点出发？')
        brain.stopThinking()
        return
      }
    } else if (!draft.date) {
      const extractedDate = extractDate(trimmedText)
      if (extractedDate) {
        draft.date = extractedDate
      } else {
        messageStore.addSystemMessage('抱歉，无法识别日期，请说“今天”、“明天”或具体日期。')
        brain.stopThinking()
        return
      }
      if (!draft.startTime) {
        messageStore.addSystemMessage('请问几点出发？')
        brain.stopThinking()
        return
      }
    } else if (!draft.startTime) {
      const extractedTime = extractTime(trimmedText)
      if (extractedTime) {
        draft.startTime = extractedTime
        draft.endTime = getEndTime(extractedTime)
      } else {
        messageStore.addSystemMessage('抱歉，无法识别时间，请说具体时间，如“上午10点”。')
        brain.stopThinking()
        return
      }
    }
    
    // 所有必要信息已收集，执行工作流
    if (draft.from && draft.to && draft.date && draft.startTime) {
            await executeWorkflow({
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime || getEndTime(draft.startTime),
        endDate: draft.endDate,  // 跨天行程的返程日期
        content: draft.content || `${draft.from}到${draft.to}出差`,
        scenarioCode: 'TRIP',
        location: draft.to,
        attendees: draft.attendees,
        transport: draft.transport,
        from: draft.from,
        to: draft.to
      })
      brain.reset()
      return
    }
    
    brain.stopThinking()
    return
  }

  // 处理等待参会人模式
  if (brain.state.value.mode === 'WAIT_ATTENDEES' && brain.state.value.pendingTask) {
    const task = brain.state.value.pendingTask
    const schedule = scheduleStore.getSchedule(task.scheduleId)
    if (schedule) {
      const attendees = text.split(/[、,，\s]+/).filter(n => n.length > 0)
      scheduleStore.updateAttendees(schedule.id, attendees)
      // 重新执行技能
      await handleExecuteTask(task)
    }
    brain.reset()
    return
  }

  // 处理等待酒店商圈模式
  if (brain.state.value.mode === 'WAIT_HOTEL_LOCATION' && brain.state.value.pendingTask && brain.state.value.draft) {
    const task = brain.state.value.pendingTask
    const schedule = scheduleStore.getSchedule(task.scheduleId)
    if (schedule) {
      const hotelLocation = text.trim()
      // 保存酒店地点到 meta
      scheduleStore.updateSchedule(schedule.id, {
        meta: { ...(schedule.meta || {}), hotelLocation }
      })
      // 重新执行技能
      await handleExecuteTask(task)
    }
    brain.reset()
    return
  }

  // 处理冲突确认模式
  if (brain.state.value.mode === 'CONFIRM_CONFLICT') {
    if (/是|确认|继续|好的|ok/i.test(text)) {
      // 用户确认插队，保存待创建的日程信息
      pendingScheduleCreate.value = brain.state.value.draft as any
      brain.reset()
      
      // 打开冲突日程编辑
      if (conflictSchedule.value) {
        selectedEvent.value = conflictSchedule.value
        showDetailModal.value = true
        messageStore.addSystemMessage(`请调整日程「${conflictSchedule.value.content}」的时间，保存后将自动创建新日程。`)
      }
    } else {
      messageStore.addSystemMessage('已取消创建。')
      conflictSchedule.value = null
      brain.reset()
    }
    return
  }

  // ==================== 意图解析策略 ====================
  // 策略: 优先使用大模型 → 正则匹配兜底

  let intentData = null
  // 使用系统当前日期作为 Agent 的上下文
  const systemDate = scheduleStore.systemCurrentDate

  // 策略1: 优先使用大模型 (仅当配置了 API Key)
  if (configStore.llmApiKey) {
    brain.startCallingLLM()
    intentData = await parseIntent(text, systemDate || '', configStore.llmConfig)
    brain.stopCallingLLM()
  }

  // 策略2: 正则匹配兜底 (无 API Key 或 LLM 调用失败)
  if (!intentData) {
    brain.state.value.statusText = '分析意图(Regex)...'
    intentData = parseIntentByRegex(text, systemDate || '')
  }

  // ==================== 处理解析结果 ====================

  // 处理 chat 意图
  if (intentData?.intent === 'chat') {
    messageStore.addSystemMessage(intentData.reply || '有什么可以帮您的吗？')
    brain.stopThinking()
    return
  }

  // 处理 query 意图
  if (intentData?.intent === 'query') {
    const targetDate = intentData.date || scheduleStore.currentDate
    scheduleStore.setDate(targetDate)
    brain.stopThinking()
    return
  }

  // 处理 update 意图
  if (intentData?.intent === 'update') {
    // 获取未来日程（从今天开始）
    const today: string = scheduleStore.systemCurrentDate || new Date().toISOString().split('T')[0] || ''
    const futureSchedules = scheduleStore.schedules
      .filter(s => s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    
    if (futureSchedules.length === 0) {
      messageStore.addSystemMessage('暂无未来日程可修改。')
    } else {
      messageStore.addDataMessage('schedule_list', '请选择要修改的日程：', { schedules: futureSchedules } as ScheduleListData)
    }
    brain.stopThinking()
    return
  }

  // 处理 create 意图
  if (intentData?.intent === 'create') {
    // 出差场景：缺少关键信息时进入多轮对话
    if (intentData.type === 'trip') {
      const missingFrom = !intentData.from
      const missingTo = !intentData.to
      const missingDate = !intentData.date
      const missingTime = !intentData.startTime
      
      if (missingFrom || missingTo || missingDate || missingTime) {
        if (intentData.reply) {
          messageStore.addSystemMessage(intentData.reply)
        }
        // 保存已抽取的信息，进入等待出差信息补充模式
        brain.waitForInput('WAIT_TRIP_INFO', {
          date: intentData.date,
          startTime: intentData.startTime,
          endTime: intentData.endTime,
          content: intentData.summary,
          scenarioCode: 'TRIP',
          from: intentData.from,
          to: intentData.to,
          attendees: intentData.attendees,
          transport: intentData.transport as import('./types').TransportMode | undefined
        })
        brain.stopThinking()
        return
      }
      
      // 信息完整，执行工作流
            await executeWorkflow({
        date: intentData.date!,
        startTime: intentData.startTime!,
        endTime: intentData.endTime || getEndTime(intentData.startTime!),
        endDate: intentData.endDate,  // 跨天行程的返程日期
        content: intentData.summary || `${intentData.from}到${intentData.to}出差`,
        scenarioCode: 'TRIP',
        location: intentData.to,
        attendees: intentData.attendees,
        transport: intentData.transport || undefined,
        from: intentData.from,
        to: intentData.to
      })
      
      if (brain.state.value.mode === 'IDLE') {
        brain.stopThinking()
      }
      return
    }
    
    // 会议场景：缺少时间时追问
    if (intentData.reply && (!intentData.startTime || !intentData.endTime)) {
      messageStore.addSystemMessage(intentData.reply)
      // 保存已抽取的信息，等待用户补充时间
      brain.waitForInput('WAIT_TIME', {
        date: intentData.date,
        content: intentData.summary,
        scenarioCode: intentData.type === 'meeting' ? 'MEETING' : 'GENERAL',
        location: intentData.location,
        attendees: intentData.attendees,
        transport: intentData.transport as import('./types').TransportMode | undefined
      })
      brain.stopThinking()
      return
    }

    let code = 'GENERAL'
    if (intentData.type === 'meeting' || /会议|讨论|meet/.test(intentData.summary || '')) {
      code = 'MEETING'
    }

    await executeWorkflow({
      date: intentData.date!,
      startTime: intentData.startTime!,
      endTime: intentData.endTime || getEndTime(intentData.startTime!),
      content: intentData.summary!,
      scenarioCode: code,
      location: intentData.location,
      attendees: intentData.attendees,
      transport: intentData.transport || undefined
    })

    if (brain.state.value.mode === 'IDLE') {
      brain.stopThinking()
    }
    return
  }

  // 无法解析意图
  brain.stopThinking()
}

// 正则匹配兜底函数
function parseIntentByRegex(text: string, currentDate: string): IntentData | null {
  const time = extractTime(text)
  const content = text.replace(/明天|后天|今天|[上下]午|晚上|\d{1,2}[:点]\d{0,2}/g, '').trim()
  const date = extractDate(text)
  const scenario = configStore.matchScenario(text)
  const scenarioCode = scenario?.code || 'GENERAL'
  const attendees = extractAttendees(text)
  const transport = extractTransport(text)

  // 查询意图
  if (!content && /查询|看看/.test(text)) {
    return { 
      intent: 'query', 
      date: date || currentDate 
    }
  }

  // 创建意图 - 需要时间和内容
  if (content && time) {
    const timeParts = time.split(':')
    const h = parseInt(timeParts[0] || '0')
    return {
      intent: 'create',
      summary: content,
      date: date || currentDate,
      startTime: time,
      endTime: `${String(h + 1).padStart(2, '0')}:${timeParts[1] || '00'}`,
      attendees: scenarioCode === 'TRIP' ? [] : attendees,
      type: detectScenarioType(text),
      transport
    }
  }

  // 缺少信息，返回部分数据让后续流程处理
  if (!content && !time) {
    return {
      intent: 'create',
      date: date || currentDate,
      startTime: '',
      endTime: '',
      summary: '',
      attendees: [],
      type: 'other',
      transport: null
    }
  }

  return null
}

// ==================== 事件处理 ====================

function handleSend(text: string) {
  messageStore.addUserMessage(text)
  
  // 根据模式选择处理方式
  if (useReActMode.value) {
    processInputWithReAct(text)
  } else {
    processInput(text)
  }
}

function handleToggleRecording() {
  speech.toggleRecording((text) => {
    if (text) handleSend(text)
  })
}

function handleReset() {
  messageStore.clearMessages()
  brain.reset()
}

async function handleExecuteTask(task: Task) {
  currentActionType.value = `Running: ${task.title}`
  showProcessing.value = true
  await new Promise(r => setTimeout(r, 800))

  const schedule = scheduleStore.getSchedule(task.scheduleId)
  if (!schedule) {
    showProcessing.value = false
    return
  }

  const result = await executeSkill(task.skill, schedule)
  showProcessing.value = false

  // 参数确认流程
  if (result.type === 'param_confirm' && result.data) {
    messageStore.addDataMessage('param_confirm', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId
    } as ParamConfirmData)
    return
  }

  if (result.type === 'ask_attendees') {
    brain.setMode('WAIT_ATTENDEES')
    brain.setPendingTask(task)
    brain.state.value.statusText = '等待输入参会人...'
    messageStore.addSystemMessage(`<span class="text-orange-500">${result.text}</span>`)
    return
  }

  if (result.type === 'attendee_table' && result.data) {
    messageStore.addDataMessage('attendee_table', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId
    } as AttendeeTableData)
  } else if (result.type === 'resource_card' && result.data) {
    messageStore.addDataMessage('resource_card', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId
    } as ResourceCardData)
  } else if (result.type === 'transport_selector' && result.data) {
    messageStore.addDataMessage('transport_selector', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId,
      selected: null,
      locked: false
    } as TransportSelectorData)
  } else if (result.type === 'flight_list' && result.data) {
    // 航班列表结果
    messageStore.addDataMessage('flight_list', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId
    } as import('./types').FlightListData)
  } else if (result.type === 'ask_hotel_location') {
    // 追问酒店商圈
    brain.setMode('WAIT_HOTEL_LOCATION')
    brain.setPendingTask(task)
    brain.state.value.draft = { scheduleId: task.scheduleId }
    brain.state.value.statusText = '等待输入酒店商圈...'
    messageStore.addSystemMessage(result.text || '🏨 请问您希望住在哪个商圈或地点？')
    return
  } else if (result.type === 'hotel_list' && result.data) {
    // 酒店列表结果
    messageStore.addDataMessage('hotel_list', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId
    } as import('./types').HotelListData)
  } else if (result.type === 'trip_application' && result.data) {
    // 出差申请表单
    messageStore.addDataMessage('trip_application', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId
    } as import('./types').TripApplicationData)
  } else if (result.type === 'action_notice') {
    messageStore.addSystemMessage(result.text || '')
    taskStore.completeTask(task.id)
  }
}

function handleSkipTask(task: Task) {
  taskStore.skipTask(task.id)
}

function handleConfirmResource(data: ResourceCardData, msgId: number) {
  if (data.taskId) {
    taskStore.completeTask(data.taskId)
  }
  if (data.scheduleId) {
    const resource: Resource = {
      id: crypto.randomUUID(),
      name: data.title,
      icon: data.icon,
      resourceType: data.resourceType
    }
    scheduleStore.addResource(data.scheduleId, resource)
    
    // 如果是会议室预订，自动询问是否通知参会人
    if (data.resourceType === 'room') {
      const schedule = scheduleStore.getSchedule(data.scheduleId)
      if (schedule && schedule.attendees && schedule.attendees.length > 0) {
        // 显示通知选项
        setTimeout(() => {
          messageStore.addDataMessage('notify_option', '', {
            scheduleId: data.scheduleId,
            scheduleContent: schedule.content,
            meetingTime: `${schedule.startTime} - ${schedule.endTime}`,
            attendees: schedule.attendees,
            selected: null,
            confirmed: false
          } as import('./types').NotifyOptionData)
        }, 300)
      }
    }
  }
  messageStore.updateMessage(msgId, { type: 'text', content: '✅ 已确认预订' })
}

/**
 * 处理通知选项选择
 */
async function handleSelectNotifyOption(option: 'now' | 'before_1h', scheduleId: string, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (!msg || !msg.data) return
  
  // 更新消息状态
  messageStore.updateMessage(msgId, {
    data: { ...(msg.data as import('./types').NotifyOptionData), selected: option, confirmed: true }
  })
  
  const schedule = scheduleStore.getSchedule(scheduleId)
  if (!schedule) return
  
  if (option === 'now') {
    // 立即执行通知参会人技能
    const names = schedule.attendees.map(n => n.split('(')[0]).join('、')
    let location = '线上会议'
    const room = schedule.resources?.find(r => r.resourceType === 'room')
    if (room) location = room.name
    
    messageStore.addSystemMessage(
      `📧 已向 ${schedule.attendees.length} 位参会人发送邀请：${names}<br><span class="text-xs text-gray-400">地点：${location}</span>`
    )
    
    // 完成通知参会人任务
    const notifyTask = taskStore.pendingTasks.find(
      t => t.scheduleId === scheduleId && t.skill === 'notify_attendees'
    )
    if (notifyTask) {
      taskStore.completeTask(notifyTask.id)
    }
  } else if (option === 'before_1h') {
    // 设置定时通知（开会前1小时）
    messageStore.addSystemMessage(
      `⏰ 已设置定时通知，将在会议开始前 1 小时自动发送邀请。`
    )
    
    // 完成通知参会人任务
    const notifyTask = taskStore.pendingTasks.find(
      t => t.scheduleId === scheduleId && t.skill === 'notify_attendees'
    )
    if (notifyTask) {
      taskStore.completeTask(notifyTask.id)
    }
  }
}

/**
 * 跳过通知
 */
function handleSkipNotify(_scheduleId: string, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data) {
    messageStore.updateMessage(msgId, {
      data: { ...(msg.data as import('./types').NotifyOptionData), confirmed: true }
    })
  }
  messageStore.addSystemMessage('✅ 已跳过参会人通知')
}

function handleDismissResource(msgId: number) {
  messageStore.updateMessage(msgId, { type: 'text', content: '已取消' })
}

function handleSelectTransport(option: TransportOption, msgId: number, data: TransportSelectorData) {
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'selected' in (msg.data as object)) {
    (msg.data as TransportSelectorData).selected = option.key
    ;(msg.data as TransportSelectorData).locked = true
  }

  setTimeout(() => {
    const schedule = scheduleStore.getSchedule(data.scheduleId)
    if (schedule) {
      const result = generateTransportCard(option.key, schedule)
      if (result.data) {
        messageStore.addDataMessage('resource_card', '', {
          ...result.data,
          taskId: data.taskId,
          scheduleId: data.scheduleId
        } as ResourceCardData)
      }
    }
  }, 500)
}

/**
 * 处理航班选择
 */
function handleSelectFlight(flightNo: string, _scheduleId: string, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'selected' in (msg.data as object)) {
    messageStore.updateMessage(msgId, {
      data: { ...(msg.data as import('./types').FlightListData), selected: flightNo }
    })
  }
}

/**
 * 确认航班预订
 */
function handleConfirmFlight(flightNo: string, scheduleId: string, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (!msg || !msg.data) return
  
  const flightData = msg.data as import('./types').FlightListData
  const selectedFlight = flightData.flights.find(f => f.flightNo === flightNo)
  if (!selectedFlight) return
  
  // 锁定选择
  messageStore.updateMessage(msgId, {
    data: { ...flightData, selected: flightNo, locked: true }
  })
  
  // 添加到日程资源
  const resource: Resource = {
    id: crypto.randomUUID(),
    name: `${selectedFlight.flightNo} | ${selectedFlight.departTime}-${selectedFlight.arriveTime}`,
    icon: 'fa-plane-up',
    resourceType: 'transport'
  }
  scheduleStore.addResource(scheduleId, resource)
  
  // 完成任务：优先用 taskId，否则通过 scheduleId + skill 查找
  if (flightData.taskId) {
    taskStore.completeTask(flightData.taskId)
  } else {
    const task = taskStore.pendingTasks.find(
      t => t.scheduleId === scheduleId && t.skill === 'arrange_transport'
    )
    if (task) {
      taskStore.completeTask(task.id)
    }
  }
  
  // 显示确认消息
  messageStore.addSystemMessage(
    `✅ 已预订航班 ${selectedFlight.flightNo}，${selectedFlight.from} → ${selectedFlight.to}，价格￥${selectedFlight.price}`
  )
  
  // 检查是否有预定酒店的待办任务，自动询问酒店商圈
  const hotelTask = taskStore.pendingTasks.find(
    t => t.scheduleId === scheduleId && t.skill === 'check_hotel'
  )
  if (hotelTask) {
    const schedule = scheduleStore.getSchedule(scheduleId)
    const destination = selectedFlight.to || schedule?.location || ''
    
    setTimeout(() => {
      messageStore.addSystemMessage(`🏨 请问您希望住在${destination}的哪个商圈或地点？`)
      
      // 设置等待酒店地点模式
      brain.setMode('WAIT_HOTEL_LOCATION')
      brain.state.value.draft = { scheduleId }
      brain.state.value.statusText = '等待输入酒店商圈...'
      brain.setPendingTask(hotelTask)
    }, 500)
  }
}

/**
 * 处理酒店选择
 */
function handleSelectHotel(hotelId: string, _scheduleId: string, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'selected' in (msg.data as object)) {
    messageStore.updateMessage(msgId, {
      data: { ...(msg.data as import('./types').HotelListData), selected: hotelId }
    })
  }
}

/**
 * 确认酒店预订
 */
function handleConfirmHotel(hotelId: string, scheduleId: string, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (!msg || !msg.data) return
  
  const hotelData = msg.data as import('./types').HotelListData
  const selectedHotel = hotelData.hotels.find(h => h.hotelId === hotelId)
  if (!selectedHotel) return
  
  // 锁定选择
  messageStore.updateMessage(msgId, {
    data: { ...hotelData, selected: hotelId, locked: true }
  })
  
  // 添加到日程资源
  const resource: Resource = {
    id: crypto.randomUUID(),
    name: `${selectedHotel.name} | ${selectedHotel.roomType}`,
    icon: 'fa-hotel',
    resourceType: 'hotel'
  }
  scheduleStore.addResource(scheduleId, resource)
  
  // 完成任务：优先用 taskId，否则通过 scheduleId + skill 查找
  if (hotelData.taskId) {
    taskStore.completeTask(hotelData.taskId)
  } else {
    const task = taskStore.pendingTasks.find(
      t => t.scheduleId === scheduleId && t.skill === 'check_hotel'
    )
    if (task) {
      taskStore.completeTask(task.id)
    }
  }
  
  // 显示确认消息
  messageStore.addSystemMessage(
    `✅ 已预订酒店：${selectedHotel.name}（${selectedHotel.roomType}），价格￥${selectedHotel.price}/晚`
  )
}

/**
 * 处理出差申请提交
 */
async function handleSubmitTripApplication(data: import('./types').TripApplicationData, msgId: number) {
  // 更新消息状态为已提交
  messageStore.updateMessage(msgId, {
    data: { ...data, status: 'submitted' }
  })
  
  // 模拟审批过程（默认通过）
  await new Promise(r => setTimeout(r, 1000))
  
  // 更新为已通过
  messageStore.updateMessage(msgId, {
    data: { ...data, status: 'approved' }
  })
  
  // 更新日程，同步出差申请的时间范围
  const schedule = scheduleStore.getSchedule(data.scheduleId)
  if (schedule) {
    const transportMap: Record<string, import('./types').TransportMode> = {
      'flight': 'flight',
      'train': 'train',
      'car': 'car'
    }
    // 同步更新日程的时间信息
    scheduleStore.updateSchedule(data.scheduleId, {
      date: data.startDate,           // 开始日期
      startTime: data.startTime,      // 开始时间
      endTime: data.endTime,          // 结束时间
      endDate: data.endDate,          // 返程日期（跨天行程）
      meta: {
        ...(schedule.meta || {}),
        tripApplied: true,
        from: data.from,
        to: data.to,
        transport: transportMap[data.transport] || undefined
      }
    })
  }
  
  // 完成任务
  if (data.taskId) {
    taskStore.completeTask(data.taskId)
  }
  
  messageStore.addSystemMessage(`✅ 出差申请已通过！正在为您推荐航班和酒店...`)
  
  // 后续流程：推荐航班
  await new Promise(r => setTimeout(r, 500))
  
  if (data.transport === 'flight' && data.from && data.to) {
    // 生成航班列表
    const { generateFlightList } = await import('./services/skillRegistry')
    const updatedSchedule = scheduleStore.getSchedule(data.scheduleId)
    if (updatedSchedule) {
      const flightResult = generateFlightList(updatedSchedule, data.from, data.to)
      if (flightResult.type === 'flight_list' && flightResult.data) {
        messageStore.addDataMessage('flight_list', '', {
          ...flightResult.data,
          scheduleId: data.scheduleId
        } as import('./types').FlightListData)
      }
    }
  } else if (data.transport === 'train') {
    // 火车票提示
    messageStore.addSystemMessage(`🚄 已为您查询 ${data.from} → ${data.to} 的高铁票，请自行在 12306 预订。`)
    
    // 火车票场景：不需要确认，直接询问酒店商圈
    await new Promise(r => setTimeout(r, 500))
    const hotelTask = taskStore.pendingTasks.find(
      t => t.scheduleId === data.scheduleId && t.skill === 'check_hotel'
    )
    if (hotelTask) {
      messageStore.addSystemMessage(`🏨 请问您希望住在${data.to}的哪个商圈或地点？`)
      brain.setMode('WAIT_HOTEL_LOCATION')
      brain.state.value.draft = { scheduleId: data.scheduleId }
      brain.state.value.statusText = '等待输入酒店商圈...'
      brain.setPendingTask(hotelTask)
    }
  }
  // 飞机场景：酒店询问在确认航班后触发（handleConfirmFlight 中处理）
}

function handleRemoveAttendee(msgId: number, uid: string) {
  messageStore.updateAttendeeRow(msgId, uid, { deleted: true })
}

function handleRestoreAttendee(msgId: number, uid: string) {
  messageStore.updateAttendeeRow(msgId, uid, { deleted: false })
}

function handleConfirmAttendees(msgId: number, data: AttendeeTableData) {
  const validRows = data.rows.filter(r => !r.deleted)
  
  if (data.scheduleId) {
    const attendees = validRows.map(r => 
      r.isAmbiguous ? `${r.name}(${r.dept})` : r.name
    )
    scheduleStore.updateAttendees(data.scheduleId, attendees)
  }

  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'confirmed' in (msg.data as object)) {
    (msg.data as AttendeeTableData).confirmed = true
  }

  if (data.taskId) {
    taskStore.completeTask(data.taskId)
  }

  messageStore.addSystemMessage(`✅ 名单已确认，共 ${validRows.length} 人。`)
}

/**
 * 确认技能参数并执行
 */
async function handleConfirmSkillParams(
  params: Record<string, string | number>, 
  msgId: number, 
  data: ParamConfirmData
) {
  // 更新消息状态为执行中
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data) {
    // 替换整个 data 对象以触发 Vue 响应式
    messageStore.updateMessage(msgId, {
      data: { ...msg.data, executing: true } as ParamConfirmData
    })
  }

  showProcessing.value = true
  currentActionType.value = `执行: ${data.skillName}`
  await new Promise(r => setTimeout(r, 800))

  const schedule = scheduleStore.getSchedule(data.scheduleId)
  if (!schedule) {
    showProcessing.value = false
    return
  }

  // 应用参数更新到 schedule，并同步到 store
  const updatedSchedule = applyConfirmedParams(schedule, data.skillCode, params)
  scheduleStore.updateSchedule(schedule.id, {
    startTime: updatedSchedule.startTime,
    endTime: updatedSchedule.endTime,
    location: updatedSchedule.location,  // 同步更新地点
    meta: updatedSchedule.meta
  })

  // 执行技能（传入确认的参数）
  const result = await executeSkill(data.skillCode, updatedSchedule, params)
  showProcessing.value = false

  // 标记消息为已确认
  const updatedMsg = messageStore.getMessage(msgId)
  if (updatedMsg && updatedMsg.data) {
    messageStore.updateMessage(msgId, {
      data: { ...updatedMsg.data, confirmed: true, executing: false } as ParamConfirmData
    })
  }

  // 处理执行结果
  if (result.type === 'attendee_table' && result.data) {
    messageStore.addDataMessage('attendee_table', '', {
      ...result.data,
      taskId: data.taskId,
      scheduleId: data.scheduleId
    } as AttendeeTableData)
  } else if (result.type === 'resource_card' && result.data) {
    messageStore.addDataMessage('resource_card', '', {
      ...result.data,
      taskId: data.taskId,
      scheduleId: data.scheduleId
    } as ResourceCardData)
  } else if (result.type === 'flight_list' && result.data) {
    // 航班列表结果
    messageStore.addDataMessage('flight_list', '', {
      ...result.data,
      taskId: data.taskId,
      scheduleId: data.scheduleId
    } as import('./types').FlightListData)
  } else if (result.type === 'action_notice') {
    messageStore.addSystemMessage(result.text || '')
    if (data.taskId) {
      taskStore.completeTask(data.taskId)
    }
  }
}

/**
 * 取消技能参数确认
 */
function handleCancelSkillParams(msgId: number) {
  messageStore.updateMessage(msgId, { type: 'text', content: '❌ 已取消执行' })
}

function handleClickEvent(schedule: Schedule) {
  selectedEvent.value = schedule
  showDetailModal.value = true
}

function handleSelectScheduleToEdit(schedule: Schedule) {
  // 切换到该日程的日期
  if (schedule.date !== scheduleStore.currentDate) {
    scheduleStore.setDate(schedule.date)
  }
  // 打开修改弹窗
  selectedEvent.value = schedule
  showDetailModal.value = true
  messageStore.addSystemMessage(`已打开「${schedule.content}」的编辑页面`)
}

function handleDeleteEvent(id: string) {
  if (confirm('删除此日程?')) {
    scheduleStore.deleteSchedule(id)
    taskStore.removeTasksByScheduleId(id)
  }
}

function handleSaveEvent(schedule: Schedule) {
  scheduleStore.updateSchedule(schedule.id, schedule)
}

/**
 * 关闭日程详情弹窗
 */
function handleCloseDetailModal() {
  showDetailModal.value = false
  conflictSchedule.value = null
  pendingScheduleUpdate.value = null
  
  // 如果有待创建的日程，取消创建
  if (pendingScheduleCreate.value) {
    pendingScheduleCreate.value = null
    messageStore.addSystemMessage('已取消新日程创建。')
  }
}

/**
 * 检测日程修改冲突
 */
function handleCheckConflict(schedule: Schedule) {
  // 检测冲突（排除当前日程本身）
  const conflict = scheduleStore.checkConflict(
    schedule.date, 
    schedule.startTime, 
    schedule.endTime, 
    schedule.id
  )
  
  if (conflict) {
    // 有冲突，显示冲突警告
    conflictSchedule.value = conflict
    pendingScheduleUpdate.value = schedule
  } else {
    // 无冲突，直接保存
    handleSaveEvent(schedule)
    showDetailModal.value = false
    conflictSchedule.value = null
    pendingScheduleUpdate.value = null
    messageStore.addSystemMessage('✅ 日程已保存')
    
    // 插队场景：编辑完成后自动创建新日程
    if (pendingScheduleCreate.value) {
      const createCtx = pendingScheduleCreate.value
      pendingScheduleCreate.value = null
      
      // 延迟创建新日程
      setTimeout(async () => {
        await createSchedule(createCtx)
      }, 300)
    }
  }
}

/**
 * 确认保存冲突日程，并打开冲突日程编辑
 */
function handleConfirmConflictSave(schedule: Schedule) {
  // 使用传入的 schedule 或回退到 pendingScheduleUpdate
  const scheduleToSave = schedule || pendingScheduleUpdate.value
  if (!scheduleToSave || !conflictSchedule.value) {
    console.warn('[handleConfirmConflictSave] 缺少必要数据', { schedule, pendingScheduleUpdate: pendingScheduleUpdate.value, conflictSchedule: conflictSchedule.value })
    return
  }
  
  // 保存当前修改
  handleSaveEvent(scheduleToSave)
  messageStore.addSystemMessage(`✅ 日程「${scheduleToSave.content}」已保存`)
  
  // 打开冲突日程进行编辑
  const conflictToEdit = conflictSchedule.value
  
  // 重置状态
  pendingScheduleUpdate.value = null
  conflictSchedule.value = null
  
  // 延迟打开冲突日程编辑
  setTimeout(() => {
    selectedEvent.value = conflictToEdit
    showDetailModal.value = true
    messageStore.addSystemMessage(`请调整冲突日程「${conflictToEdit.content}」的时间`)
  }, 100)
}

async function handleGenerateAgenda(schedule: Schedule) {
  brain.startGeneratingAgenda(schedule.id)
  const agenda = await generateAgenda(schedule.content, configStore.llmConfig)
  scheduleStore.updateAgenda(schedule.id, agenda)
  if (selectedEvent.value?.id === schedule.id) {
    selectedEvent.value.agenda = agenda
  }
  brain.stopGeneratingAgenda()
}

function handleAddSkill() {
  configStore.addSkill({
    code: 'new_skill_' + Math.floor(Math.random() * 1000),
    name: '新技能',
    icon: 'fa-wand-magic-sparkles',
    description: '自定义通用技能'
  })
}

function handleDeleteSkill(index: number) {
  configStore.deleteSkill(index)
}

// 处理创建会议提交
function handleCreateMeetingSubmit(data: any) {
  console.log('[App] 创建会议提交:', data)
  
  // 创建会议日程
  const newSchedule: Schedule = {
    id: `sch_${Date.now()}`,
    content: data.title,
    date: data.startTime.split('T')[0],
    startTime: data.startTime.split('T')[1],
    endTime: data.endTime.split('T')[1],
    type: 'meeting',
    location: data.location,
    resources: [],
    attendees: data.attendees,
    agenda: data.remarks || '',
    meta: {
      location: data.location,
      attendeeCount: data.attendees.length
    }
  }
  
  // 添加到日程存储
  scheduleStore.addSchedule(newSchedule)
  
  // 显示成功消息
  messageStore.addSystemMessage(`✅ 会议创建成功：${data.title}`)
  
  // 关闭模态框
  showCreateMeetingModal.value = false
  
  // 重置数据
  createMeetingData.value = {}
}

function handleToggleScenarioSkill(scenarioCode: string, skillCode: string) {
  configStore.toggleScenarioSkill(scenarioCode, skillCode)
}

// ==================== 生命周期 ====================

onMounted(async () => {
  // 启动通知服务
  startNotificationService(() => scheduleStore.schedules, 30000)
  console.log('[App] 日程通知服务已启动')
  
  // 初始化上下文管理器
  console.log('[App] ContextManager 已就绪')
})

onUnmounted(() => {
  // 停止通知服务
  stopNotificationService()
})
</script>

<template>
  <div class="app-layout">
    <!-- 左侧：实时概览 -->
    <div class="flex flex-col h-full overflow-hidden bg-[#f8fafc] relative">
      <!-- Stats Bar -->
      <StatsBar
        v-model:current-date="scheduleStore.currentDate"
        :total-schedules="scheduleStore.dailyStats.total"
        :pending-tasks="taskStore.pendingCount"
        @change-date="scheduleStore.changeDate"
        @reset-to-today="scheduleStore.resetToToday"
      />

      <!-- Timeline 和 TaskStack 并排 -->
      <div class="flex-1 p-6 pt-2 overflow-hidden grid grid-cols-[2.5fr_1fr] gap-4">
        <TimelinePanel
          ref="timelineRef"
          :schedules="scheduleStore.currentDaySchedules"
          @click-event="handleClickEvent"
          @delete-event="handleDeleteEvent"
        />
        
        <TaskStack
          :tasks="taskStore.pendingTasks"
          @execute="handleExecuteTask"
          @skip="handleSkipTask"
        />
      </div>
    </div>

    <!-- 右侧：AI Agent 交互区 -->
    <div class="flex flex-col h-full overflow-hidden">
      <!-- 模式切换控件 -->
      <div class="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <span class="text-sm font-medium text-gray-700">AI模式:</span>
          <button 
            @click="useReActMode = true"
            :class="[
              'px-3 py-1 rounded-md text-sm transition-colors',
              useReActMode 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            ]"
          >
            ReAct模式
          </button>
          <button 
            @click="useReActMode = false"
            :class="[
              'px-3 py-1 rounded-md text-sm transition-colors',
              !useReActMode 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            ]"
          >
            传统模式
          </button>
        </div>
        <div class="text-xs text-gray-500">
          {{ useReActMode ? '启用推理链和工具调用' : '使用传统意图识别' }}
        </div>
      </div>
      
      <ChatPanel
      class="flex-1 min-h-0"
      :messages="messageStore.messages"
      :is-thinking="brain.state.value.isThinking"
      :is-calling-l-l-m="brain.isCallingLLM.value"
      :thinking-text="brain.state.value.currentProcess"
      :status-text="brain.state.value.statusText"
      :quick-suggestions="brain.quickSuggestions.value"
      :is-recording="speech.isRecording.value"
      :placeholder="placeholder"
      :transcript="speech.transcript.value"
      :speech-error="speech.errorMessage.value"
      :speech-supported="speech.isSupported.value"
      @send="handleSend"
      @toggle-recording="handleToggleRecording"
      @reset="handleReset"
      @open-config="showConfigModal = true"
      @execute-task="handleExecuteTask"
      @skip-task="handleSkipTask"
      @confirm-resource="handleConfirmResource"
      @dismiss-resource="handleDismissResource"
      @select-transport="handleSelectTransport"
      @select-flight="handleSelectFlight"
      @confirm-flight="handleConfirmFlight"
      @select-hotel="handleSelectHotel"
      @confirm-hotel="handleConfirmHotel"
      @submit-trip-application="handleSubmitTripApplication"
      @select-notify-option="handleSelectNotifyOption"
      @skip-notify="handleSkipNotify"
      @remove-attendee="handleRemoveAttendee"
      @restore-attendee="handleRestoreAttendee"
      @confirm-attendees="handleConfirmAttendees"
      @confirm-skill-params="handleConfirmSkillParams"
      @cancel-skill-params="handleCancelSkillParams"
      @select-schedule-to-edit="handleSelectScheduleToEdit"
    />
    </div>

    <!-- Modals -->
    <DetailModal
      :show="showDetailModal"
      :schedule="selectedEvent"
      :is-generating-agenda="brain.state.value.isGeneratingAgenda && brain.state.value.generatingId === selectedEvent?.id"
      :conflict-schedule="conflictSchedule"
      @close="handleCloseDetailModal"
      @save="handleConfirmConflictSave"
      @check-conflict="handleCheckConflict"
      @generate-agenda="handleGenerateAgenda"
    />

    <ConfigModal
      :show="showConfigModal"
      :skill-list="configStore.skillList"
      :scenario-list="configStore.scenarioList"
      :llm-provider="configStore.llmProvider"
      :llm-api-key="configStore.llmApiKey"
      :llm-api-url="configStore.llmApiUrl"
      :llm-model="configStore.llmModel"
      @close="showConfigModal = false"
      @add-skill="handleAddSkill"
      @delete-skill="handleDeleteSkill"
      @toggle-scenario-skill="handleToggleScenarioSkill"
      @update-l-l-m-config="configStore.setLLMConfig"
    />

    <!-- Create Meeting Modal -->
    <CreateMeetingModal
      :visible="showCreateMeetingModal"
      :initial-data="createMeetingData"
      @close="showCreateMeetingModal = false"
      @submit="handleCreateMeetingSubmit"
    />

    <!-- Processing Overlay -->
    <div 
      v-if="showProcessing" 
      class="fixed inset-0 z-[100] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center"
    >
      <div class="w-16 h-16 border-4 border-purple-200 rounded-full relative">
        <div class="w-16 h-16 border-4 border-purple-600 rounded-full border-t-transparent animate-spin absolute top-[-4px] left-[-4px]"></div>
      </div>
      <h3 class="text-xl font-bold text-gray-800 mt-6 mb-2">AI 技能执行中...</h3>
      <p class="text-gray-500 text-sm">{{ currentActionType }}</p>
    </div>
  </div>
</template>
