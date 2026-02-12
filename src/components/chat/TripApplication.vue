<template>
  <div class="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl shadow-md border border-violet-200 overflow-hidden">
    <!-- 折叠状态：进度卡片 -->
    <div 
      v-if="isCollapsed"
      class="p-4 cursor-pointer hover:bg-violet-100/50 transition-colors"
      @click="toggleExpand"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-file-lines text-violet-600"></i>
          <span class="font-semibold text-gray-800">出差申请</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-600">
            填充中
          </span>
        </div>
        <i class="fa-solid fa-chevron-down text-gray-400"></i>
      </div>
      
      <!-- 进度指示 -->
      <div class="mt-3 flex items-center gap-3">
        <div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div 
            class="bg-violet-500 h-full transition-all duration-300"
            :style="{ width: `${progress.percentage}%` }"
          ></div>
        </div>
        <span class="text-xs text-gray-500 whitespace-nowrap">
          {{ progress.filled }}/{{ progress.total }} 必填项
        </span>
      </div>
      
      <!-- 已填字段预览 -->
      <div v-if="form.from && form.to" class="mt-2 text-sm text-gray-600 truncate">
        <i class="fa-solid fa-route text-xs text-gray-400 mr-1"></i>
        {{ form.from }} → {{ form.to }}
      </div>
    </div>

    <!-- 展开状态：完整表单 -->
    <div v-else class="p-4">
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
        <!-- 折叠按钮（仅在填充模式下显示） -->
        <button 
          v-if="canCollapse"
          @click="toggleExpand"
          class="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
        >
          <i class="fa-solid fa-chevron-up"></i>
        </button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TripApplicationData } from '../../types'
import { getFormProgress } from '../../services/react/formFields'

const props = defineProps<{
  data: TripApplicationData
}>()

const emit = defineEmits<{
  submit: [data: TripApplicationData]
  updateField: [field: string, value: string]
  toggleCollapse: [collapsed: boolean]
}>()

const transportOptions = [
  { value: 'flight', label: '飞机', icon: 'fa-solid fa-plane' },
  { value: 'train', label: '火车', icon: 'fa-solid fa-train' },
  { value: 'car', label: '汽车', icon: 'fa-solid fa-car' },
  { value: 'ship', label: '轮船', icon: 'fa-solid fa-ship' },
  { value: 'other', label: '其他', icon: 'fa-solid fa-ellipsis' }
]

// 内部展开状态（受 props.data.collapsed 控制）
const internalExpanded = ref(!props.data.collapsed)

const form = ref({
  startDate: props.data.startDate || '',
  startTime: props.data.startTime || '',  // 不设默认值，与必填字段一致
  endDate: props.data.endDate || '',
  endTime: props.data.endTime || '',      // 不设默认值，与必填字段一致
  from: props.data.from || '',
  to: props.data.to || '',
  transport: props.data.transport || '',
  reason: props.data.reason || ''
})

const isLocked = computed(() => props.data.status !== 'draft')

// 是否处于折叠模式（需要有 collapsed 属性）
const canCollapse = computed(() => props.data.collapsed !== undefined)

// 是否处于折叠状态
const isCollapsed = computed(() => canCollapse.value && !internalExpanded.value)

// 计算填充进度
const progress = computed(() => {
  const formData = {
    startDate: form.value.startDate,
    startTime: form.value.startTime,
    endDate: form.value.endDate,
    endTime: form.value.endTime,
    from: form.value.from,
    to: form.value.to,
    transport: form.value.transport,
    reason: form.value.reason
  }
  return getFormProgress(formData, 'trip')
})

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

// 切换展开/折叠
function toggleExpand() {
  internalExpanded.value = !internalExpanded.value
  emit('toggleCollapse', !internalExpanded.value)
}

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
    startTime: props.data.startTime || '',
    endDate: props.data.endDate || '',
    endTime: props.data.endTime || '',
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
      startTime: newData.startTime || '',
      endDate: newData.endDate,
      endTime: newData.endTime || '',
      from: newData.from,
      to: newData.to,
      transport: newData.transport,
      reason: newData.reason
    }
  } else {
    // 更新表单数据（用于对话式填充）
    form.value.startDate = newData.startDate || form.value.startDate
    form.value.startTime = newData.startTime || form.value.startTime
    form.value.endDate = newData.endDate || form.value.endDate
    form.value.endTime = newData.endTime || form.value.endTime
    form.value.from = newData.from || form.value.from
    form.value.to = newData.to || form.value.to
    form.value.transport = newData.transport || form.value.transport
    form.value.reason = newData.reason || form.value.reason
  }
  
  // 当 collapsed 变为 false 时，自动展开（必填字段已完成）
  if (newData.collapsed === false) {
    internalExpanded.value = true
  }
  // 当 missingFields 为空时自动展开
  if (newData.missingFields && newData.missingFields.length === 0) {
    internalExpanded.value = true
  }
}, { deep: true })
</script>
