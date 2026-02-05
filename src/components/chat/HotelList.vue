<template>
  <div class="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 shadow-md border border-amber-200">
    <div class="flex items-center gap-2 mb-3">
      <i class="fa-solid fa-hotel text-amber-600"></i>
      <span class="font-semibold text-gray-800">{{ data.location }} 酒店推荐</span>
      <span class="text-xs text-gray-500">{{ data.checkInDate }}</span>
    </div>

    <div class="space-y-2 max-h-80 overflow-y-auto">
      <div
        v-for="hotel in data.hotels"
        :key="hotel.hotelId"
        class="bg-white rounded-lg p-3 border transition-all cursor-pointer hover:shadow-md"
        :class="[
          data.selected === hotel.hotelId 
            ? 'border-amber-500 bg-amber-50' 
            : 'border-gray-200 hover:border-amber-300'
        ]"
        @click="selectHotel(hotel.hotelId)"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-bold text-gray-800">{{ hotel.name }}</span>
              <span class="text-xs text-amber-600">
                <i v-for="i in hotel.star" :key="i" class="fa-solid fa-star"></i>
              </span>
              <span 
                v-for="tag in hotel.tags" 
                :key="tag"
                class="text-xs px-2 py-0.5 rounded-full"
                :class="getTagClass(tag)"
              >
                {{ tag }}
              </span>
            </div>
            <div class="text-sm text-gray-600 mb-1">
              <span class="text-amber-600 font-medium">{{ hotel.rating }}分</span>
              <span class="mx-1">·</span>
              <span>{{ hotel.roomType }}</span>
              <span class="mx-1">·</span>
              <span>{{ hotel.distance }}</span>
            </div>
            <div class="flex flex-wrap gap-1">
              <span 
                v-for="amenity in hotel.amenities" 
                :key="amenity"
                class="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
              >
                {{ amenity }}
              </span>
            </div>
          </div>
          <div class="text-right ml-3">
            <div class="text-lg font-bold text-orange-600">¥{{ hotel.price }}</div>
            <div class="text-xs text-gray-400">/晚</div>
            <div v-if="data.selected === hotel.hotelId" class="text-xs text-amber-600 mt-1">
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
        class="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <i class="fa-solid fa-check mr-1"></i>
        确认预订
      </button>
    </div>
    
    <div v-else class="mt-3 text-center text-sm text-green-600">
      <i class="fa-solid fa-lock mr-1"></i>
      已确认酒店：{{ data.hotels.find(h => h.hotelId === data.selected)?.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HotelListData } from '../../types'

const props = defineProps<{
  data: HotelListData
}>()

const emit = defineEmits<{
  selectHotel: [hotelId: string, scheduleId: string]
  confirmHotel: [hotelId: string, scheduleId: string]
}>()

function selectHotel(hotelId: string) {
  if (props.data.locked) return
  emit('selectHotel', hotelId, props.data.scheduleId)
}

function confirmSelection() {
  if (!props.data.selected) return
  emit('confirmHotel', props.data.selected, props.data.scheduleId)
}

function getTagClass(tag: string): string {
  if (tag === '推荐') return 'bg-amber-100 text-amber-700'
  if (tag === '性价比高') return 'bg-green-100 text-green-700'
  if (tag === '位置最佳') return 'bg-blue-100 text-blue-700'
  if (tag === '最便宜') return 'bg-emerald-100 text-emerald-700'
  if (tag === '高端之选') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-700'
}
</script>
