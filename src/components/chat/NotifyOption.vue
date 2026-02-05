<template>
  <div class="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 shadow-md border border-emerald-200">
    <div class="flex items-center gap-2 mb-3">
      <i class="fa-solid fa-bell text-emerald-600"></i>
      <span class="font-semibold text-gray-800">通知参会人</span>
    </div>

    <div class="text-sm text-gray-600 mb-3">
      <div class="mb-1">
        <i class="fa-solid fa-calendar-check text-emerald-500 mr-1"></i>
        {{ data.scheduleContent }}
      </div>
      <div class="text-xs text-gray-500">
        <i class="fa-regular fa-clock mr-1"></i>{{ data.meetingTime }}
        <span class="mx-2">·</span>
        <i class="fa-solid fa-users mr-1"></i>{{ data.attendees.length }} 人
      </div>
    </div>

    <div v-if="!data.confirmed" class="space-y-2">
      <div class="text-xs text-gray-500 mb-2">请选择通知时间：</div>
      <div class="flex gap-2">
        <button
          @click="selectOption('now')"
          class="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border"
          :class="[
            data.selected === 'now'
              ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
              : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
          ]"
        >
          <i class="fa-solid fa-paper-plane mr-1"></i>
          现在通知
        </button>
        <button
          @click="selectOption('before_1h')"
          class="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border"
          :class="[
            data.selected === 'before_1h'
              ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
              : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
          ]"
        >
          <i class="fa-regular fa-clock mr-1"></i>
          开会前1小时
        </button>
      </div>
      <button
        @click="skipNotify"
        class="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        暂不通知
      </button>
    </div>

    <div v-else class="text-center py-2 text-emerald-600 text-sm">
      <i class="fa-solid fa-circle-check mr-1"></i>
      {{ confirmedText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NotifyOptionData } from '../../types'

const props = defineProps<{
  data: NotifyOptionData
}>()

const emit = defineEmits<{
  select: [option: 'now' | 'before_1h', scheduleId: string]
  skip: [scheduleId: string]
}>()

const confirmedText = computed(() => {
  if (props.data.selected === 'now') {
    return '已发送会议通知'
  } else if (props.data.selected === 'before_1h') {
    return '将在开会前1小时自动通知'
  }
  return '已跳过通知'
})

function selectOption(option: 'now' | 'before_1h') {
  emit('select', option, props.data.scheduleId)
}

function skipNotify() {
  emit('skip', props.data.scheduleId)
}
</script>
