import { ref, computed } from 'vue'
import type { BrainState, BrainMode, ScheduleDraft, Task } from '../types'
import type { ReActStep } from '../services/react/reactPrompts'

/**
 * AI 大脑状态管理
 */
export function useBrain() {
  const state = ref<BrainState>({
    isThinking: false,
    statusText: '在线',
    currentProcess: '',
    draft: null,
    mode: 'IDLE',
    pendingTask: null,
    isGeneratingAgenda: false,
    generatingId: null
  })
  
  // ReAct相关状态
  const reactState = ref({
    isActive: false,
    currentStep: 0,
    totalSteps: 0,
    steps: [] as ReActStep[],
    isExecutingTool: false,
    currentTool: ''
  })

  // 快捷建议
  const quickSuggestions = computed(() => {
    switch (state.value.mode) {
      case 'WAIT_TIME':
        return ['上午 9:00', '下午 2:00']
      case 'WAIT_CONTENT':
        return ['会议', '出差']
      case 'WAIT_ATTENDEES':
        return ['李明', '王总', '李明和王总']
      case 'WAIT_TRIP_INFO': {
        // 根据 draft 中缺少的字段提供建议
        const draft = state.value.draft
        if (!draft) return []
        
        if (!draft.from) {
          // 缺少出发地
          return ['珠海', '深圳', '广州']
        } else if (!draft.to) {
          // 缺少目的地
          return ['北京', '上海', '杭州']
        } else if (!draft.date) {
          // 缺少日期
          return ['今天', '明天', '后天']
        } else if (!draft.startTime) {
          // 缺少时间
          return ['上午 9 点', '下午 2 点', '晚上 6 点']
        }
        return []
      }
      case 'WAIT_HOTEL_LOCATION':
        // 酒店商圈建议
        return ['国贸附近', '中关村', '陆家嘴', '天府广场']
      case 'CONFIRM_CONFLICT':
        return ['确认继续', '取消']
      case 'WAIT_AUTO_EXEC_CONFIRM':
        return ['是', '好', '不用自动执行']
      case 'WAIT_RECOMMEND_TRANSPORT_TIME':
        return ['上午 8 点', '上午 10 点', '下午 2 点', '下午 4 点']
      case 'WAIT_RECOMMEND_HOTEL_LOC':
        return ['国贸附近', '中关村', '陆家嘴', '天府广场']
      default:
        return []
    }
  })

  // 是否正在调用大模型
  const isCallingLLM = ref(false)

  // 开始思考
  function startThinking(process: string = '分析中...') {
    state.value.isThinking = true
    state.value.currentProcess = process
    state.value.statusText = '分析意图...'
  }
  
  // ReAct相关方法
  function startReAct(totalSteps: number) {
    reactState.value.isActive = true
    reactState.value.currentStep = 0
    reactState.value.totalSteps = totalSteps
    reactState.value.steps = []
    state.value.statusText = 'ReAct推理中...'
  }
  
  function updateReActStep(step: ReActStep) {
    reactState.value.currentStep++
    reactState.value.steps.push(step)
    
    if (step.thought) {
      state.value.currentProcess = `思考: ${step.thought.substring(0, 50)}...`
    }
    if (step.action) {
      reactState.value.isExecutingTool = true
      reactState.value.currentTool = step.action
      state.value.statusText = `执行工具: ${step.action}`
    }
  }
  
  function finishReAct(finalAnswer: string) {
    reactState.value.isActive = false
    reactState.value.isExecutingTool = false
    state.value.statusText = '在线'
    state.value.currentProcess = `完成: ${finalAnswer.substring(0, 30)}...`
  }
  
  function resetReAct() {
    reactState.value.isActive = false
    reactState.value.currentStep = 0
    reactState.value.totalSteps = 0
    reactState.value.steps = []
    reactState.value.isExecutingTool = false
    reactState.value.currentTool = ''
  }

  // 开始调用大模型
  function startCallingLLM() {
    isCallingLLM.value = true
    state.value.statusText = '在线 (调用大模型)'
  }

  // 停止调用大模型
  function stopCallingLLM() {
    isCallingLLM.value = false
    state.value.statusText = '在线'
  }

  // 停止思考
  function stopThinking() {
    state.value.isThinking = false
    state.value.currentProcess = ''
    state.value.statusText = '在线'
  }

  // 设置模式
  function setMode(mode: BrainMode) {
    state.value.mode = mode
  }

  // 设置草稿
  function setDraft(draft: ScheduleDraft | null) {
    state.value.draft = draft
  }

  // 等待用户输入
  function waitForInput(mode: BrainMode, draft: ScheduleDraft) {
    state.value.mode = mode
    state.value.draft = draft
    state.value.isThinking = false
    state.value.statusText = '等待输入...'
  }

  // 重置状态
  function reset() {
    state.value.mode = 'IDLE'
    state.value.draft = null
    state.value.isThinking = false
    state.value.statusText = '在线'
    state.value.pendingTask = null
  }

  // 设置待处理任务
  function setPendingTask(task: Task | null) {
    state.value.pendingTask = task
  }

  // 开始生成议程
  function startGeneratingAgenda(eventId: string) {
    state.value.isGeneratingAgenda = true
    state.value.generatingId = eventId
  }

  // 停止生成议程
  function stopGeneratingAgenda() {
    state.value.isGeneratingAgenda = false
    state.value.generatingId = null
  }

  return {
    state,
    reactState,
    isCallingLLM,
    quickSuggestions,
    startThinking,
    stopThinking,
    startCallingLLM,
    stopCallingLLM,
    setMode,
    setDraft,
    waitForInput,
    reset,
    setPendingTask,
    startGeneratingAgenda,
    stopGeneratingAgenda,
    // ReAct相关方法
    startReAct,
    updateReActStep,
    finishReAct,
    resetReAct
  }
}
