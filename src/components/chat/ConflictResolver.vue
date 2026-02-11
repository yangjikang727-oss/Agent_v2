<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ConflictResolutionData } from '../../types'

const props = defineProps<{
  data: ConflictResolutionData
}>()

const emit = defineEmits<{
  selectSlot: [slotIndex: number, data: ConflictResolutionData]
  acceptNearest: [data: ConflictResolutionData]
  showMoreSlots: [data: ConflictResolutionData, msgId: number]
  cancelConflict: [data: ConflictResolutionData, msgId: number]
  selectCustomDate: [date: string, data: ConflictResolutionData, msgId: number]
}>()

// ── 日期选择面板 ──
const showDatePanel = ref(false)
const customDate = ref('')

// 格式化日期显示
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayStr = today.toISOString().split('T')[0]
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  if (dateStr === todayStr) return '今天'
  if (dateStr === tomorrowStr) return '明天'

  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${month}月${day}日 ${weekDays[date.getDay()]}`
}

// 获取明天的日期字符串
const tomorrowStr = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0] || ''
})

// 日期选择器的最小值（明天）
const minDate = computed(() => tomorrowStr.value)

// ── 状态计算 ──
const isRecommendPhase = computed(() => {
  return props.data.nearestSlot && props.data.userAction === 'pending'
})

const isShowMorePhase = computed(() => {
  return props.data.userAction === 'show_more'
})

const isDirectSlotPhase = computed(() => {
  return !props.data.nearestSlot && props.data.userAction === 'pending'
})

const isDone = computed(() => {
  return props.data.userAction === 'accepted' || props.data.userAction === 'cancelled' || props.data.selectedIndex !== null
})

// ── 操作 ──
function handleAcceptNearest() {
  if (isDone.value) return
  emit('acceptNearest', props.data)
}

function handleShowMore() {
  if (isDone.value) return
  emit('showMoreSlots', props.data, 0)
}

function handleCancel() {
  if (isDone.value) return
  emit('cancelConflict', props.data, 0)
}

function handleSelectSlot(index: number) {
  if (isDone.value) return
  emit('selectSlot', index, props.data)
}

function toggleDatePanel() {
  if (isDone.value) return
  showDatePanel.value = !showDatePanel.value
}

function handlePickTomorrow() {
  if (isDone.value) return
  emit('selectCustomDate', tomorrowStr.value, props.data, 0)
}

function handleDateConfirm() {
  if (isDone.value || !customDate.value) return
  emit('selectCustomDate', customDate.value, props.data, 0)
}
</script>

<template>
  <div class="mt-3 space-y-3">
    <!-- 冲突提示 -->
    <div class="bg-orange-50 border-l-4 border-orange-400 p-3 rounded">
      <div class="font-bold text-orange-600 text-xs mb-1 flex items-center gap-1">
        <i class="fa-solid fa-triangle-exclamation"></i>
        时间冲突
      </div>
      <div class="text-sm text-gray-700">
        与日程「<b>{{ data.conflictInfo.content }}</b>」
        ({{ data.conflictInfo.startTime }} - {{ data.conflictInfo.endTime }}) 存在时间冲突
      </div>
    </div>

    <!-- ========== 推荐确认阶段 ========== -->
    <template v-if="isRecommendPhase && data.nearestSlot">
      <div class="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
        <div class="font-bold text-blue-600 text-xs mb-1 flex items-center gap-1">
          <i class="fa-solid fa-lightbulb"></i>
          推荐时段
        </div>
        <div class="text-sm text-gray-700">
          建议调整至：<b>{{ data.nearestSlot.startTime }} - {{ data.nearestSlot.endTime }}</b>
          <span v-if="data.isNextDay" class="ml-1 text-gray-500">({{ formatDate(data.nearestSlot.date) }})</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          @click="handleAcceptNearest"
          class="px-4 py-2 rounded-lg text-xs font-medium transition-all border bg-indigo-500 text-white border-indigo-500 hover:bg-indigo-600 shadow-sm cursor-pointer"
        >
          <i class="fa-solid fa-check mr-1"></i> 同意调整
        </button>
        <button
          @click="handleShowMore"
          class="px-4 py-2 rounded-lg text-xs font-medium transition-all border bg-white text-gray-600 border-gray-300 hover:bg-gray-50 cursor-pointer"
        >
          <i class="fa-solid fa-clock-rotate-left mr-1"></i> 修改时间
        </button>
        <button
          v-if="!data.isNextDay"
          @click="toggleDatePanel"
          :class="[
            'px-4 py-2 rounded-lg text-xs font-medium transition-all border cursor-pointer',
            showDatePanel
              ? 'bg-blue-100 text-blue-700 border-blue-400'
              : 'bg-white text-blue-500 border-blue-200 hover:bg-blue-50'
          ]"
        >
          <i class="fa-solid fa-calendar-days mr-1"></i> 换个日期
        </button>
        <button
          @click="handleCancel"
          class="px-4 py-2 rounded-lg text-xs font-medium transition-all border bg-white text-red-500 border-red-200 hover:bg-red-50 cursor-pointer"
        >
          <i class="fa-solid fa-xmark mr-1"></i> 取消创建
        </button>
      </div>

      <!-- 日期选择面板（推荐阶段） -->
      <div v-if="showDatePanel && !data.isNextDay" class="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
        <div class="text-xs text-gray-500 font-medium">选择日期查看空闲时段：</div>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            @click="handlePickTomorrow"
            class="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 cursor-pointer transition-all"
          >
            <i class="fa-solid fa-forward mr-1"></i> 明天 ({{ formatDate(tomorrowStr) }})
          </button>
          <span class="text-xs text-gray-400">或</span>
          <input
            type="date"
            v-model="customDate"
            :min="minDate"
            class="px-2 py-1.5 rounded-md text-xs border border-gray-300 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
          />
          <button
            @click="handleDateConfirm"
            :disabled="!customDate"
            :class="[
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              customDate
                ? 'bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            ]"
          >
            确定
          </button>
        </div>
      </div>
    </template>

    <!-- ========== 已接受推荐 ========== -->
    <div v-if="data.userAction === 'accepted' && data.nearestSlot" class="text-xs text-green-600 flex items-center gap-1">
      <i class="fa-solid fa-circle-check"></i>
      已接受推荐，日程已调整至 {{ data.nearestSlot.startTime }} - {{ data.nearestSlot.endTime }}
    </div>

    <!-- ========== 已取消 ========== -->
    <div v-if="data.userAction === 'cancelled'" class="text-xs text-gray-500 flex items-center gap-1">
      <i class="fa-solid fa-ban"></i>
      已取消创建
    </div>

    <!-- ========== 展示更多时段 / 直接展示时段 ========== -->
    <template v-if="isShowMorePhase || isDirectSlotPhase">
      <!-- 跨日提示 -->
      <div v-if="data.isNextDay" class="text-xs text-gray-500 flex items-center gap-1">
        <i class="fa-solid fa-calendar-arrow-down"></i>
        今天已无可用时段，以下为下一个工作日的推荐：
      </div>

      <div v-if="data.availableSlots.length > 0" class="space-y-2">
        <div class="text-xs text-gray-500 font-medium">
          {{ isShowMorePhase ? '请选择其他时段：' : (data.isNextDay ? '可选时段：' : '为您推荐以下空闲时段：') }}
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(slot, index) in data.availableSlots"
            :key="index"
            @click="handleSelectSlot(index)"
            :disabled="data.selectedIndex !== null"
            :class="[
              'px-3 py-2 rounded-lg text-xs font-medium transition-all border',
              data.selectedIndex === index
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : data.selectedIndex !== null
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400 cursor-pointer shadow-sm'
            ]"
          >
            <span v-if="data.isNextDay" class="mr-1">{{ formatDate(slot.date) }}</span>
            <i class="fa-regular fa-clock mr-1"></i>
            {{ slot.startTime }} - {{ slot.endTime }}
            <i v-if="data.selectedIndex === index" class="fa-solid fa-check ml-1"></i>
          </button>
        </div>
        <!-- 底部操作区 -->
        <div v-if="data.selectedIndex === null" class="flex items-center gap-2 flex-wrap pt-1">
          <button
            @click="toggleDatePanel"
            :class="[
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all border cursor-pointer',
              showDatePanel
                ? 'bg-blue-100 text-blue-700 border-blue-400'
                : 'bg-white text-blue-500 border-blue-200 hover:bg-blue-50'
            ]"
          >
            <i class="fa-solid fa-calendar-days mr-1"></i> 换个日期
          </button>
          <button
            @click="handleCancel"
            class="px-3 py-1.5 rounded-md text-xs font-medium transition-all border bg-white text-red-500 border-red-200 hover:bg-red-50 cursor-pointer"
          >
            <i class="fa-solid fa-xmark mr-1"></i> 取消创建
          </button>
        </div>
      </div>

      <!-- 日期选择面板（时段选择阶段） -->
      <div v-if="showDatePanel && data.selectedIndex === null" class="bg-gray-50 rounded-lg p-3 border border-gray-200 space-y-2">
        <div class="text-xs text-gray-500 font-medium">选择日期查看空闲时段：</div>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            v-if="!data.isNextDay"
            @click="handlePickTomorrow"
            class="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 cursor-pointer transition-all"
          >
            <i class="fa-solid fa-forward mr-1"></i> 明天 ({{ formatDate(tomorrowStr) }})
          </button>
          <span v-if="!data.isNextDay" class="text-xs text-gray-400">或</span>
          <input
            type="date"
            v-model="customDate"
            :min="minDate"
            class="px-2 py-1.5 rounded-md text-xs border border-gray-300 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
          />
          <button
            @click="handleDateConfirm"
            :disabled="!customDate"
            :class="[
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              customDate
                ? 'bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            ]"
          >
            确定
          </button>
        </div>
      </div>

      <!-- 无可用时段 -->
      <div v-if="data.availableSlots.length === 0" class="text-xs text-gray-500">
        暂无其他可用时段
      </div>
    </template>

    <!-- 已选中时段提示 -->
    <div v-if="data.selectedIndex !== null" class="text-xs text-green-600 flex items-center gap-1">
      <i class="fa-solid fa-circle-check"></i>
      已选择，正在创建日程...
    </div>
  </div>
</template>
