<script setup lang="ts">
import { computed } from 'vue'
import { getWeekDay } from '../../utils/dateUtils'
import StatsCard from './StatsCard.vue'

const props = defineProps<{
  currentDate: string
  totalSchedules: number
  pendingTasks: number
}>()

const emit = defineEmits<{
  'update:currentDate': [date: string]
  changeDate: [delta: number]
  resetToToday: []
}>()

const weekDay = computed(() => getWeekDay(props.currentDate))

function handleDateChange(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:currentDate', target.value)
}
</script>

<template>
  <div class="p-6 pb-2 shrink-0 grid grid-cols-[1.5fr_1fr_1fr] gap-4">
    <!-- Date Picker -->
    <div class="glass-card rounded-2xl p-4 flex flex-col justify-center items-start shadow-sm border-l-4 border-l-blue-500">
      <div class="flex items-center justify-between w-full mb-1">
        <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">视图日期</div>
        <button 
          @click="emit('resetToToday')"
          class="text-[10px] text-blue-500 hover:text-blue-600 font-bold px-2 py-0.5 rounded hover:bg-blue-50 transition"
          title="回到今天"
        >
          <i class="fa-solid fa-calendar-day mr-1"></i>回到今天
        </button>
      </div>
      <div class="flex items-center w-full justify-between">
        <button 
          @click="emit('changeDate', -1)"
          class="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-600 transition"
        >
          <i class="fa-solid fa-chevron-left text-xs"></i>
        </button>
        <input 
          type="date" 
          :value="currentDate"
          @change="handleDateChange"
          class="bg-transparent text-lg font-bold text-gray-800 outline-none cursor-pointer border-b border-transparent hover:border-blue-500 transition w-auto text-center font-mono"
        >
        <button 
          @click="emit('changeDate', 1)"
          class="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-600 transition"
        >
          <i class="fa-solid fa-chevron-right text-xs"></i>
        </button>
      </div>
      <div class="text-xs text-blue-500 mt-1 font-bold w-full text-center bg-blue-50 rounded py-0.5">
        {{ weekDay }}
      </div>
    </div>

    <!-- Total Schedules -->
    <StatsCard 
      icon="fa-calendar-check"
      icon-bg="bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200"
      :value="totalSchedules"
      label="今日日程"
    />

    <!-- Pending Tasks -->
    <StatsCard 
      icon="fa-bolt"
      icon-bg="bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-200"
      :value="pendingTasks"
      label="待调用技能"
    />
  </div>
</template>
