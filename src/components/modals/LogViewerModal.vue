<template>
  <div v-if="visible" class="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4" @click.self="close">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b">
        <div class="flex items-center gap-3">
          <i class="fa-solid fa-file-lines text-purple-600 text-xl"></i>
          <h2 class="text-lg font-bold text-gray-800">日志查看器</h2>
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

      <!-- Body: Sidebar + Log List -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Session Sidebar -->
        <div class="w-64 border-r bg-gray-50 flex flex-col overflow-hidden">
          <div class="p-3 border-b">
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">会话列表</div>
            <div class="text-xs text-gray-400 mt-0.5">共 {{ sessions.length }} 个会话</div>
          </div>
          <div class="flex-1 overflow-y-auto">
            <div
              v-for="s in sessions"
              :key="s.sessionId"
              class="relative group px-3 py-2.5 cursor-pointer border-b border-gray-100 transition-colors"
              :class="selectedSessionId === s.sessionId ? 'bg-purple-50 border-l-2 border-l-purple-500' : 'hover:bg-gray-100 border-l-2 border-l-transparent'"
              @click="selectSession(s.sessionId)"
            >
              <div class="flex items-center gap-1.5">
                <span v-if="s.isCurrent" class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                <span class="text-sm font-medium text-gray-700 truncate">
                  {{ s.isCurrent ? '当前会话' : s.label }}
                </span>
              </div>
              <div class="flex items-center justify-between mt-1">
                <span class="text-xs text-gray-400">{{ s.logCount }} 条日志</span>
                <span v-if="s.isCurrent" class="text-[10px] text-green-600 font-medium">活跃</span>
                <span v-else class="text-xs text-gray-400">{{ formatShortTime(s.lastTime) }}</span>
              </div>
              <!-- Delete button (non-current sessions only) -->
              <button
                v-if="!s.isCurrent"
                class="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除此会话日志"
                @click.stop="confirmDeleteSession(s.sessionId, s.label)"
              >
                <i class="fa-solid fa-trash-can text-[10px]"></i>
              </button>
            </div>

            <div v-if="sessions.length === 0" class="p-4 text-center text-gray-400 text-xs">
              暂无会话
            </div>
          </div>
        </div>

        <!-- Right Panel: Filters + Log List -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Filters -->
          <div class="flex items-center gap-3 p-3 border-b bg-white">
            <select v-model="filterLevel" class="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300">
              <option value="">所有等级</option>
              <option value="DEBUG">DEBUG</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
            </select>

            <input
              v-model="filterModule"
              type="text"
              placeholder="模块名称..."
              class="px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 w-32"
            />

            <input
              v-model="filterKeyword"
              type="text"
              placeholder="搜索关键词..."
              class="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300"
            />

            <span class="text-sm text-gray-500 whitespace-nowrap">{{ filteredLogs.length }} 条</span>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { logger } from '../../utils/logger'
import type { LogEntry, LogLevel, SessionInfo } from '../../utils/logger'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const logs = ref<LogEntry[]>([])
const sessions = ref<SessionInfo[]>([])
const selectedSessionId = ref('')
const loading = ref(false)

// Filters
const filterLevel = ref<LogLevel | ''>('')
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

// Select a session
async function selectSession(sessionId: string) {
  selectedSessionId.value = sessionId
  await loadLogs()
}

// Load logs for selected session
async function loadLogs() {
  loading.value = true
  try {
    logs.value = await logger.queryLogs({
      sessionId: selectedSessionId.value || undefined,
      limit: 2000
    })
  } catch (error) {
    console.error('加载日志失败:', error)
  } finally {
    loading.value = false
  }
}

// Load session list
async function loadSessions() {
  try {
    sessions.value = await logger.getSessionsWithStats()
  } catch (error) {
    console.error('加载会话列表失败:', error)
  }
}

// Refresh
async function refreshLogs() {
  await loadSessions()
  await loadLogs()
}

// Delete a session
async function confirmDeleteSession(sessionId: string, label: string) {
  if (!confirm(`确定要删除会话「${label}」的所有日志吗？`)) return
  try {
    await logger.deleteSession(sessionId)
    await loadSessions()
    // 如果删除的就是当前选中的，切回当前会话
    if (selectedSessionId.value === sessionId) {
      selectedSessionId.value = logger.getSessionId()
      await loadLogs()
    }
  } catch (error) {
    console.error('删除会话失败:', error)
  }
}

// Export logs
async function exportLogs() {
  try {
    const text = await logger.exportLogsAsText(selectedSessionId.value || undefined)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs_${selectedSessionId.value || 'all'}_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('导出日志失败:', error)
  }
}

// Format helpers
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function formatShortTime(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatData(data: any): string {
  if (typeof data === 'string') return data
  return JSON.stringify(data, null, 2)
}

function getLevelClass(level: LogLevel): string {
  switch (level) {
    case 'DEBUG': return 'border-gray-300'
    case 'INFO': return 'border-blue-300'
    case 'WARN': return 'border-yellow-300'
    case 'ERROR': return 'border-red-300'
    default: return 'border-gray-300'
  }
}

function getLevelTextClass(level: LogLevel): string {
  switch (level) {
    case 'DEBUG': return 'text-gray-500'
    case 'INFO': return 'text-blue-600'
    case 'WARN': return 'text-yellow-600'
    case 'ERROR': return 'text-red-600'
    default: return 'text-gray-500'
  }
}

function close() {
  emit('close')
}

// Initialize: default to current session
async function init() {
  selectedSessionId.value = logger.getSessionId()
  await loadSessions()
  await loadLogs()
}

watch(() => props.visible, async (newVal) => {
  if (newVal) {
    await init()
  }
})

onMounted(async () => {
  if (props.visible) {
    await init()
  }
})
</script>
