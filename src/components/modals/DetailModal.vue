<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Schedule } from '../../types'
import { renderMarkdown } from '../../utils/markdownUtils'
import BaseModal from '../common/BaseModal.vue'

const props = defineProps<{
  show: boolean
  schedule: Schedule | null
  isGeneratingAgenda: boolean
  conflictSchedule?: Schedule | null  // 冲突的日程
}>()

const emit = defineEmits<{
  close: []
  save: [schedule: Schedule]
  generateAgenda: [schedule: Schedule]
  checkConflict: [schedule: Schedule]  // 检测冲突
}>()

// 本地编辑副本
const localSchedule = ref<Schedule | null>(null)

// 参会人输入值（逗号分隔）
const attendeesInput = computed({
  get: () => localSchedule.value?.attendees.join(', ') || '',
  set: (val: string) => {
    if (localSchedule.value) {
      localSchedule.value.attendees = val
        .split(/[,，、\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
    }
  }
})

watch(() => props.schedule, (newVal) => {
  if (newVal) {
    localSchedule.value = { ...newVal }
  }
}, { immediate: true })

function handleSave() {
  if (localSchedule.value) {
    // 发射检测冲突事件，由父组件处理
    emit('checkConflict', localSchedule.value)
  }
}
</script>

<template>
  <BaseModal :show="show" title="日程详情" @close="emit('close')">
    <div class="space-y-4" v-if="localSchedule">
      <!-- Content -->
      <div>
        <label class="text-xs text-gray-500 font-bold block mb-1">事项内容</label>
        <input 
          v-model="localSchedule.content"
          class="w-full text-lg font-bold border-b border-gray-200 outline-none focus:border-blue-500 bg-transparent transition"
        >
      </div>

      <!-- Time -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">开始时间</label>
          <input 
            type="time" 
            v-model="localSchedule.startTime"
            class="w-full text-sm border rounded px-2 py-1 bg-gray-50"
          >
        </div>
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">结束时间</label>
          <input 
            type="time" 
            v-model="localSchedule.endTime"
            class="w-full text-sm border rounded px-2 py-1 bg-gray-50"
          >
        </div>
      </div>
      
      <!-- 跨天行程：返程日期 -->
      <div v-if="localSchedule.type === 'trip'">
        <label class="text-xs text-gray-500 font-bold block mb-1">返程日期（可选）</label>
        <input 
          type="date" 
          v-model="localSchedule.endDate"
          class="w-full text-sm border rounded px-2 py-1 bg-gray-50"
        >
      </div>

      <!-- Location -->
      <div>
        <label class="text-xs text-gray-500 font-bold block mb-1">
          <i class="fa-solid fa-location-dot mr-1"></i>地点
        </label>
        <input 
          v-model="localSchedule.location"
          placeholder="请输入地点（可选）"
          class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition"
        >
      </div>

      <!-- Attendees -->
      <div v-if="localSchedule.type !== 'trip'">
        <label class="text-xs text-gray-500 font-bold block mb-1">
          <i class="fa-solid fa-users mr-1"></i>参会人
        </label>
        <input 
          v-model="attendeesInput"
          placeholder="多人请用逗号分隔，如：张三, 李四"
          class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition"
        >
        <p class="text-[10px] text-gray-400 mt-1">支持逗号、顿号、空格分隔多人</p>
      </div>

      <!-- AI Agenda -->
      <div v-if="localSchedule.type?.includes('meeting')">
        <label class="text-xs text-gray-500 font-bold block mb-1 flex items-center justify-between">
          <span>智能议程</span>
          <button 
            v-if="!localSchedule.agenda && !isGeneratingAgenda"
            @click="emit('generateAgenda', localSchedule)"
            class="ai-sparkle-btn"
          >
            <i class="fa-solid fa-wand-magic-sparkles"></i> 生成议程
          </button>
          <span 
            v-if="isGeneratingAgenda"
            class="text-indigo-500 text-xs flex items-center gap-1"
          >
            <i class="fa-solid fa-spinner ai-loading"></i> Gemini 思考中...
          </span>
        </label>
        <div 
          v-if="localSchedule.agenda"
          class="ai-agenda-box"
          v-html="renderMarkdown(localSchedule.agenda)"
        ></div>
      </div>
    </div>

    <!-- 冲突警告 -->
    <div v-if="conflictSchedule" class="mt-4 bg-orange-50 border-l-4 border-orange-400 p-3 rounded">
      <div class="font-bold text-orange-600 text-xs mb-1">
        <i class="fa-solid fa-triangle-exclamation mr-1"></i>时间冲突检测
      </div>
      <div class="text-sm text-gray-700">
        与日程 <b>「{{ conflictSchedule.content }}」</b> 
        ({{ conflictSchedule.startTime }} - {{ conflictSchedule.endTime }}) 存在时间冲突
      </div>
      <div class="text-xs text-gray-500 mt-1">点击保存将确认修改，系统会引导您调整冲突日程</div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button 
          v-if="!conflictSchedule"
          @click="handleSave"
          class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700"
        >
          保存修改
        </button>
        <button 
          v-else
          @click="emit('save', localSchedule!)"
          class="bg-orange-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-orange-600"
        >
          <i class="fa-solid fa-check mr-1"></i>确认保存并调整冲突日程
        </button>
      </div>
    </template>
  </BaseModal>
</template>
