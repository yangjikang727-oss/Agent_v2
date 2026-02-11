<script setup lang="ts">
import { ref } from 'vue'
import type { CancelConfirmData, ScheduleQueryItem } from '../../types'

const props = defineProps<{
  data: CancelConfirmData
}>()

const emit = defineEmits<{
  confirm: [scheduleId: string]
  reselect: [scheduleId: string]
}>()

const showAll = ref(false)

// 格式化日期
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

// 获取类型标签
function getTypeLabel(type: string): string {
  const labels: Record<string, string> = { meeting: '会议', trip: '出差', general: '日程' }
  return labels[type] || '日程'
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    meeting: 'bg-blue-100 text-blue-600',
    trip: 'bg-purple-100 text-purple-600',
    general: 'bg-gray-100 text-gray-600'
  }
  return colors[type] || 'bg-gray-100 text-gray-600'
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = { meeting: 'fa-users', trip: 'fa-plane', general: 'fa-calendar' }
  return icons[type] || 'fa-calendar'
}

// 从候选列表中选择了一条
function handleSelectFromList(item: ScheduleQueryItem) {
  emit('reselect', item.id)
}

const isDone = () => props.data.userAction !== 'pending'
</script>

<template>
  <div class="cancel-confirm">
    <!-- 已处理完成 -->
    <template v-if="isDone()">
      <div v-if="data.userAction === 'cancelled'" class="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
        <i class="fa-solid fa-circle-check text-red-500"></i>
        <span class="text-sm text-red-700 font-medium">日程已取消</span>
      </div>
      <div v-else-if="data.userAction === 'kept'" class="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
        <i class="fa-solid fa-rotate-left text-gray-500"></i>
        <span class="text-sm text-gray-600">已保留日程</span>
      </div>
    </template>

    <!-- 等待用户操作 -->
    <template v-else>
      <!-- 匹配到的日程 -->
      <div v-if="data.matchedSchedule" class="space-y-3">
        <div class="text-xs text-gray-500 mb-1">
          <i class="fa-solid fa-crosshairs mr-1"></i> 识别到以下日程，是否取消？
        </div>

        <div class="p-3 bg-white rounded-xl border-2 border-red-200 shadow-sm">
          <div class="flex items-center gap-3">
            <div :class="['w-10 h-10 rounded-lg flex items-center justify-center shrink-0', getTypeColor(data.matchedSchedule.type)]">
              <i :class="['fa-solid', getTypeIcon(data.matchedSchedule.type)]"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-sm font-bold text-gray-800 truncate">{{ data.matchedSchedule.content }}</span>
                <span :class="['text-[10px] px-1.5 py-0.5 rounded-full font-medium', getTypeColor(data.matchedSchedule.type)]">
                  {{ getTypeLabel(data.matchedSchedule.type) }}
                </span>
              </div>
              <div class="text-xs text-gray-400">
                {{ formatDate(data.matchedSchedule.date) }} · {{ data.matchedSchedule.startTime }} - {{ data.matchedSchedule.endTime }}
                <span v-if="data.matchedSchedule.location" class="ml-1">
                  · <i class="fa-solid fa-location-dot"></i> {{ data.matchedSchedule.location }}
                </span>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-2 mt-3">
            <button
              @click="emit('confirm', data.matchedSchedule!.id)"
              class="flex-1 px-3 py-2 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition"
            >
              <i class="fa-solid fa-trash-can mr-1"></i> 确认取消
            </button>
            <button
              @click="showAll = true"
              class="flex-1 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition"
            >
              <i class="fa-solid fa-arrows-rotate mr-1"></i> 不是这个
            </button>
          </div>
        </div>
      </div>

      <!-- 无匹配 或 用户点了"不是这个" -->
      <div v-if="!data.matchedSchedule || showAll" class="mt-3">
        <div class="text-xs text-gray-500 mb-2">
          <i class="fa-solid fa-list-check mr-1"></i>
          {{ data.matchedSchedule ? '请选择要取消的日程：' : '未找到匹配日程，请从列表选择：' }}
        </div>

        <div v-if="data.allSchedules.length === 0" class="text-center py-4 text-gray-400">
          <i class="fa-solid fa-calendar-xmark text-xl mb-1"></i>
          <p class="text-xs">暂无可取消的日程</p>
        </div>

        <div class="space-y-1.5 max-h-64 overflow-y-auto">
          <div
            v-for="item in data.allSchedules"
            :key="item.id"
            @click="handleSelectFromList(item)"
            class="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100 hover:border-red-300 hover:shadow-md cursor-pointer transition group"
          >
            <div :class="['w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm', getTypeColor(item.type)]">
              <i :class="['fa-solid', getTypeIcon(item.type)]"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-bold text-gray-800 truncate group-hover:text-red-600 transition">
                {{ item.content }}
              </div>
              <div class="text-[10px] text-gray-400 mt-0.5">
                {{ formatDate(item.date) }} · {{ item.startTime }} - {{ item.endTime }}
              </div>
            </div>
            <div class="text-gray-300 group-hover:text-red-400 transition">
              <i class="fa-solid fa-xmark"></i>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
