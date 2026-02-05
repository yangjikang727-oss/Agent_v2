<script setup lang="ts">
import type { TransportSelectorData, TransportOption } from '../../types'

defineProps<{
  data: TransportSelectorData
}>()

const emit = defineEmits<{
  select: [option: TransportOption]
}>()
</script>

<template>
  <div class="mt-4">
    <div class="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">
      请确认出行方式
    </div>
    <div class="transport-grid">
      <div 
        v-for="mode in data.options" 
        :key="mode.key"
        @click="!data.locked && emit('select', mode)"
        :class="[
          'transport-option',
          data.selected === mode.key ? 'active' : '',
          data.locked ? 'disabled' : ''
        ]"
      >
        <i :class="['fa-solid', mode.icon]"></i>
        <div class="label">{{ mode.label }}</div>
      </div>
    </div>
  </div>
</template>
