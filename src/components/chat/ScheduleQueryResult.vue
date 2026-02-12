<script setup lang="ts">
import type { ScheduleQueryResultData, ScheduleQueryItem } from '../../types'

defineProps<{
  data: ScheduleQueryResultData
}>()

// 格式化日期为更友好的显示
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

// 获取类型配置
const defaultConfig = { icon: 'fa-calendar-check', label: '日程', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' }

function getTypeConfig(type: ScheduleQueryItem['type']) {
  const configs: Record<string, { icon: string; label: string; color: string; bg: string; border: string; dot: string }> = {
    meeting: { icon: 'fa-users', label: '会议', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500' },
    trip: { icon: 'fa-plane', label: '出差', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500' },
    general: defaultConfig
  }
  return configs[type] ?? defaultConfig
}

// 格式化出行方式
function formatTransport(transport?: string): string {
  const map: Record<string, string> = { flight: '飞机', train: '高铁/火车', car: '汽车', ship: '轮船' }
  return transport ? (map[transport] || transport) : ''
}

// 格式化时间，只保留 HH:mm
function formatTime(time: string): string {
  // 处理 "14:00:00" → "14:00"，"14:00" → "14:00"
  return time.slice(0, 5)
}

// 按日期分组
function groupByDate(schedules: ScheduleQueryItem[]): Array<{ date: string; label: string; items: ScheduleQueryItem[] }> {
  const groups = new Map<string, ScheduleQueryItem[]>()
  for (const s of schedules) {
    const arr = groups.get(s.date) || []
    arr.push(s)
    groups.set(s.date, arr)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      label: formatDate(date),
      items: items.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }))
}
</script>

<template>
  <div class="mt-2">
    <!-- 头部 -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
          <i class="fa-solid fa-magnifying-glass text-indigo-500 text-xs"></i>
        </div>
        <span class="font-bold text-gray-800 text-sm">日程查询</span>
      </div>
      <span class="text-xs font-medium text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full">{{ data.totalCount }} 条结果</span>
    </div>

    <!-- 查询条件标签 -->
    <div v-if="data.queryDate || data.queryKeyword" class="flex flex-wrap gap-1.5 mb-3">
      <span v-if="data.queryDate" class="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
        <i class="fa-regular fa-calendar text-[10px]"></i>
        {{ formatDate(data.queryDate) }}
      </span>
      <span v-if="data.queryKeyword" class="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
        <i class="fa-solid fa-tag text-[10px]"></i>
        {{ data.queryKeyword }}
      </span>
    </div>

    <!-- 空结果 -->
    <div v-if="data.schedules.length === 0" class="text-center py-8">
      <div class="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
        <i class="fa-regular fa-calendar-xmark text-2xl text-gray-300"></i>
      </div>
      <p class="text-sm text-gray-400">暂无匹配的日程</p>
    </div>

    <!-- 分组日程列表 -->
    <div v-else class="space-y-1">
      <div v-for="group in groupByDate(data.schedules)" :key="group.date" class="mb-1">
        <!-- 日期分割线 -->
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-bold text-gray-500 whitespace-nowrap">{{ group.label }}</span>
          <div class="flex-1 h-px bg-gray-100"></div>
        </div>

        <!-- 日程卡片 -->
        <div 
          v-for="item in group.items" 
          :key="item.id" 
          class="flex gap-4 p-4 mb-3 rounded-xl bg-white border transition-all hover:shadow-sm"
          :class="getTypeConfig(item.type).border"
        >
          <!-- 左侧时间线 -->
          <div class="flex flex-col items-center shrink-0 pt-0.5">
            <div class="w-3 h-3 rounded-full shrink-0" :class="getTypeConfig(item.type).dot"></div>
            <div class="flex flex-col items-center mt-2 leading-tight">
              <span class="text-sm font-bold text-gray-700 font-mono">{{ formatTime(item.startTime) }}</span>
              <span class="text-[10px] text-gray-300 my-0.5">—</span>
              <span class="text-xs text-gray-500 font-mono">{{ formatTime(item.endTime) }}</span>
            </div>
          </div>

          <!-- 主内容区 -->
          <div class="flex-1 min-w-0">
            <!-- 标题行 -->
            <div class="flex items-start justify-between gap-2">
              <span class="text-base font-bold text-gray-800 truncate">{{ item.content }}</span>
              <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" :class="[getTypeConfig(item.type).color, getTypeConfig(item.type).bg]">
                <i :class="['fa-solid', getTypeConfig(item.type).icon, 'text-[10px]']"></i>
                {{ getTypeConfig(item.type).label }}
              </span>
            </div>

            <!-- 详情信息分行显示 -->
            <div class="flex flex-col gap-2 mt-2.5">
              <!-- 地点（出差有路线时不显示，避免冗余） -->
              <div v-if="item.location && !(item.type === 'trip' && item.meta?.from && item.meta?.to)" class="flex items-center gap-1.5 text-xs text-gray-500">
                <i class="fa-solid fa-location-dot text-[10px] text-gray-400 w-3.5 text-center"></i>
                {{ item.location }}
              </div>
              <!-- 出差: 路线 + 交通方式（合并显示） -->
              <div v-if="item.type === 'trip' && item.meta?.from && item.meta?.to" class="flex items-center gap-1.5 text-xs text-purple-600">
                <i class="fa-solid fa-route text-[10px] text-purple-400 w-3.5 text-center"></i>
                {{ item.meta.from }} → {{ item.meta.to }}
                <span v-if="item.meta?.transport" class="text-gray-400">（{{ formatTransport(item.meta.transport) }}）</span>
              </div>
              <!-- 跨天返程 -->
              <div v-if="item.endDate && item.endDate !== item.date" class="flex items-center gap-1.5 text-xs text-gray-500">
                <i class="fa-solid fa-arrow-right-long text-[10px] text-gray-400 w-3.5 text-center"></i>
                返程 {{ formatDate(item.endDate) }}
              </div>
              <!-- 参会人 -->
              <div v-if="item.attendees && item.attendees.length > 0" class="flex items-center gap-1.5 text-xs text-gray-500">
                <i class="fa-solid fa-user-group text-[10px] text-gray-400 w-3.5 text-center"></i>
                {{ item.attendees.join('、') }}（{{ item.attendees.length }}人）
              </div>
              <!-- 已预订资源 -->
              <div v-if="item.resources && item.resources.length > 0" class="flex items-center gap-1.5 text-xs text-emerald-600">
                <i class="fa-solid fa-check-circle text-[10px] text-emerald-400 w-3.5 text-center"></i>
                已预订 {{ item.resources.map(r => r.name).join('、') }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
