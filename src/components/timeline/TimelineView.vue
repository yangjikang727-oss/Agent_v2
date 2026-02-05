<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Schedule } from '../../types'
import { getCurrentTimePosition } from '../../utils/dateUtils'
import CurrentTimeLine from './CurrentTimeLine.vue'
import EventCard from './EventCard.vue'

defineProps<{
  schedules: Schedule[]
}>()

const emit = defineEmits<{
  clickEvent: [schedule: Schedule]
  deleteEvent: [id: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
const currentTimeTop = ref(0)
let timer: number | null = null

// 时间标签 (8:00 - 21:00)
const timeLabels = Array.from({ length: 14 }, (_, i) => {
  const hour = 8 + i
  return `${String(hour).padStart(2, '0')}:00`
})

// 更新当前时间线
function updateCurrentTimeLine() {
  currentTimeTop.value = getCurrentTimePosition()
}

// 滚动到指定位置
function scrollToTime(time: string | 'now') {
  if (!containerRef.value) return
  
  let targetTop: number
  if (time === 'now') {
    targetTop = Math.max(0, currentTimeTop.value - 150)
  } else {
    const hour = parseInt(time.split(':')[0])
    targetTop = (hour - 7) * 80 - 50
  }

  containerRef.value.scrollTo({
    top: targetTop,
    behavior: 'smooth'
  })
}

onMounted(() => {
  updateCurrentTimeLine()
  timer = window.setInterval(updateCurrentTimeLine, 60000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

defineExpose({
  scrollToTime,
  containerRef
})
</script>

<template>
  <div ref="containerRef" class="timeline-container" id="timeline-container">
    <!-- Time Labels -->
    <div v-for="(label, idx) in timeLabels" :key="idx" class="time-label flex items-start">
      <div class="time-label-text">{{ label }}</div>
    </div>

    <!-- Current Time Line -->
    <CurrentTimeLine :top="currentTimeTop" />

    <!-- Events -->
    <TransitionGroup name="fade">
      <EventCard 
        v-for="schedule in schedules"
        :key="schedule.id"
        :schedule="schedule"
        @click="emit('clickEvent', $event)"
        @delete="emit('deleteEvent', $event)"
      />
    </TransitionGroup>
  </div>
</template>
