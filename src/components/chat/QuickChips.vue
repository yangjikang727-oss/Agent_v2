<script setup lang="ts">
defineProps<{
  chips: string[]
}>()

const emit = defineEmits<{
  select: [chip: string]
}>()
</script>

<template>
  <div v-if="chips.length > 0" class="quick-chips-container mb-4">
    <div 
      v-for="chip in chips" 
      :key="chip" 
      @click="emit('select', chip)"
      class="quick-chip"
    >
      {{ chip }}
    </div>
  </div>
</template>
