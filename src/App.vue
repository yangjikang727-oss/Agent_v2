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
  ConflictResolutionData,
  ScheduleQueryResultData,
  IntentData,
  TransportMode,
  BrainMode
} from './types'

// Stores
import { useScheduleStore, useTaskStore, useMessageStore, useConfigStore } from './stores'

// Services
import { executeSkill, generateTransportCard, applyConfirmedParams } from './services/traditional/skillRegistry'
import { parseIntent, generateAgenda, processWithReAct, initializeReAct } from './services/llmService'
import { contextManager } from './services/context'
import { startNotificationService, stopNotificationService } from './services/notificationService'

// Utils
import { extractDate, extractTime, extractAttendees, extractTransport, detectScenarioType } from './utils/nlpUtils'
import { getEndTime, timeToMinutes } from './utils/dateUtils'
import { logger } from './utils/logger'

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
import LogViewerModal from './components/modals/LogViewerModal.vue'
import { TripFormManager } from './services/react/tripFormManager'

// ==================== 工具函数 ====================

/**
 * 归一化参会人员列表
 * 兼容 LLM 传入的多种格式：字符串 / 单元素数组 / 正常数组
 */
function normalizeAttendeeList(raw: any): string[] {
  if (!raw) return []
  if (typeof raw === 'string') {
    return raw.split(/[,，、;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((item: any) =>
      typeof item === 'string'
        ? item.split(/[,，、;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : [String(item)]
    )
  }
  return []
}

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
const showLogViewer = ref(false)
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
      transport: ctx.transport as import('./types').TransportMode | undefined,
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
  
  // 切换日期视图到日程日期
  if (schedule.date !== scheduleStore.currentDate) {
    scheduleStore.setDate(schedule.date)
  }
  timelineRef.value?.scrollToTime(ctx.startTime)

  // 成功消息
  const typeLabel = schedule.type === 'meeting' ? '会议' : '日程'
  messageStore.addSystemMessage(`✅ ${typeLabel}创建成功：${ctx.content}`)
  brain.stopThinking()

  // 会议日程：如果有参会人，弹出通知确认卡片
  if (schedule.type === 'meeting' && ctx.attendees && ctx.attendees.length > 0) {
    setTimeout(() => {
      messageStore.addDataMessage('notify_option', '', {
        scheduleId: schedule.id,
        scheduleContent: ctx.content,
        meetingTime: `${ctx.startTime} - ${ctx.endTime}`,
        attendees: ctx.attendees,
        selected: null,
        confirmed: false
      } as import('./types').NotifyOptionData)
    }, 300)
  }
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

// ==================== 智能冲突解决 ====================

/**
 * 统一冲突解决函数（三层递进策略）
 * 1. 智能就近安排：双向查找最近可用时段
 * 2. 当天空闲时段推荐：快捷按钮选择
 * 3. 下一个工作日推荐：跳过周末
 */
async function resolveConflictAndCreate(ctx: {
  date: string
  startTime: string
  endTime: string
  endDate?: string
  content: string
  scenarioCode?: string
  location?: string
  attendees?: string[]
  transport?: string
  from?: string
  to?: string
}) {
  // 无冲突，直接创建
  const conflict = scheduleStore.checkConflict(ctx.date, ctx.startTime, ctx.endTime)
  if (!conflict) {
    await createSchedule(ctx)
    return
  }

  logger.info('App/Conflict', `检测到冲突: 新建 ${ctx.startTime}-${ctx.endTime} vs 「${conflict.content}」${conflict.startTime}-${conflict.endTime}`)

  const duration = timeToMinutes(ctx.endTime) - timeToMinutes(ctx.startTime)
  if (duration <= 0) {
    messageStore.addSystemMessage('❌ 时间设置有误，结束时间必须晚于开始时间。')
    return
  }

  // ★ 展示目标选择阶段：让用户选择调整原日程还是新日程
  messageStore.addDataMessage('conflict_resolution', '', {
    conflictInfo: { content: conflict.content, startTime: conflict.startTime, endTime: conflict.endTime },
    availableSlots: [],
    originalCtx: { ...ctx },
    isNextDay: false,
    selectedIndex: null,
    userAction: 'pending',
    adjustTarget: 'pending',
    existingScheduleId: conflict.id
  } as ConflictResolutionData)
}

// 处理用户输入（ReAct模式）
async function processInputWithReAct(text: string) {
  const sessionId = 'session_default'
  const userId = 'user1'
  
  logger.info('App/ReAct', '========== 开始 ReAct 处理 ==========')
  logger.info('App/ReAct', `用户输入: ${text}`)
  logger.info('App/ReAct', `SessionID: ${sessionId}, UserID: ${userId}`)
  
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
    
    logger.info('App/ReAct', 'LLM配置:', {
      provider: configStore.llmProvider,
      hasApiKey: !!configStore.llmApiKey ? '✓' : '✗',
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
    
    // 6. 调用ReAct引擎处理（单轮识别+表单模式）
    logger.info('App/ReAct', '调用 processWithReAct 引擎...')
    
    const result = await processWithReAct(
      text,
      {
        userId,
        currentDate: new Date().toISOString().split('T')[0] || '2024-01-01',
        scheduleStore: scheduleStore,
        taskStore: taskStore
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
      logger.info('App/ReAct', '✓ 引擎执行成功')
      logger.info('App/ReAct', `最终回答: ${result.finalAnswer}`)
      logger.info('App/ReAct', `推理步骤数: ${result.steps.length}`)
      
      brain.finishReAct(result.finalAnswer)
      
      // 8. 记录助手回复
      contextManager.addMessage(sessionId, 'assistant', result.finalAnswer)
      
      // 9. 更新状态
      contextManager.transition(sessionId, 'intent_recognized')
      
      // 检查是否有创建会议或出差申请的动作
      let hasModalAction = false
      if (result.steps.length > 0) {
        logger.debug('App/ReAct', '推理步骤详情:', result.steps)
        
        const createMeetingStep = result.steps.find(step => 
          step.action === 'open_create_meeting_modal'
        )
        
        const createTripStep = result.steps.find(step => 
          step.action === 'open_trip_application_modal'
        )
        
        if (createMeetingStep && createMeetingStep.actionInput) {
          logger.info('App/ReAct', '→ 触发会议创建表单')
          logger.debug('App/ReAct', '表单数据:', createMeetingStep.actionInput.formData)
          const formData = createMeetingStep.actionInput.formData || {}
          messageStore.addDataMessage('create_meeting', '', {
            title: formData.title || '',
            startTime: formData.startTime || '',
            endTime: formData.endTime || '',
            location: formData.location || '',
            roomType: formData.roomType || '',
            attendees: formData.attendees || [],
            remarks: formData.remarks || '',
            status: 'draft'
          } as import('./types').CreateMeetingData)
          hasModalAction = true
        } else if (createTripStep && createTripStep.actionInput) {
          logger.info('App/ReAct', '→ 触发出差申请表单')
          logger.debug('App/ReAct', '表单数据:', createTripStep.actionInput.formData)
          const tripFormData = createTripStep.actionInput.formData || {}
          messageStore.addDataMessage('trip_application', '', {
            ...tripFormData,
            scheduleId: '',
            taskId: createTripStep.actionInput.taskId || `TRIP-${Date.now()}`,
            status: 'draft'
          } as import('./types').TripApplicationData)
          hasModalAction = true
        }
        
        // 检查是否有修改日程的动作（智能匹配确认流程）
        const editScheduleStep = result.steps.find(step => 
          step.action === 'edit_schedule' || step.action === 'open_schedule_list'
        )
        if (editScheduleStep) {
          logger.info('App/ReAct', '→ 触发修改日程确认')
          const editParams = editScheduleStep.actionInput || {}
          showEditConfirmCard({
            date: editParams.date,
            keyword: editParams.keyword,
            type: editParams.type
          })
          hasModalAction = true
        }
        
        // 检查是否有取消日程的动作
        const cancelStep = result.steps.find(step => step.action === 'cancel_schedule')
        if (cancelStep) {
          logger.info('App/ReAct', '→ 触发取消日程确认')
          const cancelParams = cancelStep.actionInput || {}
          showCancelConfirmCard({
            date: cancelParams.date,
            keyword: cancelParams.keyword,
            type: cancelParams.type
          })
          hasModalAction = true
        }
      }
      
      // 判断是否有工具调用（任一 step 有 action 且非 Final Answer）
      const hadToolCall = result.steps.some(s => s.action && s.action !== 'Final Answer' && s.observation)
      
      // 检查是否有 schedule_query 工具调用 → 用结构化卡片展示
      const scheduleQueryStep = result.steps.find(s => s.action === 'schedule_query' && s.observation)
      
      // 非日程意图 → 转入通用问答 LLM
      if (!hasModalAction && !hadToolCall) {
        logger.info('App/ReAct', '→ 未识别日程意图，转入通用问答')
        brain.startThinking('思考中...')
        try {
          const { callLLMRawChat } = await import('./services/core/llmCore')
          const { REACT_PROMPTS } = await import('./services/react/reactPrompts')
          const currentDate = new Date().toISOString().split('T')[0] || ''
          const chatMessages = [
            { role: 'system', content: REACT_PROMPTS.GENERAL_CHAT(currentDate) },
            { role: 'user', content: text }
          ]
          const chatReply = await callLLMRawChat(chatMessages, {
            provider: configStore.llmProvider,
            apiKey: configStore.llmApiKey,
            apiUrl: configStore.llmApiUrl,
            model: configStore.llmModel
          })
          const answer = chatReply?.trim() || '抱歉，我暂时无法回答这个问题。'
          messageStore.addSystemMessage(answer)
          contextManager.addMessage(sessionId, 'assistant', answer)
          logger.info('App/ReAct', `通用问答回复: ${answer.substring(0, 100)}`)
        } catch (chatErr) {
          logger.error('App/ReAct', '通用问答调用失败', chatErr as Error)
          messageStore.addSystemMessage('抱歉，我暂时无法回答，请稍后再试。')
        }
      } else if (!hasModalAction && scheduleQueryStep) {
        // schedule_query 工具被调用 → 结构化卡片展示
        logger.info('App/ReAct', '→ 检测到日程查询，使用结构化卡片展示')
        const queryParams = scheduleQueryStep.actionInput || {}
        const queryDate = queryParams.date || null
        const queryKeyword = queryParams.keyword || null
        
        // 从 store 重新查询以获得完整的 Schedule 对象
        let querySchedules = [...scheduleStore.schedules]
        if (queryDate) {
          querySchedules = querySchedules.filter(s => {
            if (s.date === queryDate) return true
            // 跨天日程：有 endDate 且查询日期在 date ~ endDate 之间
            if (s.endDate && s.endDate >= queryDate && s.date <= queryDate) return true
            return false
          })
        }
        if (queryKeyword) {
          const kw = queryKeyword.toLowerCase()
          querySchedules = querySchedules.filter(s =>
            s.content.toLowerCase().includes(kw) ||
            s.location?.toLowerCase().includes(kw)
          )
        }
        querySchedules.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        
        const queryResultData: ScheduleQueryResultData = {
          queryDate,
          queryKeyword,
          summary: (result.finalAnswer && result.finalAnswer.trim() && result.finalAnswer.trim() !== ' ')
            ? result.finalAnswer.trim()
            : (querySchedules.length > 0 ? `共找到 ${querySchedules.length} 条日程` : '未找到匹配的日程'),
          totalCount: querySchedules.length,
          schedules: querySchedules.map(s => ({
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
        messageStore.addDataMessage('schedule_query_result', '', queryResultData)
      } else if (!hasModalAction && result.finalAnswer && result.finalAnswer.trim()) {
        // 有工具调用但无弹窗（如查询类操作），直接展示 finalAnswer
        logger.info('App/ReAct', '→ 添加系统消息')
        messageStore.addSystemMessage(result.finalAnswer)
      } else if (!hasModalAction) {
        logger.warn('App/ReAct', '⚠ 未添加消息 (finalAnswer为空或仅空格)')
      }
    } else {
      logger.error('App/ReAct', `✗ 引擎执行失败: ${result.error}`)
      brain.resetReAct()
      const errorMsg = `处理失败: ${result.error || '未知错误'}`
      messageStore.addSystemMessage(errorMsg)
      contextManager.addMessage(sessionId, 'assistant', errorMsg)
    }
  } catch (error) {
    brain.resetReAct()
    logger.error('App/ReAct', '✗✗ 异常捕获', error as Error)
    const errorMsg = `ReAct模式处理出错: ${(error as Error).message}`
    messageStore.addSystemMessage(errorMsg)
    contextManager.addMessage(sessionId, 'assistant', errorMsg)
  } finally {
    logger.info('App/ReAct', '========== ReAct 处理结束 ==========')
    brain.stopThinking()
  }
}

/**
 * 从 draft 中读取任务列表并执行自动推荐（偏好收集完毕后调用）
 */
async function doAutoRecommendExec() {
  const draft = brain.state.value.draft
  if (!draft?.scheduleId || !draft?.autoExecTaskIds) {
    brain.reset()
    return
  }
  
  const ids = draft.autoExecTaskIds
  const tasksToRun = taskStore.pendingTasks.filter(t => ids.includes(t.id))
  
  if (tasksToRun.length === 0) {
    messageStore.addSystemMessage('当前没有可自动执行的任务。')
    brain.reset()
    return
  }
  
  brain.startThinking('执行推荐技能...')
  
  if (useReActMode.value) {
    // === ReAct 模式：Human out of the loop ===
    const { autoExecuteTask, createPaymentTask } = await import('./services/react/autoOrderHelper')
    
    // 如果酒店地点仍未设置，用目的地兜底
    const preScheduleId = draft.scheduleId as string
    const preSchedule = scheduleStore.getSchedule(preScheduleId)
    if (preSchedule?.meta?.to && !preSchedule.meta.hotelLocation) {
      scheduleStore.updateSchedule(preScheduleId, {
        meta: { ...(preSchedule.meta || {}), hotelLocation: preSchedule.meta.to }
      })
    }
    
    const allOrderItems: import('./types/message').PaymentOrderItem[] = []
    
    for (const task of tasksToRun) {
      const schedule = scheduleStore.getSchedule(task.scheduleId)
      if (!schedule) continue
      
      const skillLabel = task.title || task.skill
      messageStore.addSystemMessage(`⏳ 正在处理「${skillLabel}」...`)
      const processingMsgId = messageStore.messages[messageStore.messages.length - 1]?.id
      
      const delay = 3000 + Math.random() * 2000
      await new Promise(r => setTimeout(r, delay))
      
      const execResult = await autoExecuteTask(task, schedule)
      
      const resultText = execResult.messages.filter(Boolean).join('<br>') || `✅ ${skillLabel} 已完成`
      if (processingMsgId !== undefined) {
        messageStore.updateMessage(processingMsgId, { content: resultText })
      }
      
      allOrderItems.push(...execResult.orderItems)
      taskStore.completeTask(task.id)
      await new Promise(r => setTimeout(r, 300))
    }
    
    if (allOrderItems.length > 0) {
      const scheduleId = draft.scheduleId as string
      const schedule = scheduleStore.getSchedule(scheduleId)
      const paymentTask = createPaymentTask(scheduleId, allOrderItems, schedule?.date || '')
      taskStore.addTasks([paymentTask])
      
      messageStore.addDataMessage('payment_order', '', {
        scheduleId,
        taskId: paymentTask.id,
        orders: allOrderItems,
        totalAmount: paymentTask.meta?.totalAmount || 0,
        confirmed: false
      } as import('./types').PaymentOrderData)
    }
  } else {
    // === 传统模式：展示列表让用户手动选择 ===
    for (const task of tasksToRun) {
      await handleExecuteTask(task)
      await new Promise(r => setTimeout(r, 300))
    }
  }
  
  brain.stopThinking()
  brain.reset()
}

// 处理用户输入（传统模式）
async function processInput(text: string) {
  // 处理统一自动执行确认
  if (brain.state.value.mode === 'WAIT_AUTO_EXEC_CONFIRM' && brain.state.value.draft?.scheduleId) {
    const reply = text.trim().toLowerCase()

    // 否定优先判断，避免"不是"被识别为同意
    if (/不|否|算了/.test(reply)) {
      messageStore.addSystemMessage('好的，这些任务会保留在待办列表中，你可以随时点击执行。')
      brain.reset()
      return
    }

    if (/是|好|ok|行|可以/.test(reply)) {
      const draft = brain.state.value.draft
      const ids = draft.autoExecTaskIds || []
      const tasksToRun = taskStore.pendingTasks.filter(t => ids.includes(t.id))

      if (tasksToRun.length === 0) {
        messageStore.addSystemMessage('当前没有可自动执行的任务。')
        brain.reset()
        return
      }

      // 检查是否有交通/酒店任务需要先收集偏好
      const hasTransport = tasksToRun.some(t => t.skill === 'arrange_transport')
      const hasHotel = tasksToRun.some(t => t.skill === 'check_hotel')
      
      if (hasTransport) {
        // 先询问出行时间偏好
        brain.setMode('WAIT_RECOMMEND_TRANSPORT_TIME')
        brain.state.value.statusText = '等待输入出行时间...'
        messageStore.addSystemMessage('🕐 请问您期望几点出发？')
        return
      } else if (hasHotel) {
        // 没有交通任务但有酒店任务，直接问商圈
        const preScheduleId = draft.scheduleId as string
        const preSchedule = scheduleStore.getSchedule(preScheduleId)
        const destination = preSchedule?.meta?.to || preSchedule?.location || ''
        brain.setMode('WAIT_RECOMMEND_HOTEL_LOC')
        brain.state.value.statusText = '等待输入酒店商圈...'
        messageStore.addSystemMessage(`🏨 请问您希望住在${destination}的哪个商圈或地点？`)
        return
      }

      // 没有交通/酒店任务，直接执行
      await doAutoRecommendExec()
      return
    }
  
    // 无法识别的输入，提示用户按规范回复
    messageStore.addSystemMessage('如果需要我自动执行这些任务，请回复"是"或"好"；如果不需要，请回复"不要"或"算了"。')
    return
  }
  
  // 处理出行时间偏好输入
  if (brain.state.value.mode === 'WAIT_RECOMMEND_TRANSPORT_TIME' && brain.state.value.draft?.scheduleId) {
    const timeText = text.trim()
    const parsedTime = extractTime(timeText)
    if (!parsedTime) {
      messageStore.addSystemMessage('⚠️ 未识别到时间，请输入如"上午8点"、"下午2点"等。')
      return
    }
      
    // 保存出行时间到日程
    const preScheduleId = brain.state.value.draft.scheduleId as string
    const preSchedule = scheduleStore.getSchedule(preScheduleId)
    if (preSchedule) {
      scheduleStore.updateSchedule(preScheduleId, { startTime: parsedTime })
    }
    logger.info('App/Pref', `✓ 出行时间偏好: ${parsedTime}`)
      
    // 检查是否有酒店任务需要问商圈
    const ids = brain.state.value.draft.autoExecTaskIds || []
    const hasHotel = taskStore.pendingTasks.some(t => ids.includes(t.id) && t.skill === 'check_hotel')
      
    if (hasHotel) {
      const destination = preSchedule?.meta?.to || preSchedule?.location || ''
      brain.setMode('WAIT_RECOMMEND_HOTEL_LOC')
      brain.state.value.statusText = '等待输入酒店商圈...'
      messageStore.addSystemMessage(`🏨 请问您希望住在${destination}的哪个商圈或地点？`)
      return
    }
      
    // 没有酒店任务，直接执行
    await doAutoRecommendExec()
    return
  }
  
  // 处理酒店商圈偏好输入
  if (brain.state.value.mode === 'WAIT_RECOMMEND_HOTEL_LOC' && brain.state.value.draft?.scheduleId) {
    const hotelLocation = text.trim()
      
    // 保存酒店商圈到日程
    const preScheduleId = brain.state.value.draft.scheduleId as string
    const preSchedule = scheduleStore.getSchedule(preScheduleId)
    if (preSchedule) {
      scheduleStore.updateSchedule(preScheduleId, {
        meta: { ...(preSchedule.meta || {}), hotelLocation }
      })
    }
    logger.info('App/Pref', `✓ 酒店商圈偏好: ${hotelLocation}`)
      
    // 偏好已收集完毕，执行自动推荐
    await doAutoRecommendExec()
    return
  }

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
  logger.info('App', '=========================================')
  logger.info('App', `📨 接收用户消息: ${text}`)
  logger.info('App', `当前模式: ${brain.state.value.mode}, 是否ReAct: ${useReActMode.value}`)
  
  messageStore.addUserMessage(text)
  
  // 优先处理特殊模式（与 ReAct/传统模式无关）
  // 这些模式均为等待用户补充信息的中间状态，需要统一由 processInput 处理
  const specialModes: BrainMode[] = [
    'WAIT_AUTO_EXEC_CONFIRM',
    'WAIT_RECOMMEND_TRANSPORT_TIME',
    'WAIT_RECOMMEND_HOTEL_LOC',
    'WAIT_HOTEL_LOCATION',
    'WAIT_TIME',
    'WAIT_CONTENT',
    'WAIT_ATTENDEES',
    'WAIT_TRIP_INFO',
    'CONFIRM_CONFLICT'
  ]
  if (specialModes.includes(brain.state.value.mode)) {
    logger.info('App', '→ 特殊模式，调用传统 processInput')
    processInput(text)
    return
  }
  
  // 根据模式选择处理方式
  if (useReActMode.value) {
    logger.info('App', '→ 调用 ReAct 模式处理')
    processInputWithReAct(text)
  } else {
    logger.info('App', '→ 调用传统模式处理')
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
  logger.info('App/Task', '========== 执行任务 ==========')
  logger.info('App/Task', '任务信息:', { id: task.id, skill: task.skill, title: task.title, scheduleId: task.scheduleId })
  
  currentActionType.value = `Running: ${task.title}`
  showProcessing.value = true
  await new Promise(r => setTimeout(r, 800))

  const schedule = scheduleStore.getSchedule(task.scheduleId)
  if (!schedule) {
    logger.error('App/Task', `✗ 日程不存在: ${task.scheduleId}`)
    showProcessing.value = false
    return
  }
  logger.info('App/Task', `✓ 已找到对应日程: ${schedule.content}`)

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
    // 资源卡片（如汽车、轮船等交通推荐）
    const resourceData = result.data as ResourceCardData
    // 如果是交通资源，添加提示语
    if (resourceData.resourceType === 'transport') {
      const schedule = scheduleStore.getSchedule(task.scheduleId)
      const from = schedule?.meta?.from || ''
      const to = schedule?.meta?.to || schedule?.location || ''
      if (from && to) {
        messageStore.addSystemMessage(`🚗 以下是根据您的行程（${from} → ${to}）为您推荐的交通方式，请确认：`)
      }
    }
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
  } else if (result.type === 'auto_order' && result.data) {
    // 自动预下单结果（航班或酒店）
    const autoOrderData = result.data as import('./types/skill').AutoOrderData
    messageStore.addSystemMessage(autoOrderData.message)
    
    // 将订单保存到 schedule.meta 中
    const schedule = scheduleStore.getSchedule(autoOrderData.scheduleId)
    if (schedule && schedule.meta) {
      if (!schedule.meta.pendingOrders) {
        schedule.meta.pendingOrders = []
      }
      (schedule.meta.pendingOrders as import('./types/message').PaymentOrderItem[]).push(autoOrderData.orderItem)
    }
    
    // 完成当前任务
    taskStore.completeTask(task.id)
  } else if (result.type === 'flight_list' && result.data) {
    // 航班列表结果
    const flightData = result.data as import('./types').FlightListData
    messageStore.addSystemMessage(`✈️ 以下是根据您的行程（${flightData.from} → ${flightData.to}）为您推荐的航班，请选择：`)
    messageStore.addDataMessage('flight_list', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId,
      selected: null,
      locked: false
    } as import('./types').FlightListData)
    // 任务保留，等用户确认航班后再完成（handleConfirmFlight 中完成）
  } else if (result.type === 'ask_hotel_location') {
    // 追问酒店商圈
    brain.setMode('WAIT_HOTEL_LOCATION')
    brain.setPendingTask(task)
    brain.state.value.draft = { scheduleId: task.scheduleId }
    brain.state.value.statusText = '等待输入酒店商圈...'
    messageStore.addSystemMessage(result.text || '🏨 请问您希望住在哪个商圈或地点？')
    // 任务保留，等用户确认酒店后再完成
    return
  } else if (result.type === 'hotel_list' && result.data) {
    // 酒店列表结果
    const hotelData = result.data as import('./types').HotelListData
    messageStore.addSystemMessage(`🏨 以下是根据您的选择（${hotelData.location}商圈）为您推荐的酒店，请选择：`)
    messageStore.addDataMessage('hotel_list', '', {
      ...result.data,
      taskId: task.id,
      scheduleId: task.scheduleId
    } as import('./types').HotelListData)
    // 任务保留，等用户确认酒店后再完成（handleConfirmHotel 中完成）
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
  logger.info('App/Resource', '========== 确认资源卡片 ==========')
  logger.debug('App/Resource', '资源数据:', data)
  logger.debug('App/Resource', `消息ID: ${msgId}`)
  
  if (data.taskId) {
    logger.info('App/Resource', `→ 完成任务: ${data.taskId}`)
    taskStore.completeTask(data.taskId)
  }
  if (data.scheduleId) {
    logger.info('App/Resource', `→ 添加资源到日程: ${data.scheduleId}`)
    const resource: Resource = {
      id: crypto.randomUUID(),
      name: data.title,
      icon: data.icon,
      resourceType: data.resourceType
    }
    scheduleStore.addResource(data.scheduleId, resource)
    logger.info('App/Resource', '✓ 资源已添加:', resource)
    
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
    
    // 如果是交通资源（汽车、轮船等），检查是否有酒店预订任务
    if (data.resourceType === 'transport') {
      logger.info('App/Resource', '→ 检测到交通资源，查找酒店预订任务...')
      const hotelTask = taskStore.pendingTasks.find(
        t => t.scheduleId === data.scheduleId && t.skill === 'check_hotel'
      )
      if (hotelTask) {
        logger.info('App/Resource', '✓ 找到酒店任务，准备询问商圈')
        const schedule = scheduleStore.getSchedule(data.scheduleId)
        const destination = schedule?.meta?.to || schedule?.location || ''
        
        setTimeout(() => {
          logger.info('App/Resource', '→ 弹出酒店商圈询问')
          messageStore.addSystemMessage(`🏨 请问您希望住在${destination}的哪个商圈或地点？`)
          
          // 设置等待酒店地点模式
          brain.setMode('WAIT_HOTEL_LOCATION')
          brain.state.value.draft = { scheduleId: data.scheduleId }
          brain.state.value.statusText = '等待输入酒店商圈...'
          brain.setPendingTask(hotelTask)
        }, 500)
      } else {
        logger.warn('App/Resource', '⚠ 未找到酒店预订任务')
      }
    }
  }
  messageStore.updateMessage(msgId, { type: 'text', content: '✅ 已确认预订' })
  logger.info('App/Resource', '✓ 消息已更新')
}

/**
 * 处理通知选项选择
 */
async function handleSelectNotifyOption(option: 'now' | 'before_15min', scheduleId: string, msgId: number) {
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
    // 地点优先级：已锁定资源 > schedule.location > 线上会议
    let location = schedule.location || '线上会议'
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
  } else if (option === 'before_15min') {
    // 设置定时通知（开会前15分钟）
    messageStore.addSystemMessage(
      `⏰ 已设置定时通知，将在会议开始前 15 分钟自动发送邀请。`
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
 * 换单辅助：替换支付清单中的指定订单项
 */
function replacePaymentOrder(
  paymentMsgId: number,
  oldOrderId: string,
  newOrder: import('./types/message').PaymentOrderItem,
  scheduleId: string
) {
  const paymentMsg = messageStore.getMessage(paymentMsgId)
  if (!paymentMsg || !paymentMsg.data || !('orders' in (paymentMsg.data as object))) {
    logger.error('App/ChangeOrder', '✗ 支付清单消息不存在')
    return
  }
  
  const paymentData = paymentMsg.data as import('./types/message').PaymentOrderData
  const orderIndex = paymentData.orders.findIndex(o => o.id === oldOrderId)
  if (orderIndex === -1) {
    logger.error('App/ChangeOrder', `✗ 未找到订单 ${oldOrderId}`)
    return
  }
  
  // 替换订单
  const updatedOrders = [...paymentData.orders]
  updatedOrders[orderIndex] = newOrder
  const newTotalAmount = updatedOrders.reduce((sum, o) => sum + o.price, 0)
  
  messageStore.updateMessage(paymentMsgId, {
    data: { ...paymentData, orders: updatedOrders, totalAmount: newTotalAmount }
  })
  
  // 同步 schedule.meta.pendingOrders
  const schedule = scheduleStore.getSchedule(scheduleId)
  if (schedule?.meta?.pendingOrders) {
    const pendingIndex = (schedule.meta.pendingOrders as any[]).findIndex((o: any) => o.id === oldOrderId)
    if (pendingIndex !== -1) {
      (schedule.meta.pendingOrders as any[])[pendingIndex] = newOrder
    }
  }
  
  logger.info('App/ChangeOrder', `✓ 订单已替换, 新总额: ¥${newTotalAmount}`)
}

/**
 * 确认航班预订
 */
function handleConfirmFlight(flightNo: string, scheduleId: string, msgId: number) {
  logger.info('App/Flight', '========== 确认航班选择 ==========')
  logger.info('App/Flight', `航班号: ${flightNo}, 日程ID: ${scheduleId}, 消息ID: ${msgId}`)
  
  const msg = messageStore.getMessage(msgId)
  if (!msg || !msg.data) {
    logger.error('App/Flight', '✗ 消息不存在或无数据')
    return
  }
  
  const flightData = msg.data as import('./types').FlightListData
  const selectedFlight = flightData.flights.find(f => f.flightNo === flightNo)
  if (!selectedFlight) {
    logger.error('App/Flight', `✗ 未找到指定航班: ${flightNo}`)
    return
  }
  logger.info('App/Flight', '✓ 已选择航班:', selectedFlight)
  
  // 锁定选择
  messageStore.updateMessage(msgId, {
    data: { ...flightData, selected: flightNo, locked: true }
  })
  
  // === 换单模式：回写到支付清单 ===
  if (flightData.changeContext) {
    const { paymentMsgId, orderId } = flightData.changeContext
    const newOrderItem: import('./types/message').PaymentOrderItem = {
      id: `flight-order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'flight',
      title: `${selectedFlight.airline} ${selectedFlight.flightNo}`,
      details: `${selectedFlight.from} → ${selectedFlight.to} | ${selectedFlight.departTime}-${selectedFlight.arriveTime} | ${selectedFlight.duration}`,
      price: selectedFlight.price,
      paymentUrl: `https://flight.example.com/pay?order=${selectedFlight.flightNo}&price=${selectedFlight.price}`,
      status: 'pending'
    }
    replacePaymentOrder(paymentMsgId, orderId, newOrderItem, scheduleId)
    
    // 在底部重新发送一条最新的支付清单，避免用户往上翻
    const paymentMsg = messageStore.getMessage(paymentMsgId)
    if (paymentMsg?.data && 'orders' in (paymentMsg.data as object)) {
      const latestData = paymentMsg.data as import('./types/message').PaymentOrderData
      messageStore.addSystemMessage(
        `✅ 已更换航班为 ${selectedFlight.flightNo}（${selectedFlight.from} → ${selectedFlight.to}），价格￥${selectedFlight.price}`
      )
      messageStore.addDataMessage('payment_order', '', { ...latestData })
    }
    return
  }
  
  // === 正常模式 ===
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
 * 取消航班选择
 */
function handleCancelFlight(_scheduleId: string, msgId: number) {
  logger.info('App/Flight', `→ 取消航班选择, 消息ID: ${msgId}`)
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data) {
    messageStore.updateMessage(msgId, {
      data: { ...(msg.data as import('./types').FlightListData), selected: null }
    })
    logger.info('App/Flight', '✓ 航班选择已取消')
  } else {
    logger.error('App/Flight', '✗ 消息不存在')
  }
}

/**
 * 取消酒店选择
 */
function handleCancelHotel(_scheduleId: string, msgId: number) {
  logger.info('App/Hotel', `→ 取消酒店选择, 消息ID: ${msgId}`)
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data) {
    messageStore.updateMessage(msgId, {
      data: { ...(msg.data as import('./types').HotelListData), selected: null }
    })
    logger.info('App/Hotel', '✓ 酒店选择已取消')
  } else {
    logger.error('App/Hotel', '✗ 消息不存在')
  }
}

/**
 * 确认酒店预订
 */
function handleConfirmHotel(hotelId: string, scheduleId: string, msgId: number) {
  logger.info('App/Hotel', '========== 确认酒店选择 ==========')
  logger.info('App/Hotel', `酒店ID: ${hotelId}, 日程ID: ${scheduleId}, 消息ID: ${msgId}`)
  
  const msg = messageStore.getMessage(msgId)
  if (!msg || !msg.data) {
    logger.error('App/Hotel', '✗ 消息不存在或无数据')
    return
  }
  
  const hotelData = msg.data as import('./types').HotelListData
  const selectedHotel = hotelData.hotels.find(h => h.hotelId === hotelId)
  if (!selectedHotel) {
    logger.error('App/Hotel', `✗ 未找到指定酒店: ${hotelId}`)
    return
  }
  logger.info('App/Hotel', '✓ 已选择酒店:', selectedHotel)
  
  // 锁定选择
  messageStore.updateMessage(msgId, {
    data: { ...hotelData, selected: hotelId, locked: true }
  })
  
  // === 换单模式：回写到支付清单 ===
  if (hotelData.changeContext) {
    const { paymentMsgId, orderId } = hotelData.changeContext
    // 计算入住天数
    const schedule = scheduleStore.getSchedule(scheduleId)
    let nights = 1
    if (schedule?.endDate && schedule?.date) {
      const start = new Date(schedule.date)
      const end = new Date(schedule.endDate)
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays > 0) nights = diffDays
    }
    const totalPrice = selectedHotel.price * nights
    
    const newOrderItem: import('./types/message').PaymentOrderItem = {
      id: `hotel-order-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'hotel',
      title: selectedHotel.name,
      details: `${selectedHotel.address} | ${selectedHotel.roomType} | ${hotelData.checkInDate} 入住 ${nights}晚 | ${selectedHotel.star}星级`,
      price: totalPrice,
      paymentUrl: `https://hotel.example.com/pay?order=${selectedHotel.hotelId}&price=${totalPrice}`,
      status: 'pending'
    }
    replacePaymentOrder(paymentMsgId, orderId, newOrderItem, scheduleId)
    
    // 在底部重新发送一条最新的支付清单，避免用户往上翻
    const paymentMsg = messageStore.getMessage(paymentMsgId)
    if (paymentMsg?.data && 'orders' in (paymentMsg.data as object)) {
      const latestData = paymentMsg.data as import('./types/message').PaymentOrderData
      messageStore.addSystemMessage(
        `✅ 已更换酒店为 ${selectedHotel.name}（${selectedHotel.roomType}），价格￥${totalPrice}`
      )
      messageStore.addDataMessage('payment_order', '', { ...latestData })
    }
    return
  }
  
  // === 正常模式 ===
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
 * 处理出差申请提交（统一处理器：传统模式 + ReAct模式）
 */
async function handleSubmitTripApplication(data: import('./types').TripApplicationData, msgId: number) {
  logger.info('App/Trip', '========== 出差申请提交 ==========')
  logger.debug('App/Trip', '表单数据:', data)
  
  // 锁定表单（标记为已提交）
  messageStore.updateMessage(msgId, {
    data: { ...data, status: 'submitted' }
  })
  
  let scheduleId = data.scheduleId
  
  // 如果没有现有日程，使用 TripFormManager 创建（ReAct 路径）
  if (!scheduleId || !scheduleStore.getSchedule(scheduleId)) {
    logger.info('App/Trip', '→ 无现有日程，调用 TripFormManager 创建...')
    const schedule = TripFormManager.createScheduleFromForm({
      startDate: data.startDate,
      startTime: data.startTime,
      endDate: data.endDate,
      endTime: data.endTime,
      from: data.from,
      to: data.to,
      transport: data.transport as import('./types').TransportMode,
      reason: data.reason
    }, scheduleId || `TRIP-${Date.now()}`)
    scheduleId = schedule.id
    logger.info('App/Trip', `✓ 日程对象已创建: ${schedule.id}`)
    
    // 冲突检测 → 智能冲突解决
    const conflict = scheduleStore.checkConflict(schedule.date, schedule.startTime, schedule.endTime)
    if (conflict) {
      logger.warn('App/Trip', `✗ 时间冲突: ${conflict.content}，启动智能冲突解决`)
      await resolveConflictAndCreate({
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        endDate: schedule.endDate,
        content: schedule.content,
        scenarioCode: 'TRIP',
        location: schedule.location,
        transport: data.transport,
        from: data.from,
        to: data.to
      })
      return
    }
    
    const tripSuccess = scheduleStore.addSchedule(schedule)
    if (!tripSuccess) {
      logger.error('App/Trip', '✗ addSchedule 返回失败')
      messageStore.addSystemMessage('❌ 无法创建出差日程：该时段已有日程。')
      return
    }
    logger.info('App/Trip', '✓ 日程已添加到 store')
    
    // 切换日期视图到出差日期，并滚动时间轴
    if (schedule.date !== scheduleStore.currentDate) {
      scheduleStore.setDate(schedule.date)
    }
    timelineRef.value?.scrollToTime(schedule.startTime)
  } else {
    // 现有日程存在（传统路径），同步更新时间信息
    logger.info('App/Trip', `→ 更新已有日程: ${scheduleId}`)
    const existingSchedule = scheduleStore.getSchedule(scheduleId)
    if (existingSchedule) {
      const transportMap: Record<string, import('./types').TransportMode> = {
        'flight': 'flight',
        'train': 'train',
        'car': 'car',
        'ship': 'ship',
        'other': 'other'
      }
      scheduleStore.updateSchedule(scheduleId, {
        date: data.startDate,
        startTime: data.startTime,
        endTime: data.endTime,
        endDate: data.endDate,
        meta: {
          ...(existingSchedule.meta || {}),
          tripApplied: true,
          from: data.from,
          to: data.to,
          transport: transportMap[data.transport] || undefined
        }
      })
    }
  }
  
  // 模拟审批过程（默认通过）
  await new Promise(r => setTimeout(r, 1000))
  
  // 更新为已通过
  messageStore.updateMessage(msgId, {
    data: { ...data, scheduleId, status: 'approved' }
  })
  
  // 完成任务
  if (data.taskId) {
    taskStore.completeTask(data.taskId)
  }
  
  if (useReActMode.value) {
    // === ReAct 模式：走 action 链（生成任务 → 询问自动推荐） ===
    messageStore.addSystemMessage(`✅ 出差申请已通过!`)
    
    const { executeAction } = await import('./services/react/skills/actionHandlers')
    const actionContext = { scheduleStore, taskStore, messageStore, configStore, brain }
    
    // 执行 generate_trip_task_list → 自动链到 ask_auto_execute
    let result = await executeAction('generate_trip_task_list', {
      scheduleId,
      startDate: data.startDate
    }, actionContext)
    
    // 处理链式 action
    while (result.success && result.nextAction) {
      result = await executeAction(result.nextAction, result.nextActionInput || {}, actionContext)
    }
  } else {
    // === 传统模式：直接展示航班列表 ===
    messageStore.addSystemMessage(`✅ 出差申请已通过！正在为您推荐航班和酒店...`)
    
    await new Promise(r => setTimeout(r, 500))

    if (data.transport === 'flight' && data.from && data.to) {
      const { generateFlightList } = await import('./services/traditional/skillRegistry')
      const updatedSchedule = scheduleStore.getSchedule(scheduleId)
      if (updatedSchedule) {
        const flightResult = generateFlightList(updatedSchedule, data.from, data.to)
        if (flightResult.type === 'flight_list' && flightResult.data) {
          messageStore.addSystemMessage(`✈️ 以下是根据您的行程（${data.from} → ${data.to}）为您推荐的航班，请选择：`)
          messageStore.addDataMessage('flight_list', '', {
            ...flightResult.data,
            scheduleId
          } as import('./types').FlightListData)
        }
      }
    } else if (data.transport === 'train') {
      messageStore.addSystemMessage(`🚄 已为您查询 ${data.from} → ${data.to} 的高铁票，请自行在 12306 预订。`)

      await new Promise(r => setTimeout(r, 500))
      const hotelTask = taskStore.pendingTasks.find(
        t => t.scheduleId === scheduleId && t.skill === 'check_hotel'
      )
      if (hotelTask) {
        messageStore.addSystemMessage(`🏨 请问您希望住在${data.to}的哪个商圈或地点？`)
        brain.setMode('WAIT_HOTEL_LOCATION')
        brain.state.value.draft = { scheduleId }
        brain.state.value.statusText = '等待输入酒店商圈...'
        brain.setPendingTask(hotelTask)
      }
    }
  }
  
  logger.info('App/Trip', '========== 出差申请流程完成 ==========')
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
    // 资源卡片（如汽车、轮船等交通推荐）
    const resourceData = result.data as ResourceCardData
    // 如果是交通资源，添加提示语
    if (resourceData.resourceType === 'transport') {
      const schedule = scheduleStore.getSchedule(data.scheduleId)
      const from = schedule?.meta?.from || ''
      const to = schedule?.meta?.to || schedule?.location || ''
      if (from && to) {
        messageStore.addSystemMessage(`🚗 以下是根据您的行程（${from} → ${to}）为您推荐的交通方式，请确认：`)
      }
    }
    messageStore.addDataMessage('resource_card', '', {
      ...result.data,
      taskId: data.taskId,
      scheduleId: data.scheduleId
    } as ResourceCardData)
  } else if (result.type === 'flight_list' && result.data) {
    // 航班列表结果
    const flightData = result.data as import('./types').FlightListData
    messageStore.addSystemMessage(`✈️ 以下是根据您的行程（${flightData.from} → ${flightData.to}）为您推荐的航班，请选择：`)
    messageStore.addDataMessage('flight_list', '', {
      ...result.data,
      taskId: data.taskId,
      scheduleId: data.scheduleId,
      selected: null,
      locked: false
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

/**
 * 冲突解决：用户选择了某个空闲时段
 */
async function handleConflictSlotSelect(slotIndex: number, data: ConflictResolutionData, msgId: number) {
  const slot = data.availableSlots[slotIndex]
  if (!slot) return

  // 标记消息中的按钮为已选中
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'selectedIndex' in msg.data) {
    (msg.data as ConflictResolutionData).selectedIndex = slotIndex
  }

  if (data.adjustTarget === 'existing' && data.existingScheduleId) {
    // ★ 调整原日程：将原日程移到选定时段，然后创建新日程
    await moveExistingAndCreateNew(data.existingScheduleId, slot, data.originalCtx)
  } else {
    // 调整新日程（默认行为）：用所选时段创建新日程
    const ctx = {
      ...data.originalCtx,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime
    } as Parameters<typeof createSchedule>[0]
    await createSchedule(ctx)
  }
}

/**
 * 冲突解决：用户同意调整至推荐时段
 */
async function handleConflictAcceptNearest(data: ConflictResolutionData, msgId: number) {
  if (!data.nearestSlot) return

  // 标记消息状态
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'userAction' in msg.data) {
    (msg.data as ConflictResolutionData).userAction = 'accepted'
  }

  const slot = data.nearestSlot

  if (data.adjustTarget === 'existing' && data.existingScheduleId) {
    // ★ 调整原日程：将原日程移到推荐时段，然后创建新日程
    await moveExistingAndCreateNew(data.existingScheduleId, slot, data.originalCtx)
  } else {
    // 调整新日程（默认行为）
    const ctx = {
      ...data.originalCtx,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime
    } as Parameters<typeof createSchedule>[0]
    await createSchedule(ctx)
  }
}

/**
 * 辅助函数：移动原日程到新时段，并在原时段创建新日程
 */
async function moveExistingAndCreateNew(
  existingId: string,
  targetSlot: { date: string; startTime: string; endTime: string },
  newScheduleCtx: Record<string, any>
) {
  const existingSchedule = scheduleStore.getSchedule(existingId)
  if (!existingSchedule) {
    messageStore.addSystemMessage('❌ 原日程已不存在，无法调整。')
    return
  }

  // 1. 移动原日程到新时段
  logger.info('App/Conflict', `移动原日程「${existingSchedule.content}」至 ${targetSlot.date} ${targetSlot.startTime}-${targetSlot.endTime}`)
  scheduleStore.updateSchedule(existingId, {
    date: targetSlot.date,
    startTime: targetSlot.startTime,
    endTime: targetSlot.endTime
  })

  messageStore.addSystemMessage(
    `<div class="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
      <div class="text-sm text-blue-700"><i class="fa-solid fa-arrows-rotate mr-1"></i>已将原日程「<b>${existingSchedule.content}</b>」调整至 ${targetSlot.startTime} - ${targetSlot.endTime}</div>
    </div>`
  )

  // 2. 在原时段创建新日程
  const ctx = {
    ...newScheduleCtx
  } as Parameters<typeof createSchedule>[0]
  await createSchedule(ctx)
}

/**
 * 冲突解决：用户选择修改时间（展示更多可选时段）
 */
function handleConflictShowMore(data: ConflictResolutionData, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'userAction' in msg.data) {
    (msg.data as ConflictResolutionData).userAction = 'show_more'
  }
}

/**
 * 冲突解决：用户取消创建
 */
function handleConflictCancel(data: ConflictResolutionData, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'userAction' in msg.data) {
    (msg.data as ConflictResolutionData).userAction = 'cancelled'
  }
  messageStore.addSystemMessage(
    `<div class="bg-gray-50 border-l-4 border-gray-300 p-3 rounded">
      <div class="text-sm text-gray-600"><i class="fa-solid fa-ban mr-1"></i>已取消创建「${data.originalCtx.content || '日程'}」</div>
    </div>`
  )
}

/**
 * 冲突解决：用户选择调整目标（原日程 or 新日程）
 * 根据选择的目标，执行三层递进策略推荐可用时段
 */
function handleConflictAdjustTarget(target: 'existing' | 'new', data: ConflictResolutionData, msgId: number) {
  const msg = messageStore.getMessage(msgId)
  if (!msg || !msg.data) return
  const conflictData = msg.data as ConflictResolutionData

  // 记录用户选择
  conflictData.adjustTarget = target

  const ctx = data.originalCtx
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (target === 'new') {
    // ========== 调整新日程：沿用原有三层递进策略 ==========
    const duration = timeToMinutes(ctx.endTime) - timeToMinutes(ctx.startTime)
    const targetDate = ctx.date
    const minStartMin = targetDate === todayStr ? nowMinutes : undefined

    // 第一层：双向就近安排
    const nearest = scheduleStore.findNearestAvailableSlot(targetDate, ctx.startTime, duration, undefined, minStartMin)
    if (nearest) {
      logger.info('App/Conflict', `[调整新日程] 就近推荐: ${nearest.start}-${nearest.end}`)
      const todaySlots = scheduleStore.findAvailableSlots(targetDate, duration, undefined, minStartMin)
      conflictData.nearestSlot = { date: targetDate, startTime: nearest.start, endTime: nearest.end }
      conflictData.availableSlots = todaySlots.map(s => ({ date: targetDate, startTime: s.start, endTime: s.end }))
      conflictData.isNextDay = false
      return
    }

    // 第二层：当天空闲时段推荐
    const todaySlots = scheduleStore.findAvailableSlots(targetDate, duration, undefined, minStartMin)
    if (todaySlots.length > 0) {
      logger.info('App/Conflict', `[调整新日程] 当天找到 ${todaySlots.length} 个空闲时段`)
      conflictData.availableSlots = todaySlots.map(s => ({ date: targetDate, startTime: s.start, endTime: s.end }))
      conflictData.isNextDay = false
      return
    }

    // 第三层：下一个工作日推荐
    const nextDay = scheduleStore.getNextWorkday(targetDate)
    const nextDaySlots = scheduleStore.findAvailableSlots(nextDay, duration)
    if (nextDaySlots.length > 0) {
      logger.info('App/Conflict', `[调整新日程] 下一工作日 ${nextDay} 找到 ${nextDaySlots.length} 个空闲时段`)
      conflictData.availableSlots = nextDaySlots.map(s => ({ date: nextDay, startTime: s.start, endTime: s.end }))
      conflictData.isNextDay = true
      return
    }

    // 兜底：无可用时段
    conflictData.userAction = 'cancelled'
    messageStore.addSystemMessage(
      `<div class="bg-red-50 border-l-4 border-red-400 p-3 rounded">
        <div class="font-bold text-red-600 text-xs mb-1"><i class="fa-solid fa-circle-xmark"></i> 无可用时段</div>
        <div class="text-sm text-gray-700">今明两个工作日均无法容纳该时长的日程，请手动选择其他日期。</div>
      </div>`
    )
  } else {
    // ========== 调整原日程：为冲突的已有日程查找可用时段 ==========
    const existingSchedule = data.existingScheduleId ? scheduleStore.getSchedule(data.existingScheduleId) : null
    if (!existingSchedule) {
      conflictData.userAction = 'cancelled'
      messageStore.addSystemMessage('❌ 未找到原日程，无法调整。')
      return
    }

    const existingDuration = timeToMinutes(existingSchedule.endTime) - timeToMinutes(existingSchedule.startTime)
    const targetDate = existingSchedule.date
    const minStartMin = targetDate === todayStr ? nowMinutes : undefined

    // 查找可用时段时，需排除原日程自身（因为原日程将被移走）
    // 同时需要排除新日程打算占用的时段
    const newStart = timeToMinutes(ctx.startTime)
    const newEnd = timeToMinutes(ctx.endTime)

    // ★ 锚点优先工作时间：原日程若在工作时间内(08:30-12:00/13:30-17:30)则保持，否则回退到09:00
    const existingStartMin = timeToMinutes(existingSchedule.startTime)
    const isInWorkingHours = (existingStartMin >= 510 && existingStartMin < 720) || (existingStartMin >= 810 && existingStartMin < 1050)
    const anchorTime = isInWorkingHours ? existingSchedule.startTime : '09:00'

    // 第一层：双向就近安排（排除原日程自身）
    const nearest = scheduleStore.findNearestAvailableSlot(
      targetDate, anchorTime, existingDuration, existingSchedule.id, minStartMin
    )
    // 过滤掉与新日程冲突的推荐
    const nearestValid = nearest && !(timeToMinutes(nearest.start) < newEnd && timeToMinutes(nearest.end) > newStart && targetDate === ctx.date)
      ? nearest : null

    if (nearestValid) {
      logger.info('App/Conflict', `[调整原日程] 就近推荐: ${nearestValid.start}-${nearestValid.end}`)
      const allSlots = scheduleStore.findAvailableSlots(targetDate, existingDuration, existingSchedule.id, minStartMin)
      // 过滤掉与新日程时段冲突的时段
      const filteredSlots = targetDate === ctx.date
        ? allSlots.filter(s => !(timeToMinutes(s.start) < newEnd && timeToMinutes(s.end) > newStart))
        : allSlots
      conflictData.nearestSlot = { date: targetDate, startTime: nearestValid.start, endTime: nearestValid.end }
      conflictData.availableSlots = filteredSlots.map(s => ({ date: targetDate, startTime: s.start, endTime: s.end }))
      conflictData.isNextDay = false
      return
    }

    // 第二层：当天空闲时段推荐
    const allSlots = scheduleStore.findAvailableSlots(targetDate, existingDuration, existingSchedule.id, minStartMin)
    const filteredSlots = targetDate === ctx.date
      ? allSlots.filter(s => !(timeToMinutes(s.start) < newEnd && timeToMinutes(s.end) > newStart))
      : allSlots
    if (filteredSlots.length > 0) {
      logger.info('App/Conflict', `[调整原日程] 当天找到 ${filteredSlots.length} 个空闲时段`)
      conflictData.availableSlots = filteredSlots.map(s => ({ date: targetDate, startTime: s.start, endTime: s.end }))
      conflictData.isNextDay = false
      return
    }

    // 第三层：下一个工作日推荐
    const nextDay = scheduleStore.getNextWorkday(targetDate)
    const nextDaySlots = scheduleStore.findAvailableSlots(nextDay, existingDuration, existingSchedule.id)
    if (nextDaySlots.length > 0) {
      logger.info('App/Conflict', `[调整原日程] 下一工作日 ${nextDay} 找到 ${nextDaySlots.length} 个空闲时段`)
      conflictData.availableSlots = nextDaySlots.map(s => ({ date: nextDay, startTime: s.start, endTime: s.end }))
      conflictData.isNextDay = true
      return
    }

    // 兜底：无可用时段
    conflictData.userAction = 'cancelled'
    messageStore.addSystemMessage(
      `<div class="bg-red-50 border-l-4 border-red-400 p-3 rounded">
        <div class="font-bold text-red-600 text-xs mb-1"><i class="fa-solid fa-circle-xmark"></i> 无可用时段</div>
        <div class="text-sm text-gray-700">原日程「${existingSchedule.content}」今明两个工作日均无法容纳该时长，请手动调整。</div>
      </div>`
    )
  }
}

/**
 * 支付订单：模拟全部支付
 */
async function handlePayAll(data: import('./types/message').PaymentOrderData, msgId: number) {
  brain.startThinking('正在处理支付...')
  
  // 模拟支付处理 3~5 秒
  const delay = 3000 + Math.random() * 2000
  await new Promise(r => setTimeout(r, delay))
  
  // 1. 更新所有订单状态为 'paid'
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'orders' in (msg.data as object)) {
    const paymentData = msg.data as import('./types/message').PaymentOrderData
    paymentData.orders.forEach(order => {
      order.status = 'paid'
    })
    paymentData.confirmed = true
  }
  
  // 2. 将订单对应的资源添加到日程
  const scheduleId = data.scheduleId
  const schedule = scheduleStore.getSchedule(scheduleId)
  if (schedule) {
    for (const order of data.orders) {
      // 检查是否已有同类资源，避免重复
      const alreadyHas = schedule.resources.some(r => 
        r.resourceType === (order.type === 'flight' ? 'transport' : 'hotel')
      )
      if (!alreadyHas) {
        const resource: import('./types').Resource = {
          id: order.id,
          name: order.title,
          icon: order.type === 'flight' ? 'fa-plane' : 'fa-hotel',
          resourceType: order.type === 'flight' ? 'transport' : 'hotel'
        }
        scheduleStore.addResource(scheduleId, resource)
      }
    }
    
    // 更新 pendingOrders 状态
    if (schedule.meta?.pendingOrders) {
      schedule.meta.pendingOrders.forEach(o => {
        o.status = 'paid'
      })
    }
  }
  
  // 3. 完成支付任务
  if (data.taskId) {
    taskStore.completeTask(data.taskId)
  }
  
  brain.stopThinking()
  
  // 4. 回显支付成功消息
  const totalAmount = data.orders.reduce((sum, o) => sum + o.price, 0)
  const flightOrders = data.orders.filter(o => o.type === 'flight')
  const hotelOrders = data.orders.filter(o => o.type === 'hotel')
  
  let summaryParts: string[] = []
  flightOrders.forEach(o => {
    summaryParts.push(`✈️ ${o.title}：¥${o.price}`)
  })
  hotelOrders.forEach(o => {
    summaryParts.push(`🏨 ${o.title}：¥${o.price}`)
  })
  
  messageStore.addSystemMessage(
    `<div class="bg-green-50 border-l-4 border-green-400 p-3 rounded">
      <div class="font-bold text-green-700 mb-2"><i class="fa-solid fa-circle-check mr-1"></i>支付成功</div>
      <div class="text-sm text-green-800 space-y-1">
        ${summaryParts.map(s => `<div>${s}</div>`).join('')}
      </div>
      <div class="mt-2 pt-2 border-t border-green-200 text-sm font-bold text-green-700">
        合计：¥${totalAmount}
      </div>
    </div>`
  )
  
  // 5. 切换到日程所在日期，确保实时概览可见
  if (schedule && schedule.date !== scheduleStore.currentDate) {
    scheduleStore.setDate(schedule.date)
  }
}

/**
 * 换单：用户在支付清单中点击"换一个"
 * 重新弹出该类型的推荐列表，标记 changeContext 以便确认后回写
 */
async function handleChangeOrder(
  orderId: string,
  orderType: 'flight' | 'hotel',
  paymentData: import('./types/message').PaymentOrderData,
  paymentMsgId: number
) {
  logger.info('App/ChangeOrder', `换单请求: orderId=${orderId}, type=${orderType}, paymentMsgId=${paymentMsgId}`)
  
  const schedule = scheduleStore.getSchedule(paymentData.scheduleId)
  if (!schedule) {
    logger.error('App/ChangeOrder', '✗ 未找到对应日程')
    messageStore.addSystemMessage('⚠️ 未找到对应日程，无法换单。')
    return
  }
  
  const changeContext = { paymentMsgId, orderId }
  
  if (orderType === 'flight') {
    const meta = schedule.meta || {}
    const from = (meta.from as string) || ''
    const to = (meta.to as string) || schedule.location || ''
    
    if (!from || !to) {
      messageStore.addSystemMessage('⚠️ 缺少出发地/目的地信息，无法重新推荐航班。')
      return
    }
    
    const { generateFlightList } = await import('./services/traditional/skillRegistry')
    const flightResult = generateFlightList(schedule, from, to)
    if (flightResult.type === 'flight_list' && flightResult.data) {
      messageStore.addSystemMessage(`✈️ 以下是可选航班（${from} → ${to}），请重新选择：`)
      messageStore.addDataMessage('flight_list', '', {
        ...flightResult.data,
        scheduleId: paymentData.scheduleId,
        changeContext
      } as import('./types').FlightListData)
    }
  } else if (orderType === 'hotel') {
    const hotelLocation = (schedule.meta as any)?.hotelLocation || schedule.location || ''
    
    if (!hotelLocation) {
      messageStore.addSystemMessage('⚠️ 缺少酒店地点信息，无法重新推荐酒店。')
      return
    }
    
    const { generateHotelList } = await import('./services/traditional/skillRegistry')
    const hotelResult = generateHotelList(schedule, hotelLocation)
    if (hotelResult.type === 'hotel_list' && hotelResult.data) {
      messageStore.addSystemMessage(`🏨 以下是可选酒店（${hotelLocation}），请重新选择：`)
      messageStore.addDataMessage('hotel_list', '', {
        ...hotelResult.data,
        scheduleId: paymentData.scheduleId,
        changeContext
      } as import('./types').HotelListData)
    }
  }
}

/**
 * 冲突解决：用户选择了自定义日期（包括"明天"快捷按钮和日期选择器）
 * 先检查新日期原始时段是否仍然冲突，无冲突则直接创建；有冲突则查询该日期的空闲时段展示
 */
async function handleConflictCustomDate(targetDate: string, data: ConflictResolutionData, msgId: number) {
  // 标记当前消息为已处理
  const msg = messageStore.getMessage(msgId)
  if (msg && msg.data && 'userAction' in msg.data) {
    (msg.data as ConflictResolutionData).userAction = 'cancelled'
  }

  const ctx = data.originalCtx

  // 格式化日期用于展示
  const dateObj = new Date(targetDate)
  const month = dateObj.getMonth() + 1
  const day = dateObj.getDate()
  const dateLabel = `${month}月${day}日`

  // 如果选择的是今天，需要过滤当前时间之前的时段
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const minStartMin = targetDate === todayStr ? nowMinutes : undefined

  if (data.adjustTarget === 'existing' && data.existingScheduleId) {
    // ========== 调整原日程：在自定义日期查找原日程的可用时段 ==========
    const existingSchedule = scheduleStore.getSchedule(data.existingScheduleId)
    if (!existingSchedule) {
      messageStore.addSystemMessage('❌ 原日程已不存在，无法调整。')
      return
    }

    const existingDuration = timeToMinutes(existingSchedule.endTime) - timeToMinutes(existingSchedule.startTime)
    const newStart = timeToMinutes(ctx.startTime)
    const newEnd = timeToMinutes(ctx.endTime)

    // ★ 锚点优先工作时间：原日程若在工作时间内则保持，否则回退到09:00
    const existingStartMin = timeToMinutes(existingSchedule.startTime)
    const isInWorkingHours = (existingStartMin >= 510 && existingStartMin < 720) || (existingStartMin >= 810 && existingStartMin < 1050)
    const anchorTime = isInWorkingHours ? existingSchedule.startTime : '09:00'

    // 查找原日程在新日期的可用时段
    const nearest = scheduleStore.findNearestAvailableSlot(targetDate, anchorTime, existingDuration, existingSchedule.id, minStartMin)
    const nearestValid = nearest && !(timeToMinutes(nearest.start) < newEnd && timeToMinutes(nearest.end) > newStart && targetDate === ctx.date)
      ? nearest : null

    const allSlots = scheduleStore.findAvailableSlots(targetDate, existingDuration, existingSchedule.id, minStartMin)
    const filteredSlots = targetDate === ctx.date
      ? allSlots.filter(s => !(timeToMinutes(s.start) < newEnd && timeToMinutes(s.end) > newStart))
      : allSlots

    if (nearestValid || filteredSlots.length > 0) {
      messageStore.addDataMessage('conflict_resolution', '', {
        conflictInfo: { content: data.conflictInfo.content, startTime: data.conflictInfo.startTime, endTime: data.conflictInfo.endTime },
        nearestSlot: nearestValid ? { date: targetDate, startTime: nearestValid.start, endTime: nearestValid.end } : undefined,
        availableSlots: filteredSlots.map(s => ({ date: targetDate, startTime: s.start, endTime: s.end })),
        originalCtx: { ...ctx },
        isNextDay: targetDate !== todayStr,
        selectedIndex: null,
        userAction: 'pending',
        adjustTarget: 'existing',
        existingScheduleId: data.existingScheduleId
      } as ConflictResolutionData)
    } else {
      messageStore.addSystemMessage(
        `<div class="bg-red-50 border-l-4 border-red-400 p-3 rounded">
          <div class="font-bold text-red-600 text-xs mb-1"><i class="fa-solid fa-circle-xmark"></i> 无可用时段</div>
          <div class="text-sm text-gray-700">${dateLabel} 无法容纳原日程「${existingSchedule.content}」的时长，请选择其他日期。</div>
        </div>`
      )
    }
    return
  }

  // ========== 调整新日程：原有逻辑 ==========
  const duration = timeToMinutes(ctx.endTime) - timeToMinutes(ctx.startTime)

  // ★ 关键：先检查新日期的原始时段是否有冲突
  const newDateConflict = scheduleStore.checkConflict(targetDate, ctx.startTime, ctx.endTime)

  if (!newDateConflict) {
    // 新日期无冲突 → 直接走正常创建流程（含场景配置、技能任务生成）
    const newCtx = { ...ctx, date: targetDate } as Parameters<typeof createSchedule>[0]
    await createSchedule(newCtx)
    return
  }

  // 新日期也有冲突 → 展示新日期的冲突信息和空闲时段
  logger.info('App/Conflict', `${dateLabel} 也存在冲突: vs「${newDateConflict.content}」${newDateConflict.startTime}-${newDateConflict.endTime}`)

  // 用新日期查找就近推荐
  const nearest = scheduleStore.findNearestAvailableSlot(targetDate, ctx.startTime, duration, undefined, minStartMin)
  const slots = scheduleStore.findAvailableSlots(targetDate, duration, undefined, minStartMin)

  if (nearest || slots.length > 0) {
    messageStore.addDataMessage('conflict_resolution', '', {
      // ★ 使用新日期的冲突信息
      conflictInfo: { content: newDateConflict.content, startTime: newDateConflict.startTime, endTime: newDateConflict.endTime },
      nearestSlot: nearest ? { date: targetDate, startTime: nearest.start, endTime: nearest.end } : undefined,
      availableSlots: slots.map(s => ({ date: targetDate, startTime: s.start, endTime: s.end })),
      // ★ 更新 originalCtx 的 date 为新日期
      originalCtx: { ...ctx, date: targetDate },
      isNextDay: targetDate !== todayStr,
      selectedIndex: null,
      userAction: 'pending',
      adjustTarget: data.adjustTarget,
      existingScheduleId: data.existingScheduleId
    } as ConflictResolutionData)
  } else {
    messageStore.addSystemMessage(
      `<div class="bg-red-50 border-l-4 border-red-400 p-3 rounded">
        <div class="font-bold text-red-600 text-xs mb-1"><i class="fa-solid fa-circle-xmark"></i> 无可用时段</div>
        <div class="text-sm text-gray-700">${dateLabel} 无法容纳该时长的日程，请选择其他日期。</div>
      </div>`
    )
  }
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
    logger.warn('App/Conflict', '缺少必要数据', { schedule, pendingScheduleUpdate: pendingScheduleUpdate.value, conflictSchedule: conflictSchedule.value })
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

// 处理创建会议提交（内嵌表单版本）
async function handleSubmitMeeting(data: import('./types').CreateMeetingData, msgId: number) {
  logger.info('App/Meeting', '========== 创建会议提交 ==========')
  logger.debug('App/Meeting', '表单数据:', data)
  
  // 锁定表单（标记为已提交）
  messageStore.updateMessage(msgId, {
    data: { ...data, status: 'submitted' }
  })
  
  // 安全解析日期和时间（兼容 ISO datetime 和纯时间两种格式）
  const meetingDate = data.startTime.includes('T') 
    ? data.startTime.split('T')[0]! 
    : (new Date().toISOString().split('T')[0]!)
  const meetingStartTime = data.startTime.includes('T') 
    ? data.startTime.split('T')[1]! 
    : data.startTime
  const meetingEndTime = data.endTime.includes('T') 
    ? data.endTime.split('T')[1]! 
    : data.endTime
  
  // 归一化参会人员列表（防御：兼容字符串/单元素数组等异常格式）
  const attendees = normalizeAttendeeList(data.attendees)
  
  // 创建会议日程
  const newSchedule: Schedule = {
    id: `sch_${Date.now()}`,
    content: data.title,
    date: meetingDate,
    startTime: meetingStartTime,
    endTime: meetingEndTime,
    type: 'meeting',
    location: data.location,
    resources: [],
    attendees,
    agenda: data.remarks || '',
    meta: {
      location: data.location,
      roomType: data.roomType,
      attendeeCount: attendees.length
    }
  }
  
  // 冲突检测 → 智能冲突解决
  const conflict = scheduleStore.checkConflict(newSchedule.date, newSchedule.startTime, newSchedule.endTime)
  if (conflict) {
    logger.warn('App/Meeting', `✗ 时间冲突: ${conflict.content}，启动智能冲突解决`)
    // 调用智能冲突解决
    await resolveConflictAndCreate({
      date: newSchedule.date,
      startTime: newSchedule.startTime,
      endTime: newSchedule.endTime,
      content: newSchedule.content,
      scenarioCode: 'MEETING',
      location: newSchedule.location,
      attendees: newSchedule.attendees
    })
    return
  }
  
  // 添加到日程存储
  logger.debug('App/Meeting', '→ 创建日程对象:', newSchedule)
  const success = scheduleStore.addSchedule(newSchedule)
  if (!success) {
    logger.error('App/Meeting', '✗ addSchedule 返回失败')
    messageStore.addSystemMessage('❌ 无法创建：该时段已有日程。')
    return
  }
  logger.info('App/Meeting', '✓ 日程已添加到 store')
  
  // 切换日期视图到会议日期，并滚动时间轴到会议时间
  if (newSchedule.date !== scheduleStore.currentDate) {
    scheduleStore.setDate(newSchedule.date)
  }
  timelineRef.value?.scrollToTime(newSchedule.startTime)
  
  // 显示成功消息
  messageStore.addSystemMessage(`✅ 会议创建成功：${data.title}`)
  
  // 如果有参会人员，询问是否立即通知
  if (attendees.length > 0) {
    logger.info('App/Meeting', '→ 检测到参会人员，准备询问通知')
    logger.debug('App/Meeting', '参会人员列表:', attendees)
    setTimeout(() => {
      logger.info('App/Meeting', '→ 弹出通知选项卡片')
      messageStore.addDataMessage('notify_option', '', {
        scheduleId: newSchedule.id,
        scheduleContent: data.title,
        meetingTime: `${newSchedule.startTime} - ${newSchedule.endTime}`,
        attendees,
        selected: null,
        confirmed: false
      } as import('./types').NotifyOptionData)
    }, 300)
  } else {
    logger.info('App/Meeting', '⚠ 无参会人员，跳过通知询问')
  }
  
  logger.info('App/Meeting', '========== 会议创建完成 ==========')
}

// 处理出差表单字段更新（已移除 — 内嵌表单自行管理状态）

// ==================== 取消日程处理 ====================

/**
 * 展示取消确认卡片
 * 根据 ReAct 工具返回的 scheduleId/keyword/date/type 匹配日程
 */
function showCancelConfirmCard(params: { scheduleId?: string; keyword?: string; date?: string; type?: string }) {
  const today = scheduleStore.systemCurrentDate || new Date().toISOString().split('T')[0] || ''
  
  // 构建候选列表：所有未来日程
  const futureSchedules = scheduleStore.schedules
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  
  if (futureSchedules.length === 0) {
    messageStore.addSystemMessage('暂无可取消的日程。')
    return
  }
  
  // 尝试匹配日程
  let matched: typeof futureSchedules[0] | null = null
  
  // 优先用 scheduleId 精确匹配
  if (params.scheduleId) {
    matched = futureSchedules.find(s => s.id === params.scheduleId) || null
  }
  
  // 按日期 + 类型 + 关键词模糊匹配
  if (!matched) {
    let candidates = [...futureSchedules]
    
    if (params.date) {
      const dateFiltered = candidates.filter(s => s.date === params.date || (s.endDate && params.date! >= s.date && params.date! <= s.endDate))
      if (dateFiltered.length > 0) candidates = dateFiltered
    }
    
    if (params.type) {
      const typeMap: Record<string, string> = { meeting: 'meeting', trip: 'trip', '会议': 'meeting', '出差': 'trip' }
      const mappedType = typeMap[params.type] || params.type
      const typeFiltered = candidates.filter(s => s.type === mappedType)
      if (typeFiltered.length > 0) candidates = typeFiltered
    }
    
    if (params.keyword) {
      const kw = params.keyword.toLowerCase()
      const kwFiltered = candidates.filter(s => 
        s.content.toLowerCase().includes(kw) || 
        s.location?.toLowerCase().includes(kw) ||
        s.meta?.from?.toLowerCase().includes(kw) ||
        s.meta?.to?.toLowerCase().includes(kw)
      )
      if (kwFiltered.length > 0) candidates = kwFiltered
    }
    
    // 如果过滤后只剩一条，就是匹配结果
    if (candidates.length === 1) {
      matched = candidates[0]!
    } else if (candidates.length > 1 && candidates.length < futureSchedules.length) {
      // 过滤有效果但仍有多条，取第一条作为推荐
      matched = candidates[0]!
    }
  }
  
  // 转换为 ScheduleQueryItem 格式
  const toQueryItem = (s: typeof futureSchedules[0]) => ({
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    endDate: s.endDate,
    content: s.content,
    type: s.type,
    location: s.location,
    attendees: s.attendees,
    resources: s.resources?.map(r => ({ id: r.id, name: r.name, icon: r.icon, resourceType: r.resourceType })),
    meta: s.meta
  })
  
  const cancelData: import('./types').CancelConfirmData = {
    matchedSchedule: matched ? toQueryItem(matched) : null,
    allSchedules: futureSchedules.map(toQueryItem),
    userAction: 'pending',
    selectedId: null
  }
  
  messageStore.addDataMessage('cancel_confirm', '', cancelData)
}

/**
 * 用户确认取消日程
 */
function handleConfirmCancelSchedule(scheduleId: string, msgId: number) {
  const schedule = scheduleStore.getSchedule(scheduleId)
  if (!schedule) {
    messageStore.addSystemMessage('该日程不存在或已被删除。')
    return
  }
  
  const content = schedule.content
  
  // 清理关联的任务
  const relatedTasks = taskStore.pendingTasks.filter(t => t.scheduleId === scheduleId)
  relatedTasks.forEach(t => taskStore.completeTask(t.id))
  
  // 删除日程
  scheduleStore.deleteSchedule(scheduleId)
  
  // 更新卡片状态
  const existingMsg = messageStore.messages.find(m => m.id === msgId)
  const existingData = existingMsg?.data as import('./types').CancelConfirmData | undefined
  if (existingData) {
    messageStore.updateMessage(msgId, {
      data: {
        ...existingData,
        userAction: 'cancelled' as const,
        selectedId: scheduleId
      } satisfies import('./types').CancelConfirmData
    })
  }
  
  messageStore.addSystemMessage(`✅ 已取消日程「${content}」`)
  logger.info('App/Cancel', `日程已取消: ${scheduleId} - ${content}`)
}

/**
 * 用户从列表重新选了一条日程（点击"不是这个"后选的）
 * 直接执行取消
 */
function handleReselectCancelSchedule(scheduleId: string, msgId: number) {
  handleConfirmCancelSchedule(scheduleId, msgId)
}

// ==================== 修改日程处理 ====================

/**
 * 展示修改确认卡片
 * 根据 ReAct 工具返回的 keyword/date/type 智能匹配日程
 */
function showEditConfirmCard(params: { keyword?: string; date?: string; type?: string }) {
  const today = scheduleStore.systemCurrentDate || new Date().toISOString().split('T')[0] || ''
  
  // 构建候选列表：所有未来日程
  const futureSchedules = scheduleStore.schedules
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  
  if (futureSchedules.length === 0) {
    messageStore.addSystemMessage('暂无可修改的日程。')
    return
  }
  
  // 尝试匹配日程
  let matched: typeof futureSchedules[0] | null = null
  let candidates = [...futureSchedules]
  
  if (params.date) {
    const dateFiltered = candidates.filter(s => s.date === params.date || (s.endDate && params.date! >= s.date && params.date! <= s.endDate))
    if (dateFiltered.length > 0) candidates = dateFiltered
  }
  
  if (params.type) {
    const typeMap: Record<string, string> = { meeting: 'meeting', trip: 'trip', '会议': 'meeting', '出差': 'trip' }
    const mappedType = typeMap[params.type] || params.type
    const typeFiltered = candidates.filter(s => s.type === mappedType)
    if (typeFiltered.length > 0) candidates = typeFiltered
  }
  
  if (params.keyword) {
    const kw = params.keyword.toLowerCase()
    const kwFiltered = candidates.filter(s => 
      s.content.toLowerCase().includes(kw) || 
      s.location?.toLowerCase().includes(kw) ||
      s.meta?.from?.toLowerCase().includes(kw) ||
      s.meta?.to?.toLowerCase().includes(kw)
    )
    if (kwFiltered.length > 0) candidates = kwFiltered
  }
  
  if (candidates.length === 1) {
    matched = candidates[0]!
  } else if (candidates.length > 1 && candidates.length < futureSchedules.length) {
    matched = candidates[0]!
  }
  
  // 转换为 ScheduleQueryItem 格式
  const toQueryItem = (s: typeof futureSchedules[0]) => ({
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    endDate: s.endDate,
    content: s.content,
    type: s.type,
    location: s.location,
    attendees: s.attendees,
    resources: s.resources?.map(r => ({ id: r.id, name: r.name, icon: r.icon, resourceType: r.resourceType })),
    meta: s.meta
  })
  
  const editData: import('./types').EditConfirmData = {
    matchedSchedule: matched ? toQueryItem(matched) : null,
    allSchedules: futureSchedules.map(toQueryItem),
    userAction: 'pending',
    selectedId: null
  }
  
  messageStore.addDataMessage('edit_confirm', '', editData)
}

/**
 * 用户确认修改日程 → 打开 DetailModal
 */
function handleConfirmEditSchedule(scheduleId: string, msgId: number) {
  const schedule = scheduleStore.getSchedule(scheduleId)
  if (!schedule) {
    messageStore.addSystemMessage('该日程不存在或已被删除。')
    return
  }
  
  // 更新卡片状态
  const existingMsg = messageStore.messages.find(m => m.id === msgId)
  const existingData = existingMsg?.data as import('./types').EditConfirmData | undefined
  if (existingData) {
    messageStore.updateMessage(msgId, {
      data: {
        ...existingData,
        userAction: 'editing' as const,
        selectedId: scheduleId
      } satisfies import('./types').EditConfirmData
    })
  }
  
  // 切换日期并打开编辑弹窗
  if (schedule.date !== scheduleStore.currentDate) {
    scheduleStore.setDate(schedule.date)
  }
  selectedEvent.value = schedule
  showDetailModal.value = true
  messageStore.addSystemMessage(`已打开「${schedule.content}」的编辑页面`)
  logger.info('App/Edit', `打开编辑: ${scheduleId} - ${schedule.content}`)
}

/**
 * 用户从列表重新选了一条日程（点击"不是这个"后选的）
 * 直接打开编辑
 */
function handleReselectEditSchedule(scheduleId: string, msgId: number) {
  handleConfirmEditSchedule(scheduleId, msgId)
}

function handleToggleScenarioSkill(scenarioCode: string, skillCode: string) {
  configStore.toggleScenarioSkill(scenarioCode, skillCode)
}

// ==================== 生命周期 ====================

onMounted(async () => {
  logger.info('App', '========== 应用启动 ==========')
  logger.info('App', `会话ID: ${logger.getSessionId()}`)
  logger.info('App', `系统时间: ${new Date().toISOString()}`)
  
  // 启动通知服务
  startNotificationService(() => scheduleStore.schedules, 30000)
  logger.info('App', '✓ 日程通知服务已启动')
  
  // 初始化上下文管理器
  logger.info('App', '✓ ContextManager 已就绪')
  logger.info('App', '✓ 应用初始化完成')
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
          :current-date="scheduleStore.currentDate"
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
          <button
            @click="showLogViewer = true"
            class="ml-3 px-3 py-1 rounded-md text-sm bg-purple-500 text-white hover:bg-purple-600 transition-colors"
            title="查看日志"
          >
            <i class="fa-solid fa-file-lines"></i>
            日志
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
      @cancel-flight="handleCancelFlight"
      @select-hotel="handleSelectHotel"
      @confirm-hotel="handleConfirmHotel"
      @cancel-hotel="handleCancelHotel"
      @submit-trip-application="handleSubmitTripApplication"
      @select-notify-option="handleSelectNotifyOption"
      @skip-notify="handleSkipNotify"
      @remove-attendee="handleRemoveAttendee"
      @restore-attendee="handleRestoreAttendee"
      @confirm-attendees="handleConfirmAttendees"
      @confirm-skill-params="handleConfirmSkillParams"
      @cancel-skill-params="handleCancelSkillParams"
      @select-schedule-to-edit="handleSelectScheduleToEdit"
      @select-conflict-slot="handleConflictSlotSelect"
      @accept-conflict-nearest="handleConflictAcceptNearest"
      @show-more-conflict-slots="handleConflictShowMore"
      @cancel-conflict="handleConflictCancel"
      @select-conflict-custom-date="handleConflictCustomDate"
      @select-conflict-adjust-target="handleConflictAdjustTarget"
      @pay-all="handlePayAll"
      @change-order="handleChangeOrder"
      @submit-meeting="handleSubmitMeeting"
      @confirm-cancel-schedule="handleConfirmCancelSchedule"
      @reselect-cancel-schedule="handleReselectCancelSchedule"
      @confirm-edit-schedule="handleConfirmEditSchedule"
      @reselect-edit-schedule="handleReselectEditSchedule"
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

    <!-- Create Meeting Modal removed — now inline in ChatPanel -->

    <!-- Log Viewer Modal -->
    <LogViewerModal
      :visible="showLogViewer"
      @close="showLogViewer = false"
    />

    <!-- Trip Application Modal removed — now inline in ChatPanel -->

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
