<script setup lang="ts">
import { computed } from 'vue'
import type { Schedule, ScheduleType } from '../../types'
import { SCHEDULE_THEMES } from '../../types'
import { calculateTimePosition, calculateEventHeight } from '../../utils/dateUtils'

const props = defineProps<{
  schedule: Schedule
  currentDate?: string
}>()

const emit = defineEmits<{
  click: [schedule: Schedule]
  delete: [id: string]
}>()

// 时间轴边界常量
const TIMELINE_START = '07:00'  // 时间轴起始
const TIMELINE_END = '21:00'    // 时间轴结束

/**
 * 计算跨天日程在当前查看日期的有效显示时间范围
 * - 出发日：startTime → 21:00
 * - 返程日：07:00 → endTime
 * - 中间日：07:00 → 21:00（全天）
 */
const effectiveTimeRange = computed(() => {
  const s = props.schedule
  const viewDate = props.currentDate

  // 非跨天日程 或 无 currentDate → 原样返回
  if (!s.endDate || !viewDate || s.date === s.endDate) {
    return { start: s.startTime, end: s.endTime }
  }

  if (viewDate === s.date) {
    // 出发日：从 startTime 延伸到时间轴底部
    return { start: s.startTime, end: TIMELINE_END }
  } else if (viewDate === s.endDate) {
    // 返程日：从时间轴顶部延伸到 endTime
    return { start: TIMELINE_START, end: s.endTime }
  } else if (viewDate > s.date && viewDate < s.endDate) {
    // 中间日：全天
    return { start: TIMELINE_START, end: TIMELINE_END }
  }

  // 不在范围内（理论上不会到这里）
  return { start: s.startTime, end: s.endTime }
})

/**
 * 格式化日期为 yyyy/MM/dd
 */
function formatDate(date: string): string {
  if (!date) return ''
  // date 为 yyyy-MM-dd 格式
  return date.replace(/-/g, '/')
}

/**
 * 显示用的完整时间文本（年/月/日 时:分）
 */
const displayTimeText = computed(() => {
  const s = props.schedule
  const startDate = formatDate(s.date)
  const endDate = s.endDate ? formatDate(s.endDate) : startDate
  const startFull = `${startDate} ${s.startTime}`
  const endFull = `${endDate} ${s.endTime}`
  // 同一天时只显示日期一次
  if (startDate === endDate) {
    return `${startFull} - ${s.endTime}`
  }
  return `${startFull} - ${endFull}`
})

// 计算样式
const cardStyle = computed(() => {
  const { start, end } = effectiveTimeRange.value
  const top = calculateTimePosition(start)
  const height = calculateEventHeight(start, end)
  
  let type: ScheduleType = 'general'
  if (props.schedule.type?.includes('trip')) type = 'trip'
  else if (props.schedule.type?.includes('meeting')) type = 'meeting'
  
  const theme = SCHEDULE_THEMES[type]
  
  return {
    top: `${top}px`,
    height: `${height}px`,
    borderLeftColor: theme.border,
    backgroundColor: theme.bg,
    color: theme.text,
    boxShadow: `0 4px 6px -1px ${theme.shadow}`
  }
})
</script>

<template>
  <div 
    class="event-card group"
    :style="cardStyle"
    @click="emit('click', schedule)"
  >
    <!-- Title -->
    <div class="font-bold truncate flex items-center gap-2 mb-1 text-sm">
      {{ schedule.content }}
    </div>

    <!-- Time -->
    <div class="text-[10px] opacity-80 flex items-center gap-2 font-medium flex-wrap">
      <span>
        <i class="fa-regular fa-clock"></i> 
        {{ displayTimeText }}
      </span>
      <span v-if="schedule.location">
        <i class="fa-solid fa-location-dot"></i> 
        {{ schedule.location }}
      </span>
    </div>

    <!-- Resources & Attendees -->
    <div 
      v-if="(schedule.resources?.length > 0) || (schedule.attendees?.length > 0)" 
      class="mt-2 flex flex-wrap gap-1.5"
    >
      <!-- Resources -->
      <div 
        v-for="res in schedule.resources" 
        :key="res.id"
        class="bg-white/60 backdrop-blur-sm px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 border border-black/5 shadow-sm text-gray-700"
      >
        <i :class="['fa-solid', res.icon]"></i> {{ res.name }}
      </div>

      <!-- Attendees -->
      <div 
        v-for="person in schedule.attendees" 
        :key="person"
        class="bg-indigo-100/50 px-2 py-0.5 rounded-md text-[10px] font-bold border border-indigo-200/30 text-indigo-800"
      >
        <i class="fa-solid fa-user"></i> {{ person }}
      </div>
    </div>

    <!-- Delete Button -->
    <div 
      @click.stop="emit('delete', schedule.id)"
      class="event-delete-btn"
    >
      <i class="fa-solid fa-xmark"></i>
    </div>
  </div>
</template>
