<template>
  <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 shadow-md border border-blue-200">
    <div class="flex items-center gap-2 mb-3">
      <i class="fa-solid fa-plane-departure text-blue-600"></i>
      <span class="font-semibold text-gray-800">{{ data.from }} → {{ data.to }}</span>
      <span class="text-xs text-gray-500">{{ data.date }}</span>
    </div>

    <div class="space-y-2">
      <div
        v-for="flight in data.flights"
        :key="flight.flightNo"
        class="bg-white rounded-lg p-3 border transition-all cursor-pointer hover:shadow-md"
        :class="[
          data.selected === flight.flightNo 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-200 hover:border-blue-300'
        ]"
        @click="selectFlight(flight.flightNo)"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-bold text-gray-800">{{ flight.flightNo }}</span>
              <span class="text-xs text-gray-500">{{ flight.airline }}</span>
              <span 
                v-for="tag in flight.tags" 
                :key="tag"
                class="text-xs px-2 py-0.5 rounded-full"
                :class="getTagClass(tag)"
              >
                {{ tag }}
              </span>
            </div>
            <div class="flex items-center gap-4 text-sm">
              <div>
                <span class="font-semibold text-blue-600">{{ flight.departTime }}</span>
                <span class="text-gray-400 mx-1">→</span>
                <span class="font-semibold text-green-600">{{ flight.arriveTime }}</span>
              </div>
              <span class="text-gray-500">{{ flight.duration }}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-lg font-bold text-orange-600">¥{{ flight.price }}</div>
            <div v-if="data.selected === flight.flightNo" class="text-xs text-blue-600 mt-1">
              <i class="fa-solid fa-circle-check"></i> 已选择
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!data.locked" class="mt-3 flex gap-2">
      <button
        v-if="data.selected"
        @click="confirmSelection"
        class="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <i class="fa-solid fa-check mr-1"></i>
        确认预订
      </button>
    </div>
    
    <div v-else class="mt-3 text-center text-sm text-green-600">
      <i class="fa-solid fa-lock mr-1"></i>
      已确认航班：{{ data.flights.find(f => f.flightNo === data.selected)?.flightNo }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FlightListData } from '../../types'

const props = defineProps<{
  data: FlightListData
}>()

const emit = defineEmits<{
  selectFlight: [flightNo: string, scheduleId: string]
  confirmFlight: [flightNo: string, scheduleId: string]
}>()

function selectFlight(flightNo: string) {
  if (props.data.locked) return
  emit('selectFlight', flightNo, props.data.scheduleId)
}

function confirmSelection() {
  if (!props.data.selected) return
  emit('confirmFlight', props.data.selected, props.data.scheduleId)
}

function getTagClass(tag: string): string {
  if (tag === '推荐') return 'bg-blue-100 text-blue-700'
  if (tag === '最便宜') return 'bg-green-100 text-green-700'
  if (tag === '最快') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-700'
}
</script>
