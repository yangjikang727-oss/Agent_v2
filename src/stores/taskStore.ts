import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task, TaskStatus } from '../types'

export const useTaskStore = defineStore('task', () => {
  // 状态
  const tasks = ref<Task[]>([])

  // 计算属性：待办任务
  const pendingTasks = computed(() => 
    tasks.value.filter(t => t.status === 'pending')
  )

  // 计算属性：待办任务数量
  const pendingCount = computed(() => pendingTasks.value.length)

  // 添加任务
  function addTask(task: Task) {
    tasks.value.push(task)
  }

  // 批量添加任务
  function addTasks(newTasks: Task[]) {
    tasks.value.push(...newTasks)
  }

  // 更新任务状态
  function updateTaskStatus(id: string, status: TaskStatus) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.status = status
    }
  }

  // 完成任务
  function completeTask(id: string) {
    updateTaskStatus(id, 'done')
  }

  // 跳过任务
  function skipTask(id: string) {
    updateTaskStatus(id, 'skipped')
  }

  // 获取任务
  function getTask(id: string): Task | undefined {
    return tasks.value.find(t => t.id === id)
  }

  // 获取日程相关的任务
  function getTasksByScheduleId(scheduleId: string): Task[] {
    return tasks.value.filter(t => t.scheduleId === scheduleId)
  }

  // 删除日程相关的所有任务
  function removeTasksByScheduleId(scheduleId: string) {
    tasks.value = tasks.value.filter(t => t.scheduleId !== scheduleId)
  }

  // 清空所有任务
  function clearAll() {
    tasks.value = []
  }

  return {
    // 状态
    tasks,
    // 计算属性
    pendingTasks,
    pendingCount,
    // 方法
    addTask,
    addTasks,
    updateTaskStatus,
    completeTask,
    skipTask,
    getTask,
    getTasksByScheduleId,
    removeTasksByScheduleId,
    clearAll
  }
})
