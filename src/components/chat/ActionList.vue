<script setup lang="ts">
import type { Task } from '../../types'

defineProps<{
  tasks: Task[]
}>()

const emit = defineEmits<{
  execute: [task: Task]
  skip: [task: Task]
}>()
</script>

<template>
  <div class="mt-4 space-y-2.5">
    <div 
      v-for="task in tasks" 
      :key="task.id"
      :class="[
        'p-3 rounded-xl border flex gap-3 transition-all bg-white hover:shadow-md',
        task.status === 'done' ? 'border-gray-100 opacity-60' : 'border-indigo-100 bg-indigo-50/20'
      ]"
    >
      <!-- Icon -->
      <div class="mt-1">
        <i :class="[
          'fa-solid', 
          task.icon, 
          task.status === 'done' ? 'text-green-500' : 'text-indigo-500'
        ]"></i>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="font-bold text-xs flex justify-between items-center">
          <span :class="task.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-800'">
            {{ task.title }}
          </span>
          <span 
            v-if="task.status === 'done'" 
            class="text-[10px] text-green-600 bg-green-100 px-1.5 py-0.5 rounded font-bold"
          >
            <i class="fa-solid fa-check"></i> 完成
          </span>
        </div>

        <!-- Actions -->
        <div v-if="task.status === 'pending'" class="mt-2.5 flex gap-2">
          <button 
            @click="emit('execute', task)"
            class="flex-1 bg-white border border-indigo-200 text-indigo-600 text-xs py-1.5 rounded-lg font-bold hover:bg-indigo-600 hover:text-white transition shadow-sm"
          >
            {{ task.actionBtn }}
          </button>
          <button 
            @click="emit('skip', task)"
            class="px-3 text-gray-400 hover:text-gray-600 text-xs hover:bg-gray-100 rounded-lg"
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
