/**
 * 类型系统 - 统一导出入口
 * 
 * 导出所有业务数据模型、AI 状态类型、意图解析结构等。
 * 外部模块统一通过 `import type { ... } from '../types'` 引用。
 */

// 导出所有类型
export * from './schedule'
export * from './task'
export * from './message'
export * from './skill'

// AI 大脑状态模式
export type BrainMode = 
  | 'IDLE' 
  | 'WAIT_TIME' 
  | 'WAIT_CONTENT' 
  | 'WAIT_ATTENDEES' 
  | 'WAIT_TRIP_INFO'       // 等待出差信息补充
  | 'WAIT_HOTEL_LOCATION'  // 等待酒店商圈输入
  | 'CONFIRM_CONFLICT'
  | 'WAIT_AUTO_EXEC_CONFIRM'  // 等待自动执行推荐技能的确认
  | 'WAIT_RECOMMEND_TRANSPORT_TIME'  // 等待用户输入出行时间偏好
  | 'WAIT_RECOMMEND_HOTEL_LOC'       // 等待用户输入酒店商圈偏好
  | 'FILLING_MEETING_FORM'           // 对话式填充会议表单
  | 'FILLING_TRIP_FORM'              // 对话式填充出差表单

// 表单填充模式的类型
export type FormFillingType = 'meeting' | 'trip'

// AI 大脑状态
export interface BrainState {
  isThinking: boolean
  statusText: string
  currentProcess: string
  draft: ScheduleDraft | null
  mode: BrainMode
  pendingTask: import('./task').Task | null
  isGeneratingAgenda: boolean
  generatingId: string | null
  // 表单填充模式相关
  activeFormMsgId: number | null       // 当前正在填充的表单消息ID
  activeFormType: FormFillingType | null  // 当前表单类型
  currentAskingField: string | null    // 当前正在询问的字段名
}

// 日程草稿 (创建过程中的临时数据)
export interface ScheduleDraft {
  date?: string
  startTime?: string
  endTime?: string
  endDate?: string        // 返程日期（跨天行程）
  content?: string
  scenarioCode?: string
  location?: string
  from?: string           // 出差出发地
  to?: string             // 出差目的地
  attendees?: string[]
  transport?: import('./schedule').TransportMode
  hotelLocation?: string  // 酒店商圈/地点
  scheduleId?: string     // 关联的日程ID
  autoExecTaskIds?: string[]  // 待自动执行的任务ID列表
  timePeriod?: 'morning' | 'afternoon' | 'evening'  // 时间偏好（上午/下午/晚上）
}

// Gemini 意图解析结果
export interface IntentData {
  intent: 'create' | 'query' | 'update' | 'cancel' | 'chat'
  summary?: string
  date?: string
  startTime?: string
  endTime?: string
  endDate?: string       // 返程日期（跨天行程）
  location?: string
  from?: string       // 出差出发地
  to?: string         // 出差目的地
  attendees?: string[]
  type?: 'meeting' | 'trip' | 'other'
  transport?: import('./schedule').TransportMode | null
  reply?: string  // 用于 chat 意图的回复
}
