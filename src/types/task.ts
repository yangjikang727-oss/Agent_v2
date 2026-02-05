// 任务状态
export type TaskStatus = 'pending' | 'done' | 'skipped'

// 任务
export interface Task {
  id: string
  scheduleId: string
  title: string
  desc: string
  icon: string
  skill: string
  actionBtn: string
  date: string
  status: TaskStatus
}
