<script setup lang="ts">
import type { ResourceCardData } from '../../types'

defineProps<{
  data: ResourceCardData
}>()

const emit = defineEmits<{
  confirm: [data: ResourceCardData]
  dismiss: []
}>()
</script>

<template>
  <div class="mt-4 w-full min-w-[280px]">
    <div class="ticket-card p-4 shadow-sm border-l-4 border-l-purple-500 bg-white hover:shadow-md transition">
      <!-- Header -->
      <div class="flex justify-between items-center mb-3">
        <div class="font-bold text-gray-800 text-sm flex items-center gap-2">
          <div class="w-6 h-6 rounded bg-purple-50 text-purple-600 flex items-center justify-center">
            <i :class="['fa-solid', data.icon]"></i>
          </div>
          {{ data.title }}
        </div>
        <div class="text-purple-600 font-bold text-lg">
          {{ data.price ? '¥' + data.price : '可用' }}
        </div>
      </div>

      <!-- Details -->
      <div 
        class="text-xs text-gray-500 mb-4 leading-relaxed bg-gray-50 p-2 rounded border border-gray-100" 
        v-html="data.details"
      ></div>

      <!-- Actions -->
      <div class="flex gap-2">
        <button 
          @click="emit('confirm', data)"
          class="flex-1 bg-purple-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-purple-700 transition shadow-sm shadow-purple-200"
        >
          确认预订
        </button>
        <button 
          @click="emit('dismiss')"
          class="text-gray-400 text-xs px-3 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          取消
        </button>
      </div>
    </div>
  </div>
</template>
