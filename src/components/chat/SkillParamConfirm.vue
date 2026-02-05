<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ParamConfirmData, ParamField } from '../../types'

const props = defineProps<{
  data: ParamConfirmData
}>()

const emit = defineEmits<{
  confirm: [params: Record<string, string | number>]
  cancel: []
}>()

// 本地可编辑的字段副本
const editableFields = ref<ParamField[]>(JSON.parse(JSON.stringify(props.data.fields)))

// 监听 props 变化重置表单
watch(() => props.data.fields, (newFields) => {
  editableFields.value = JSON.parse(JSON.stringify(newFields))
}, { deep: true })

// 验证单个字段
function validateField(field: ParamField): string | null {
  if (field.required && !field.value && field.value !== 0) {
    return `${field.label}不能为空`
  }
  return null
}

// 验证所有字段
const validationErrors = computed(() => {
  const errors: Record<string, string> = {}
  editableFields.value.forEach(field => {
    const error = validateField(field)
    if (error) {
      errors[field.key] = error
    }
  })
  return errors
})

const isValid = computed(() => Object.keys(validationErrors.value).length === 0)

// 确认执行
function handleConfirm() {
  if (!isValid.value || props.data.executing) return

  const params: Record<string, string | number> = {}
  editableFields.value.forEach(field => {
    params[field.key] = field.value
  })

  emit('confirm', params)
}
</script>

<template>
  <div class="mt-4 w-full max-w-md">
    <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-indigo-200 p-4 shadow-lg">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-4 pb-3 border-b border-indigo-100">
        <div class="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-md">
          <i :class="['fa-solid', data.skillIcon]"></i>
        </div>
        <div class="flex-1">
          <h3 class="font-bold text-gray-800 text-sm">{{ data.skillName }}</h3>
          <p class="text-xs text-gray-500 mt-0.5">请确认或修改参数后执行</p>
        </div>
      </div>

      <!-- Fields -->
      <div class="space-y-3">
        <div v-for="field in editableFields" :key="field.key" class="space-y-1">
          <label class="text-xs font-semibold text-gray-700 flex items-center gap-1">
            {{ field.label }}
            <span v-if="field.required" class="text-red-500">*</span>
          </label>

          <!-- Text Input -->
          <input
            v-if="field.type === 'text'"
            v-model="field.value"
            :placeholder="field.placeholder"
            :disabled="data.confirmed || data.executing"
            class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition disabled:bg-gray-100 disabled:cursor-not-allowed"
            :class="validationErrors[field.key] ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'"
          />

          <!-- Number Input -->
          <input
            v-else-if="field.type === 'number'"
            v-model.number="field.value"
            type="number"
            min="1"
            :placeholder="field.placeholder"
            :disabled="data.confirmed || data.executing"
            class="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition disabled:bg-gray-100 disabled:cursor-not-allowed"
            :class="validationErrors[field.key] ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'"
          />

          <!-- Select Input -->
          <select
            v-else-if="field.type === 'select'"
            v-model="field.value"
            :disabled="data.confirmed || data.executing"
            class="w-full px-3 py-2 text-sm border border-gray-300 bg-white rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option v-for="opt in field.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>

          <!-- Validation Error -->
          <p v-if="validationErrors[field.key]" class="text-xs text-red-600 flex items-center gap-1">
            <i class="fa-solid fa-circle-exclamation"></i>
            {{ validationErrors[field.key] }}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div v-if="!data.confirmed" class="flex gap-2 mt-4 pt-3 border-t border-indigo-100">
        <button
          @click="handleConfirm"
          :disabled="!isValid || data.executing"
          class="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          <i v-if="data.executing" class="fa-solid fa-spinner fa-spin"></i>
          <i v-else class="fa-solid fa-check"></i>
          <span>{{ data.executing ? '执行中...' : '确认执行' }}</span>
        </button>
        <button
          @click="emit('cancel')"
          :disabled="data.executing"
          class="text-gray-600 text-sm px-4 hover:bg-white/70 rounded-lg transition disabled:opacity-50"
        >
          取消
        </button>
      </div>

      <!-- Confirmed State -->
      <div v-else class="mt-4 pt-3 border-t border-indigo-100 text-center">
        <span class="text-xs text-green-600 font-semibold">
          <i class="fa-solid fa-circle-check mr-1"></i> 参数已确认
        </span>
      </div>
    </div>
  </div>
</template>
