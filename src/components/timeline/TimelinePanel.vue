<script setup lang="ts">
import { ref } from 'vue'
import type { Schedule } from '../../types'
import TimelineView from './TimelineView.vue'

defineProps<{
  schedules: Schedule[]
  currentDate?: string
}>()

const emit = defineEmits<{
  clickEvent: [schedule: Schedule]
  deleteEvent: [id: string]
}>()

const timelineRef = ref<InstanceType<typeof TimelineView> | null>(null)

function scrollToNow() {
  timelineRef.value?.scrollToTime('now')
}

defineExpose({
  scrollToNow,
  scrollToTime: (time: string) => timelineRef.value?.scrollToTime(time)
})
</script>

<template>
  <div class="flex-1 glass-card rounded-2xl shadow-sm overflow-hidden flex flex-col timeline-wrapper">
    <!-- Header -->
    <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-white/90 backdrop-blur shrink-0 z-20">
      <h3 class="font-bold text-gray-700 flex items-center gap-2 text-sm">
        <i class="fa-solid fa-timeline text-indigo-500"></i> 实时概览
      </h3>
      <div class="flex gap-2">
        <button 
          @click="scrollToNow"
          class="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-indigo-50 hover:text-indigo-600 font-bold transition"
        >
          回到现在
        </button>
      </div>
    </div>

    <!-- Timeline -->
    <TimelineView 
      ref="timelineRef"
      :schedules="schedules"
      :current-date="currentDate"
      @click-event="emit('clickEvent', $event)"
      @delete-event="emit('deleteEvent', $event)"
    />
  </div>
</template>
