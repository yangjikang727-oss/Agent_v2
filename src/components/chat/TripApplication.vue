<template>
  <div class="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 shadow-md border border-violet-200">
    <div class="flex items-center gap-2 mb-4">
      <i class="fa-solid fa-file-lines text-violet-600"></i>
      <span class="font-semibold text-gray-800">出差申请</span>
      <span 
        v-if="data.status !== 'draft'" 
        class="text-xs px-2 py-0.5 rounded-full"
        :class="statusClass"
      >
        {{ statusText }}
      </span>
    </div>

    <div class="space-y-3">
      <!-- 出差开始时间 -->
      <div>
        <label class="text-xs text-gray-500 block mb-1">开始时间</label>
        <div class="grid grid-cols-2 gap-2">
          <input 
            v-model="form.startDate" 
            type="date" 
            :disabled="isLocked"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            :class="{ 'bg-gray-100': isLocked }"
          />
          <input 
            v-model="form.startTime" 
            type="time" 
            :disabled="isLocked"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            :class="{ 'bg-gray-100': isLocked }"
          />
        </div>
      </div>

      <!-- 出差结束时间 -->
      <div>
        <label class="text-xs text-gray-500 block mb-1">结束时间</label>
        <div class="grid grid-cols-2 gap-2">
          <input 
            v-model="form.endDate" 
            type="date" 
            :disabled="isLocked"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            :class="{ 'bg-gray-100': isLocked }"
          />
          <input 
            v-model="form.endTime" 
            type="time" 
            :disabled="isLocked"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            :class="{ 'bg-gray-100': isLocked }"
          />
        </div>
      </div>

      <!-- 出差地点 -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-gray-500 block mb-1">出发地</label>
          <input 
            v-model="form.from" 
            type="text" 
            placeholder="如：珠海"
            :disabled="isLocked"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            :class="{ 'bg-gray-100': isLocked }"
          />
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">目的地</label>
          <input 
            v-model="form.to" 
            type="text" 
            placeholder="如：北京"
            :disabled="isLocked"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            :class="{ 'bg-gray-100': isLocked }"
          />
        </div>
      </div>

      <!-- 出行方式 -->
      <div>
        <label class="text-xs text-gray-500 block mb-1">出行方式</label>
        <div class="flex gap-2">
          <button 
            v-for="opt in transportOptions" 
            :key="opt.value"
            @click="!isLocked && (form.transport = opt.value)"
            class="flex-1 py-2 px-3 rounded-lg text-sm border transition-all"
            :class="[
              form.transport === opt.value 
                ? 'bg-violet-100 border-violet-400 text-violet-700' 
                : 'bg-white border-gray-200 text-gray-600 hover:border-violet-300',
              isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            ]"
          >
            <i :class="opt.icon" class="mr-1"></i>
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 出差理由 -->
      <div>
        <label class="text-xs text-gray-500 block mb-1">出差理由</label>
        <textarea 
          v-model="form.reason" 
          placeholder="请简述出差事由..."
          :disabled="isLocked"
          rows="2"
          class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none"
          :class="{ 'bg-gray-100': isLocked }"
        ></textarea>
      </div>

      <!-- 提交按钮 -->
      <div v-if="!isLocked" class="flex gap-2 pt-2">
        <button
          @click="handleSubmit"
          :disabled="!isFormValid"
          class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
          :class="[
            isFormValid 
              ? 'bg-violet-600 hover:bg-violet-700 text-white' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          ]"
        >
          <i class="fa-solid fa-paper-plane mr-1"></i>
          提交申请
        </button>
      </div>

      <!-- 已通过状态 -->
      <div v-if="data.status === 'approved'" class="text-center py-2 text-green-600 text-sm">
        <i class="fa-solid fa-circle-check mr-1"></i>
        申请已通过，正在为您推荐航班和酒店...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TripApplicationData } from '../../types'

const props = defineProps<{
  data: TripApplicationData
}>()

const emit = defineEmits<{
  submit: [data: TripApplicationData]
  updateField: [field: string, value: string]
}>()

const transportOptions = [
  { value: 'flight', label: '飞机', icon: 'fa-solid fa-plane' },
  { value: 'train', label: '火车', icon: 'fa-solid fa-train' },
  { value: 'car', label: '汽车', icon: 'fa-solid fa-car' },
  { value: 'ship', label: '轮船', icon: 'fa-solid fa-ship' },
  { value: 'other', label: '其他', icon: 'fa-solid fa-ellipsis' }
]

const form = ref({
  startDate: props.data.startDate || '',
  startTime: props.data.startTime || '09:00',
  endDate: props.data.endDate || '',
  endTime: props.data.endTime || '18:00',
  from: props.data.from || '',
  to: props.data.to || '',
  transport: props.data.transport || '',
  reason: props.data.reason || ''
})

const isLocked = computed(() => props.data.status !== 'draft')

const isFormValid = computed(() => {
  return form.value.startDate && 
         form.value.startTime &&
         form.value.endDate && 
         form.value.endTime &&
         form.value.from && 
         form.value.to && 
         form.value.transport && 
         form.value.reason.trim()
})

const statusClass = computed(() => {
  switch (props.data.status) {
    case 'submitted': return 'bg-yellow-100 text-yellow-700'
    case 'approved': return 'bg-green-100 text-green-700'
    case 'rejected': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-700'
  }
})

const statusText = computed(() => {
  switch (props.data.status) {
    case 'submitted': return '审批中'
    case 'approved': return '已通过'
    case 'rejected': return '已拒绝'
    default: return '草稿'
  }
})

function handleSubmit() {
  if (!isFormValid.value) return
  
  emit('submit', {
    ...props.data,
    ...form.value,
    status: 'submitted',
    submittedAt: new Date().toISOString()
  })
}

// 同步初始数据
onMounted(() => {
  form.value = {
    startDate: props.data.startDate || '',
    startTime: props.data.startTime || '09:00',
    endDate: props.data.endDate || '',
    endTime: props.data.endTime || '18:00',
    from: props.data.from || '',
    to: props.data.to || '',
    transport: props.data.transport || '',
    reason: props.data.reason || ''
  }
})

// 监听 props 变化
watch(() => props.data, (newData) => {
  if (newData.status !== 'draft') {
    form.value = {
      startDate: newData.startDate,
      startTime: newData.startTime || '09:00',
      endDate: newData.endDate,
      endTime: newData.endTime || '18:00',
      from: newData.from,
      to: newData.to,
      transport: newData.transport,
      reason: newData.reason
    }
  }
}, { deep: true })
</script>
