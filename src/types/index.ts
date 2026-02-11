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
}

// Gemini 意图解析结果
export interface IntentData {
  intent: 'create' | 'query' | 'update' | 'chat'
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
