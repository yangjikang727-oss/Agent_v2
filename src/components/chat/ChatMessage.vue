<script setup lang="ts">
import type { Message } from '../../types'

defineProps<{
  message: Message
}>()
</script>

<template>
  <div :class="['flex', message.role === 'user' ? 'justify-end' : 'justify-start']">
    <!-- System Avatar -->
    <div 
      v-if="message.role === 'system'" 
      class="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-indigo-600 mr-3 shrink-0 mt-1 shadow-sm"
    >
      <i class="fa-solid fa-robot text-xs"></i>
    </div>

    <!-- Message Bubble -->
    <div 
      :class="[
        'max-w-[90%] rounded-2xl p-4 text-sm shadow-sm transition-all leading-relaxed',
        message.role === 'user' 
          ? 'bg-indigo-600 text-white rounded-br-none shadow-indigo-200' 
          : 'bg-white text-gray-700 border border-gray-100 rounded-bl-none'
      ]"
    >
      <!-- Content -->
      <div v-html="message.content"></div>

      <!-- Brain Log (Thoughts) -->
      <div 
        v-if="message.thoughts && message.thoughts.length > 0" 
        class="mt-3 pt-3 border-t border-dashed border-gray-200/50"
      >
        <div class="text-[10px] text-gray-400 font-bold mb-1.5 uppercase tracking-wider flex items-center gap-1">
          <i class="fa-solid fa-microchip"></i> Brain Log
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span 
            v-for="(step, idx) in message.thoughts" 
            :key="idx" 
            class="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] border border-gray-200"
          >
            {{ step }}
          </span>
        </div>
      </div>

      <!-- Slot for additional content -->
      <slot></slot>
    </div>
  </div>
</template>
