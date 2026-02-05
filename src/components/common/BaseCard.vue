<script setup lang="ts">
withDefaults(defineProps<{
  glass?: boolean
  borderColor?: string
  padding?: string
}>(), {
  glass: true,
  borderColor: '',
  padding: 'p-4'
})
</script>

<template>
  <div 
    :class="[
      'rounded-2xl shadow-sm',
      glass ? 'glass-card' : 'bg-white border border-gray-200',
      padding,
      borderColor ? `border-l-4 ${borderColor}` : ''
    ]"
  >
    <slot></slot>
  </div>
</template>
