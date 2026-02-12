<template>
  <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-md border border-blue-200 overflow-hidden">
    <!-- 折叠状态：进度卡片 -->
    <div 
      v-if="isCollapsed"
      class="p-4 cursor-pointer hover:bg-blue-100/50 transition-colors"
      @click="toggleExpand"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-calendar-plus text-blue-600"></i>
          <span class="font-semibold text-gray-800">创建会议</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
            填充中
          </span>
        </div>
        <i class="fa-solid fa-chevron-down text-gray-400"></i>
      </div>
      
      <!-- 进度指示 -->
      <div class="mt-3 flex items-center gap-3">
        <div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div 
            class="bg-blue-500 h-full transition-all duration-300"
            :style="{ width: `${progress.percentage}%` }"
          ></div>
        </div>
        <span class="text-xs text-gray-500 whitespace-nowrap">
          {{ progress.filled }}/{{ progress.total }} 必填项
        </span>
      </div>
      
      <!-- 已填字段预览 -->
      <div v-if="form.title" class="mt-2 text-sm text-gray-600 truncate">
        <i class="fa-solid fa-quote-left text-xs text-gray-400 mr-1"></i>
        {{ form.title }}
      </div>
    </div>

    <!-- 展开状态：完整表单 -->
    <div v-else class="p-4">
      <div class="flex items-center gap-2 mb-4">
        <i class="fa-solid fa-calendar-plus text-blue-600"></i>
        <span class="font-semibold text-gray-800">创建会议</span>
        <span 
          v-if="data.status === 'submitted'" 
          class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700"
        >
          已提交
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
        <!-- 会议主题 -->
        <div>
          <label class="text-xs text-gray-500 block mb-1">会议主题 *</label>
          <input 
            v-model="form.title" 
            type="text" 
            placeholder="请输入会议主题"
            :disabled="isLocked"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
            :class="{ 'bg-gray-100': isLocked }"
          />
          <span v-if="errors.title" class="text-xs text-red-500 mt-1">{{ errors.title }}</span>
        </div>

        <!-- 开始时间 / 结束时间 -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-gray-500 block mb-1">开始时间 *</label>
            <input 
              v-model="form.startTime" 
              type="datetime-local" 
              :disabled="isLocked"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              :class="{ 'bg-gray-100': isLocked }"
            />
            <span v-if="errors.startTime" class="text-xs text-red-500 mt-1">{{ errors.startTime }}</span>
          </div>
          <div>
            <label class="text-xs text-gray-500 block mb-1">结束时间 *</label>
            <input 
              v-model="form.endTime" 
              type="datetime-local" 
              :disabled="isLocked"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              :class="{ 'bg-gray-100': isLocked }"
            />
            <span v-if="errors.endTime" class="text-xs text-red-500 mt-1">{{ errors.endTime }}</span>
          </div>
        </div>

        <!-- 会议地点 / 会议室类型 -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs text-gray-500 block mb-1">会议地点 *</label>
            <input 
              v-model="form.location" 
              type="text" 
              placeholder="请输入会议地点"
              :disabled="isLocked"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              :class="{ 'bg-gray-100': isLocked }"
            />
            <span v-if="errors.location" class="text-xs text-red-500 mt-1">{{ errors.location }}</span>
          </div>
          <div>
            <label class="text-xs text-gray-500 block mb-1">会议室类型 *</label>
            <select 
              v-model="form.roomType" 
              :disabled="isLocked"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              :class="{ 'bg-gray-100': isLocked }"
            >
              <option value="">请选择</option>
              <option value="大型会议室">大型会议室</option>
              <option value="中型会议室">中型会议室</option>
              <option value="小型会议室">小型会议室</option>
              <option value="培训室">培训室</option>
              <option value="视频会议室">视频会议室</option>
              <option value="线上会议">线上会议</option>
            </select>
            <span v-if="errors.roomType" class="text-xs text-red-500 mt-1">{{ errors.roomType }}</span>
          </div>
        </div>

        <!-- 参会人员 -->
        <div>
          <label class="text-xs text-gray-500 block mb-1">参会人员</label>
          <div v-if="!isLocked" class="flex gap-2 mb-2">
            <input 
              v-model="newAttendee" 
              type="text" 
              placeholder="输入姓名，按回车添加"
              class="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
              @keyup.enter="addAttendee"
            />
            <button 
              @click="addAttendee"
              class="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
            >
              添加
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5 min-h-[32px]">
            <span 
              v-for="(attendee, index) in form.attendees" 
              :key="index"
              class="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 border border-blue-300 rounded-full text-xs text-blue-800"
            >
              {{ attendee }}
              <button 
                v-if="!isLocked" 
                @click="removeAttendee(index)" 
                class="text-blue-500 hover:text-red-500 font-bold"
              >
                x
              </button>
            </span>
            <span v-if="form.attendees.length === 0" class="text-xs text-gray-400 italic">暂无参会人员</span>
          </div>
        </div>

        <!-- 备注 -->
        <div>
          <label class="text-xs text-gray-500 block mb-1">备注</label>
          <textarea 
            v-model="form.remarks" 
            placeholder="请输入会议备注..."
            :disabled="isLocked"
            rows="2"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none"
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
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            ]"
          >
            <i class="fa-solid fa-paper-plane mr-1"></i>
            创建会议
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { CreateMeetingData } from '../../types/message'
import { getFormProgress } from '../../services/react/formFields'

const props = defineProps<{
  data: CreateMeetingData
}>()

const emit = defineEmits<{
  submit: [data: CreateMeetingData]
  toggleCollapse: [collapsed: boolean]
}>()

const newAttendee = ref('')

// 内部展开状态（受 props.data.collapsed 控制）
const internalExpanded = ref(!props.data.collapsed)

const form = ref({
  title: props.data.title || '',
  startTime: props.data.startTime || '',
  endTime: props.data.endTime || '',
  location: props.data.location || '',
  roomType: props.data.roomType || '',
  attendees: [...(props.data.attendees || [])],
  remarks: props.data.remarks || ''
})

const errors = reactive<Record<string, string>>({
  title: '',
  startTime: '',
  endTime: '',
  location: '',
  roomType: ''
})

const isLocked = computed(() => props.data.status !== 'draft')

// 是否处于折叠模式（需要有 collapsed 属性）
const canCollapse = computed(() => props.data.collapsed !== undefined)

// 是否处于折叠状态
const isCollapsed = computed(() => canCollapse.value && !internalExpanded.value)

// 计算填充进度
const progress = computed(() => {
  const formData = {
    title: form.value.title,
    startTime: form.value.startTime,
    endTime: form.value.endTime,
    location: form.value.location,
    roomType: form.value.roomType
  }
  return getFormProgress(formData, 'meeting')
})

const isFormValid = computed(() => {
  return (
    form.value.title.trim() &&
    form.value.startTime &&
    form.value.endTime &&
    form.value.location.trim() &&
    form.value.roomType &&
    !Object.values(errors).some(e => e)
  )
})

// 切换展开/折叠
function toggleExpand() {
  internalExpanded.value = !internalExpanded.value
  emit('toggleCollapse', !internalExpanded.value)
}

/**
 * 归一化参会人员列表
 */
function normalizeAttendees(raw: any): string[] {
  if (!raw) return []
  if (typeof raw === 'string') {
    return raw.split(/[,，、;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((item: any) =>
      typeof item === 'string'
        ? item.split(/[,，、;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : [String(item)]
    )
  }
  return []
}

function validateField(fieldName: string) {
  errors[fieldName] = ''
  switch (fieldName) {
    case 'title':
      if (!form.value.title.trim()) errors.title = '请输入会议主题'
      break
    case 'startTime':
      if (!form.value.startTime) errors.startTime = '请选择开始时间'
      break
    case 'endTime':
      if (!form.value.endTime) {
        errors.endTime = '请选择结束时间'
      } else if (form.value.startTime && new Date(form.value.endTime) <= new Date(form.value.startTime)) {
        errors.endTime = '结束时间必须晚于开始时间'
      }
      break
    case 'location':
      if (!form.value.location.trim()) errors.location = '请输入会议地点'
      break
    case 'roomType':
      if (!form.value.roomType) errors.roomType = '请选择会议室类型'
      break
  }
}

function validateAll(): boolean {
  ;['title', 'startTime', 'endTime', 'location', 'roomType'].forEach(validateField)
  return !Object.values(errors).some(e => e)
}

function addAttendee() {
  const trimmed = newAttendee.value.trim()
  if (trimmed && !form.value.attendees.includes(trimmed)) {
    form.value.attendees.push(trimmed)
    newAttendee.value = ''
  }
}

function removeAttendee(index: number) {
  form.value.attendees.splice(index, 1)
}

function handleSubmit() {
  if (!validateAll()) return
  emit('submit', {
    ...form.value,
    attendees: [...form.value.attendees],
    status: 'draft'
  })
}

// 初始化时归一化参会人员
watch(() => props.data, (newData) => {
  if (newData) {
    form.value.title = newData.title || ''
    form.value.startTime = newData.startTime || ''
    form.value.endTime = newData.endTime || ''
    form.value.location = newData.location || ''
    form.value.roomType = newData.roomType || ''
    form.value.attendees = normalizeAttendees(newData.attendees)
    form.value.remarks = newData.remarks || ''
    
    // 当 collapsed 变为 false 时，自动展开（必填字段已完成）
    if (newData.collapsed === false) {
      internalExpanded.value = true
    }
    // 当 missingFields 为空时自动展开
    if (newData.missingFields && newData.missingFields.length === 0) {
      internalExpanded.value = true
    }
  }
}, { immediate: true })
</script>
