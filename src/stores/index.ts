/**
 * 状态管理 - 统一导出入口
 * 
 * 基于 Pinia 的全局状态管理，包括：
 * - scheduleStore: 日程数据（增删改查、冲突检测）
 * - taskStore: 任务数据（待办、已完成）
 * - messageStore: 聊天消息列表
 * - configStore: 技能/场景/LLM 配置
 */

export { useScheduleStore } from './scheduleStore'
export { useTaskStore } from './taskStore'
export { useMessageStore } from './messageStore'
export { useConfigStore } from './configStore'

// 持久化工具
export { clearAllPersistedData, getPersistedDataSize } from './plugins/persistPlugin'
