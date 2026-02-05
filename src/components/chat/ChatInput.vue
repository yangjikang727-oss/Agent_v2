<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  isRecording?: boolean
  placeholder?: string
  transcript?: string
  speechError?: string
  speechSupported?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  toggleRecording: []
}>()

const inputText = ref('')

const currentPlaceholder = computed(() => {
  if (props.isRecording) {
    return props.transcript || '正在听...'
  }
  return props.placeholder || '输入指令...'
})

// 录音结束时，将识别结果填入输入框
watch(() => props.isRecording, (recording, wasRecording) => {
  if (wasRecording && !recording && props.transcript) {
    inputText.value = props.transcript
  }
})

function handleSend() {
  const text = inputText.value.trim()
  if (text) {
    emit('send', text)
    inputText.value = ''
  }
}

function handleKeyEnter(event: KeyboardEvent) {
  if (!event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

// 暴露方法供外部调用
defineExpose({
  setText(text: string) {
    inputText.value = text
  },
  getText() {
    return inputText.value
  },
  clear() {
    inputText.value = ''
  }
})
</script>

<template>
  <div class="relative">
    <!-- Speech Error Toast -->
    <Transition name="fade">
      <div 
        v-if="speechError" 
        class="absolute -top-12 left-0 right-0 bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center gap-2"
      >
        <i class="fa-solid fa-circle-exclamation"></i>
        {{ speechError }}
      </div>
    </Transition>

    <div class="flex items-center gap-3">
      <!-- Voice Button -->
      <button 
        @click="emit('toggleRecording')"
        :disabled="speechSupported === false"
        :title="speechSupported === false ? '浏览器不支持语音识别' : (isRecording ? '停止录音' : '开始语音输入')"
        :class="[
          'w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0',
          speechSupported === false 
            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
            : isRecording 
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-200' 
              : 'bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600'
        ]"
      >
        <i :class="['fa-solid', isRecording ? 'fa-microphone-lines' : 'fa-microphone']"></i>
      </button>

      <!-- Input -->
      <div class="flex-1 relative">
        <input 
          type="text" 
          v-model="inputText" 
          @keyup.enter="handleKeyEnter"
          :placeholder="currentPlaceholder"
          class="w-full bg-gray-100 border-0 rounded-full pl-5 pr-12 py-3 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:bg-white outline-none transition font-medium text-gray-700"
        >
        <!-- Recording indicator -->
        <div 
          v-if="isRecording"
          class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1"
        >
          <span class="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
          <span class="text-xs text-red-500 font-medium">录音中</span>
        </div>
      </div>

      <!-- Send Button -->
      <button 
        @click="handleSend"
        :disabled="!inputText.trim()"
        class="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 shadow-lg shadow-indigo-200 transform active:scale-95"
      >
        <i class="fa-solid fa-paper-plane text-sm"></i>
      </button>
    </div>
  </div>
</template>
