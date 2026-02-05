<script setup lang="ts">
import type { Task } from '../../types'

const props = defineProps<{
  tasks: Task[]
}>()

const emit = defineEmits<{
  execute: [task: Task]
  skip: [task: Task]
}>()
</script>

<template>
  <div class="glass-card rounded-2xl shadow-sm overflow-hidden flex flex-col bg-white">
    <!-- Header -->
    <div class="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
      <h3 class="font-bold text-gray-700 text-sm">待办任务堆栈</h3>
      <span class="bg-indigo-100 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
        {{ tasks.length }}
      </span>
    </div>

    <!-- Task List -->
    <div class="flex-1 bg-gray-50/50 p-4 overflow-y-auto space-y-3">
      <!-- Empty State -->
      <div 
        v-if="tasks.length === 0" 
        class="text-xs text-gray-400 text-center py-12 flex flex-col items-center opacity-60"
      >
        <i class="fa-solid fa-clipboard-check text-3xl mb-3 text-gray-300"></i>
        <p>所有任务已完成</p>
      </div>

      <!-- Task Items -->
      <div 
        v-for="task in tasks" 
        :key="task.id"
        class="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex gap-3 items-start hover:shadow-md hover:border-indigo-200 transition group"
      >
        <!-- Icon -->
        <div class="mt-1 w-8 h-8 rounded-lg bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-500 text-sm shrink-0 transition">
          <i :class="['fa-solid', task.icon]"></i>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-gray-800 line-clamp-1 mb-0.5">{{ task.title }}</div>
          <div class="text-[10px] text-gray-500 mb-3 truncate">{{ task.desc }}</div>
          <div class="flex gap-2">
            <button 
              @click="emit('execute', task)"
              class="flex-1 text-[10px] bg-indigo-600 text-white py-1.5 rounded-lg hover:bg-indigo-700 font-bold transition shadow-sm shadow-indigo-200"
            >
              执行
            </button>
            <button 
              @click="emit('skip', task)"
              class="px-2.5 text-[10px] bg-gray-100 text-gray-500 py-1.5 rounded-lg hover:bg-gray-200 font-medium transition"
            >
              忽略
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
