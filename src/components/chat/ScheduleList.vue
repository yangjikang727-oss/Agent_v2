<script setup lang="ts">
import type { Schedule } from '../../types'

defineProps<{
  schedules: Schedule[]
}>()

const emit = defineEmits<{
  select: [schedule: Schedule]
}>()

// 格式化日期为更友好的显示
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  const todayStr = today.toISOString().split('T')[0]
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  
  if (dateStr === todayStr) return '今天'
  if (dateStr === tomorrowStr) return '明天'
  
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${month}月${day}日 ${weekDays[date.getDay()]}`
}

// 获取类型图标
function getTypeIcon(type: Schedule['type']): string {
  const icons: Record<string, string> = {
    meeting: 'fa-users',
    trip: 'fa-plane',
    general: 'fa-calendar'
  }
  return icons[type] || 'fa-calendar'
}

// 获取类型颜色
function getTypeColor(type: Schedule['type']): string {
  const colors: Record<string, string> = {
    meeting: 'text-blue-500 bg-blue-50',
    trip: 'text-purple-500 bg-purple-50',
    general: 'text-gray-500 bg-gray-50'
  }
  return colors[type] || 'text-gray-500 bg-gray-50'
}
</script>

<template>
  <div class="schedule-list">
    <div class="text-xs text-gray-500 mb-3">
      <i class="fa-solid fa-list-check mr-1"></i>
      点击要修改的日程：
    </div>
    
    <div v-if="schedules.length === 0" class="text-center py-6 text-gray-400">
      <i class="fa-solid fa-calendar-xmark text-2xl mb-2"></i>
      <p class="text-sm">暂无未来日程</p>
    </div>
    
    <div class="space-y-2">
      <div 
        v-for="schedule in schedules" 
        :key="schedule.id"
        @click="emit('select', schedule)"
        class="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-indigo-300 hover:shadow-md cursor-pointer transition group"
      >
        <!-- 类型图标 -->
        <div :class="['w-9 h-9 rounded-lg flex items-center justify-center shrink-0', getTypeColor(schedule.type)]">
          <i :class="['fa-solid', getTypeIcon(schedule.type)]"></i>
        </div>
        
        <!-- 内容 -->
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold text-gray-800 truncate group-hover:text-indigo-600 transition">
            {{ schedule.content }}
          </div>
          <div class="text-xs text-gray-400 mt-0.5">
            {{ formatDate(schedule.date) }} · {{ schedule.startTime }} - {{ schedule.endTime }}
          </div>
        </div>
        
        <!-- 箭头 -->
        <div class="text-gray-300 group-hover:text-indigo-400 transition">
          <i class="fa-solid fa-chevron-right"></i>
        </div>
      </div>
    </div>
  </div>
</template>
