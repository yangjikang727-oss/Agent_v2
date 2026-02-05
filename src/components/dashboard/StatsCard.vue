<script setup lang="ts">
defineProps<{
  icon: string
  iconBg?: string
  value: number | string
  label: string
}>()
</script>

<template>
  <div class="glass-card rounded-2xl p-4 flex items-center gap-4 shadow-sm">
    <div 
      :class="[
        'w-12 h-12 rounded-xl text-white flex items-center justify-center shadow-lg',
        iconBg || 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200'
      ]"
    >
      <i :class="['fa-solid', icon, 'text-xl']"></i>
    </div>
    <div>
      <div class="text-2xl font-bold text-gray-800">{{ value }}</div>
      <div class="text-xs text-gray-500 font-medium">{{ label }}</div>
    </div>
  </div>
</template>
