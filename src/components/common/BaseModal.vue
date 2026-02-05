<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  show: boolean
  title?: string
  width?: string
}>(), {
  title: '',
  width: 'max-w-sm'
})

const emit = defineEmits<{
  close: []
}>()

const widthClass = computed(() => props.width)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div 
        v-if="show" 
        class="fixed inset-0 z-[150] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="emit('close')"
      >
        <div 
          :class="['bg-white rounded-2xl shadow-2xl w-full animate-[scaleIn_0.2s_ease-out] overflow-hidden', widthClass]"
        >
          <!-- Header -->
          <div v-if="title || $slots.header" class="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <slot name="header">
              <h3 class="font-bold text-gray-800">{{ title }}</h3>
            </slot>
            <button 
              @click="emit('close')" 
              class="text-gray-400 hover:text-gray-600 transition"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="p-6">
            <slot></slot>
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="p-4 border-t border-gray-100 bg-gray-50">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
