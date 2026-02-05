<script setup lang="ts">
defineProps<{
  top: number
}>()
</script>

<template>
  <div class="current-time-line" :style="{ top: top + 'px' }"></div>
</template>
