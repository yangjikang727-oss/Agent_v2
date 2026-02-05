<script setup lang="ts">
import { computed } from 'vue'
import type { AttendeeTableData } from '../../types'

const props = defineProps<{
  data: AttendeeTableData
}>()

const emit = defineEmits<{
  remove: [uid: string]
  restore: [uid: string]
  confirm: [data: AttendeeTableData]
}>()

const activeCount = computed(() => 
  props.data.rows.filter(r => !r.deleted).length
)
</script>

<template>
  <div class="mt-4 w-full">
    <!-- Header -->
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs font-bold text-gray-600">
        参会人员确认 ({{ activeCount }}人)
      </span>
      <span 
        v-if="data.hasConflict" 
        class="text-[10px] text-orange-600 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded font-bold"
      >
        <i class="fa-solid fa-triangle-exclamation"></i> 存在重名
      </span>
    </div>

    <!-- Table -->
    <div class="excel-table-container shadow-sm border border-gray-200">
      <!-- Table Header -->
      <div class="excel-header bg-gray-50">
        <div>姓名</div>
        <div>部门/邮箱</div>
        <div>职位</div>
        <div class="text-center">操作</div>
      </div>

      <!-- Table Rows -->
      <div 
        v-for="row in data.rows" 
        :key="row.uid"
        :class="[
          'excel-row',
          row.isAmbiguous && !row.deleted ? 'warning' : '',
          row.deleted ? 'deleted' : ''
        ]"
      >
        <!-- Name -->
        <div class="font-bold text-gray-800 flex items-center gap-1.5">
          <div class="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">
            {{ row.name[0] }}
          </div>
          {{ row.name }}
          <i 
            v-if="row.isAmbiguous" 
            class="fa-solid fa-circle-question text-orange-400 text-[10px]" 
            title="重名人员"
          ></i>
        </div>

        <!-- Dept/Email -->
        <div class="text-gray-500 truncate" :title="row.email">
          {{ row.dept }}<br>
          <span class="text-[10px] text-gray-400">{{ row.email.split('@')[0] }}</span>
        </div>

        <!-- Title -->
        <div class="text-gray-600">{{ row.title }}</div>

        <!-- Actions -->
        <div class="text-center">
          <button 
            v-if="!row.deleted" 
            @click="emit('remove', row.uid)"
            class="text-gray-400 hover:text-red-500 transition"
          >
            <i class="fa-solid fa-trash-can"></i>
          </button>
          <button 
            v-else 
            @click="emit('restore', row.uid)"
            class="text-blue-400 hover:text-blue-600 transition"
          >
            <i class="fa-solid fa-rotate-left"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Confirm Button -->
    <div class="mt-3 text-right" v-if="!data.confirmed">
      <button 
        @click="emit('confirm', data)"
        class="bg-indigo-600 text-white px-5 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700 transition shadow-indigo-200"
      >
        确认名单并发送
      </button>
    </div>

    <!-- Confirmed Notice -->
    <div 
      v-else 
      class="mt-2 text-[10px] text-gray-400 text-center font-medium bg-gray-50 py-1 rounded"
    >
      <i class="fa-solid fa-check-circle text-green-500"></i> 名单已确认
    </div>
  </div>
</template>
