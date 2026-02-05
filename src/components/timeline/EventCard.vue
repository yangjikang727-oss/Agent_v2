<script setup lang="ts">
import { computed } from 'vue'
import type { Schedule, ScheduleType } from '../../types'
import { SCHEDULE_THEMES } from '../../types'
import { calculateTimePosition, calculateEventHeight } from '../../utils/dateUtils'

const props = defineProps<{
  schedule: Schedule
}>()

const emit = defineEmits<{
  click: [schedule: Schedule]
  delete: [id: string]
}>()

// 计算样式
const cardStyle = computed(() => {
  const top = calculateTimePosition(props.schedule.startTime)
  const height = calculateEventHeight(props.schedule.startTime, props.schedule.endTime)
  
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
    <div class="text-[10px] opacity-80 flex items-center gap-2 font-medium">
      <span>
        <i class="fa-regular fa-clock"></i> 
        {{ schedule.startTime }} - {{ schedule.endTime }}
      </span>
      <!-- 跨天行程显示返程日期 -->
      <span v-if="schedule.endDate" class="text-[9px] bg-purple-100 px-1.5 py-0.5 rounded">
        <i class="fa-solid fa-arrow-right"></i> {{ schedule.endDate }}
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
