<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Schedule, TransportMode } from '../../types'
import { renderMarkdown } from '../../utils/markdownUtils'
import BaseModal from '../common/BaseModal.vue'

const props = defineProps<{
  show: boolean
  schedule: Schedule | null
  isGeneratingAgenda: boolean
  conflictSchedule?: Schedule | null
}>()

const emit = defineEmits<{
  close: []
  save: [schedule: Schedule]
  generateAgenda: [schedule: Schedule]
  checkConflict: [schedule: Schedule]
}>()

// 本地编辑副本
const localSchedule = ref<Schedule | null>(null)

// 确保 meta 存在
function ensureMeta(s: Schedule) {
  if (!s.meta) s.meta = {}
  return s.meta
}

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

// datetime-local 输入框用的值
const startDateTimeLocal = computed({
  get: () => {
    if (!localSchedule.value) return ''
    return `${localSchedule.value.date}T${localSchedule.value.startTime}`
  },
  set: (val: string) => {
    if (localSchedule.value && val) {
      const parts = val.split('T')
      if (parts.length === 2 && parts[0] && parts[1]) {
        localSchedule.value.date = parts[0]
        localSchedule.value.startTime = parts[1]
      }
    }
  }
})

const endDateTimeLocal = computed({
  get: () => {
    if (!localSchedule.value) return ''
    const endDateStr = localSchedule.value.type === 'trip' && localSchedule.value.endDate
      ? localSchedule.value.endDate
      : localSchedule.value.date
    return `${endDateStr}T${localSchedule.value.endTime}`
  },
  set: (val: string) => {
    if (localSchedule.value && val) {
      const parts = val.split('T')
      if (parts.length === 2 && parts[1]) {
        if (localSchedule.value.type === 'trip') {
          localSchedule.value.endDate = parts[0]
        }
        localSchedule.value.endTime = parts[1]
      }
    }
  }
})

// 类型标签
const typeLabel = computed(() => {
  if (!localSchedule.value) return ''
  switch (localSchedule.value.type) {
    case 'meeting': return '会议'
    case 'trip': return '出差'
    default: return '日程'
  }
})
const typeClass = computed(() => {
  if (!localSchedule.value) return ''
  switch (localSchedule.value.type) {
    case 'meeting': return 'bg-blue-100 text-blue-700'
    case 'trip': return 'bg-violet-100 text-violet-700'
    default: return 'bg-gray-100 text-gray-700'
  }
})

// 出行方式选项
const transportOptions: { value: TransportMode; label: string; icon: string }[] = [
  { value: 'flight', label: '飞机', icon: 'fa-plane' },
  { value: 'train', label: '火车', icon: 'fa-train' },
  { value: 'car', label: '汽车', icon: 'fa-car' },
  { value: 'ship', label: '轮船', icon: 'fa-ship' },
  { value: 'other', label: '其他', icon: 'fa-ellipsis' }
]

// 资源信息
const paidResources = computed(() => localSchedule.value?.resources || [])
const hasPaidOrders = computed(() => {
  const orders = localSchedule.value?.meta?.pendingOrders
  return orders && orders.some(o => o.status === 'paid')
})

watch(() => props.schedule, (newVal) => {
  if (newVal) {
    localSchedule.value = JSON.parse(JSON.stringify(newVal))
  }
}, { immediate: true })

function handleSave() {
  if (localSchedule.value) {
    emit('checkConflict', localSchedule.value)
  }
}
</script>

<template>
  <BaseModal :show="show" :title="`${typeLabel}详情`" @close="emit('close')">
    <div class="space-y-4" v-if="localSchedule">
      <!-- 类型标签 + 事项内容 -->
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-bold px-2 py-0.5 rounded-full" :class="typeClass">
            {{ typeLabel }}
          </span>
          <span v-if="localSchedule.type === 'trip' && localSchedule.meta?.tripApplied" 
            class="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            <i class="fa-solid fa-check mr-0.5"></i>出差已审批
          </span>
        </div>
        <label class="text-xs text-gray-500 font-bold block mb-1">
          {{ localSchedule.type === 'meeting' ? '会议主题' : '事项内容' }}
        </label>
        <input 
          v-model="localSchedule.content"
          class="w-full text-lg font-bold border-b border-gray-200 outline-none focus:border-blue-500 bg-transparent transition"
        >
      </div>

      <!-- 时间 -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">开始时间</label>
          <input type="datetime-local" v-model="startDateTimeLocal"
            class="w-full text-sm border rounded px-2 py-1 bg-gray-50">
        </div>
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">结束时间</label>
          <input type="datetime-local" v-model="endDateTimeLocal"
            class="w-full text-sm border rounded px-2 py-1 bg-gray-50">
        </div>
      </div>

      <!-- ==================== 会议专属 ==================== -->
      <template v-if="localSchedule.type === 'meeting'">
        <!-- 会议地点 -->
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">
            <i class="fa-solid fa-location-dot mr-1"></i>会议地点
          </label>
          <input v-model="localSchedule.location" placeholder="请输入会议地点"
            class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition">
        </div>

        <!-- 会议室类型 -->
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">
            <i class="fa-solid fa-door-open mr-1"></i>会议室类型
          </label>
          <select v-model="ensureMeta(localSchedule).roomType"
            class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition">
            <option value="">未指定</option>
            <option value="大型会议室">大型会议室</option>
            <option value="中型会议室">中型会议室</option>
            <option value="小型会议室">小型会议室</option>
            <option value="培训室">培训室</option>
            <option value="视频会议室">视频会议室</option>
            <option value="线上会议">线上会议</option>
          </select>
        </div>

        <!-- 参会人 -->
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">
            <i class="fa-solid fa-users mr-1"></i>参会人
          </label>
          <input v-model="attendeesInput"
            placeholder="多人请用逗号分隔，如：张三, 李四"
            class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition">
          <p class="text-[10px] text-gray-400 mt-1">支持逗号、顿号、空格分隔多人</p>
        </div>

        <!-- 智能议程 -->
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1 flex items-center justify-between">
            <span><i class="fa-solid fa-list-check mr-1"></i>会议议程/备注</span>
            <button 
              v-if="!localSchedule.agenda && !isGeneratingAgenda"
              @click="emit('generateAgenda', localSchedule)"
              class="ai-sparkle-btn"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i> 生成议程
            </button>
            <span v-if="isGeneratingAgenda" class="text-indigo-500 text-xs flex items-center gap-1">
              <i class="fa-solid fa-spinner ai-loading"></i> AI 思考中...
            </span>
          </label>
          <div v-if="localSchedule.agenda" class="ai-agenda-box" v-html="renderMarkdown(localSchedule.agenda)"></div>
          <textarea v-else v-model="localSchedule.agenda" rows="2" placeholder="输入议程或备注..."
            class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition resize-none"></textarea>
        </div>
      </template>

      <!-- ==================== 出差专属 ==================== -->
      <template v-if="localSchedule.type === 'trip'">
        <!-- 出发地 / 目的地 -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-xs text-gray-500 font-bold block mb-1">
              <i class="fa-solid fa-plane-departure mr-1"></i>出发地
            </label>
            <input v-model="ensureMeta(localSchedule).from" placeholder="如：珠海"
              class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-bold block mb-1">
              <i class="fa-solid fa-plane-arrival mr-1"></i>目的地
            </label>
            <input v-model="ensureMeta(localSchedule).to" placeholder="如：北京"
              class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition">
          </div>
        </div>

        <!-- 出行方式 -->
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">
            <i class="fa-solid fa-route mr-1"></i>出行方式
          </label>
          <div class="flex gap-2">
            <button 
              v-for="opt in transportOptions" :key="opt.value"
              @click="ensureMeta(localSchedule).transport = opt.value"
              class="flex-1 py-1.5 px-2 rounded-lg text-xs border transition-all cursor-pointer"
              :class="localSchedule.meta?.transport === opt.value 
                ? 'bg-violet-100 border-violet-400 text-violet-700 font-bold' 
                : 'bg-white border-gray-200 text-gray-500 hover:border-violet-300'"
            >
              <i :class="['fa-solid', opt.icon]" class="mr-1"></i>{{ opt.label }}
            </button>
          </div>
        </div>

        <!-- 已预订资源 -->
        <div v-if="paidResources.length > 0">
          <label class="text-xs text-gray-500 font-bold block mb-1">
            <i class="fa-solid fa-suitcase mr-1"></i>已预订资源
          </label>
          <div class="flex flex-wrap gap-2">
            <div v-for="res in paidResources" :key="res.id"
              class="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-xs text-green-700 font-medium">
              <i :class="['fa-solid', res.icon]"></i>
              <span>{{ res.name }}</span>
            </div>
          </div>
        </div>

        <!-- 待支付订单概览 -->
        <div v-if="hasPaidOrders">
          <label class="text-xs text-gray-500 font-bold block mb-1">
            <i class="fa-solid fa-credit-card mr-1"></i>订单状态
          </label>
          <div class="flex flex-wrap gap-2">
            <div v-for="order in localSchedule.meta?.pendingOrders" :key="order.id"
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              :class="order.status === 'paid' 
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-yellow-50 border border-yellow-200 text-yellow-700'">
              <i :class="['fa-solid', order.type === 'flight' ? 'fa-plane' : 'fa-hotel']"></i>
              <span>{{ order.title }}</span>
              <span class="ml-1">¥{{ order.price }}</span>
              <span v-if="order.status === 'paid'" class="text-green-500"><i class="fa-solid fa-check"></i></span>
            </div>
          </div>
        </div>
      </template>

      <!-- ==================== 普通日程 ==================== -->
      <template v-if="localSchedule.type === 'general'">
        <div>
          <label class="text-xs text-gray-500 font-bold block mb-1">
            <i class="fa-solid fa-location-dot mr-1"></i>地点
          </label>
          <input v-model="localSchedule.location" placeholder="请输入地点（可选）"
            class="w-full text-sm border rounded px-2 py-1.5 bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition">
        </div>
      </template>
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
