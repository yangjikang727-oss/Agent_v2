<template>
  <div v-if="visible" class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4" @click.self="close">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b">
        <div class="flex items-center gap-3">
          <i class="fa-solid fa-file-lines text-purple-600 text-xl"></i>
          <h2 class="text-lg font-bold text-gray-800">日志查看器</h2>
          <span class="text-xs text-gray-500">{{ currentSessionId }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="refreshLogs"
            :disabled="loading"
            class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i class="fa-solid fa-rotate-right" :class="{ 'animate-spin': loading }"></i>
            刷新
          </button>
          <button
            @click="exportLogs"
            class="px-3 py-1.5 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
          >
            <i class="fa-solid fa-download"></i>
            导出
          </button>
          <button
            @click="close"
            class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-3 p-4 border-b bg-gray-50">
        <select v-model="filterLevel" class="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300">
          <option value="">所有等级</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>

        <select v-model="filterSession" class="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300">
          <option value="">当前会话</option>
          <option v-for="sid in sessionIds" :key="sid" :value="sid">{{ sid }}</option>
        </select>

        <input
          v-model="filterModule"
          type="text"
          placeholder="模块名称..."
          class="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300"
        />

        <input
          v-model="filterKeyword"
          type="text"
          placeholder="搜索关键词..."
          class="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300"
        />

        <span class="text-sm text-gray-500">共 {{ filteredLogs.length }} 条</span>
      </div>

      <!-- Logs List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs">
        <div
          v-for="log in filteredLogs"
          :key="log.timestamp"
          class="p-2 rounded hover:bg-gray-50 border-l-2"
          :class="getLevelClass(log.level)"
        >
          <div class="flex items-start gap-2">
            <span class="text-gray-400">{{ formatTime(log.timestamp) }}</span>
            <span class="font-semibold" :class="getLevelTextClass(log.level)">{{ log.level }}</span>
            <span class="text-purple-600">[{{ log.module }}]</span>
            <span class="flex-1 text-gray-700">{{ log.message }}</span>
          </div>
          <div v-if="log.data" class="mt-1 ml-24 text-gray-500 whitespace-pre-wrap">
            {{ formatData(log.data) }}
          </div>
          <div v-if="log.stack" class="mt-1 ml-24 text-red-500 text-xs whitespace-pre-wrap">
            {{ log.stack }}
          </div>
        </div>

        <div v-if="filteredLogs.length === 0" class="text-center py-12 text-gray-400">
          <i class="fa-solid fa-inbox text-4xl mb-3"></i>
          <p>暂无日志</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { logger } from '../../utils/logger'
import type { LogEntry, LogLevel } from '../../utils/logger'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const logs = ref<LogEntry[]>([])
const sessionIds = ref<string[]>([])
const currentSessionId = ref('')
const loading = ref(false)

// Filters
const filterLevel = ref<LogLevel | ''>('')
const filterSession = ref('')
const filterModule = ref('')
const filterKeyword = ref('')

// Filtered logs
const filteredLogs = computed(() => {
  let result = logs.value

  if (filterLevel.value) {
    result = result.filter(log => log.level === filterLevel.value)
  }

  if (filterModule.value) {
    result = result.filter(log => log.module.toLowerCase().includes(filterModule.value.toLowerCase()))
  }

  if (filterKeyword.value) {
    const keyword = filterKeyword.value.toLowerCase()
    result = result.filter(log => 
      log.message.toLowerCase().includes(keyword) ||
      (log.data && JSON.stringify(log.data).toLowerCase().includes(keyword))
    )
  }

  return result
})

// Load logs
async function loadLogs() {
  loading.value = true
  try {
    const sessionId = filterSession.value || undefined
    logs.value = await logger.queryLogs({
      sessionId,
      limit: 1000
    })
  } catch (error) {
    console.error('加载日志失败:', error)
  } finally {
    loading.value = false
  }
}

// Refresh logs
async function refreshLogs() {
  await loadLogs()
}

// Export logs
async function exportLogs() {
  try {
    const text = await logger.exportLogsAsText(filterSession.value || undefined)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs_${filterSession.value || currentSessionId.value}_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('导出日志失败:', error)
  }
}

// Format time
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

// Format data
function formatData(data: any): string {
  if (typeof data === 'string') return data
  return JSON.stringify(data, null, 2)
}

// Get level class
function getLevelClass(level: LogLevel): string {
  switch (level) {
    case 'DEBUG': return 'border-gray-300'
    case 'INFO': return 'border-blue-300'
    case 'WARN': return 'border-yellow-300'
    case 'ERROR': return 'border-red-300'
    default: return 'border-gray-300'
  }
}

// Get level text class
function getLevelTextClass(level: LogLevel): string {
  switch (level) {
    case 'DEBUG': return 'text-gray-500'
    case 'INFO': return 'text-blue-600'
    case 'WARN': return 'text-yellow-600'
    case 'ERROR': return 'text-red-600'
    default: return 'text-gray-500'
  }
}

// Close modal
function close() {
  emit('close')
}

// Watch visible
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    currentSessionId.value = logger.getSessionId()
    sessionIds.value = await logger.getSessionIds()
    await loadLogs()
  }
})

// Mount
onMounted(async () => {
  if (props.visible) {
    currentSessionId.value = logger.getSessionId()
    sessionIds.value = await logger.getSessionIds()
    await loadLogs()
  }
})
</script>
