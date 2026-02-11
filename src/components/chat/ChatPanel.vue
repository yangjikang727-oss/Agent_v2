<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import type { Message, Task, ResourceCardData, TransportSelectorData, AttendeeTableData, TransportOption, ParamConfirmData, ScheduleListData, FlightListData, HotelListData, TripApplicationData, NotifyOptionData, Schedule, ConflictResolutionData, ScheduleQueryResultData, CreateMeetingData, CancelConfirmData, EditConfirmData } from '../../types'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'
import QuickChips from './QuickChips.vue'
import ActionList from './ActionList.vue'
import ResourceCard from './ResourceCard.vue'
import TransportSelector from './TransportSelector.vue'
import AttendeeTable from './AttendeeTable.vue'
import SkillParamConfirm from './SkillParamConfirm.vue'
import ScheduleList from './ScheduleList.vue'
import FlightList from './FlightList.vue'
import HotelList from './HotelList.vue'
import TripApplication from './TripApplication.vue'
import NotifyOption from './NotifyOption.vue'
import PaymentOrderList from './PaymentOrderList.vue'
import ConflictResolver from './ConflictResolver.vue'
import ScheduleQueryResult from './ScheduleQueryResult.vue'
import CreateMeetingForm from './CreateMeetingForm.vue'
import CancelConfirm from './CancelConfirm.vue'
import EditConfirm from './EditConfirm.vue'

const props = defineProps<{
  messages: Message[]
  isThinking: boolean
  isCallingLLM: boolean
  thinkingText: string
  statusText: string
  quickSuggestions: string[]
  isRecording: boolean
  placeholder?: string
  transcript?: string
  speechError?: string
  speechSupported?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  toggleRecording: []
  reset: []
  openConfig: []
  executeTask: [task: Task]
  skipTask: [task: Task]
  confirmResource: [data: ResourceCardData, msgId: number]
  dismissResource: [msgId: number]
  selectTransport: [option: TransportOption, msgId: number, data: TransportSelectorData]
  selectFlight: [flightNo: string, scheduleId: string, msgId: number]
  confirmFlight: [flightNo: string, scheduleId: string, msgId: number]
  cancelFlight: [scheduleId: string, msgId: number]
  selectHotel: [hotelId: string, scheduleId: string, msgId: number]
  confirmHotel: [hotelId: string, scheduleId: string, msgId: number]
  cancelHotel: [scheduleId: string, msgId: number]
  submitTripApplication: [data: TripApplicationData, msgId: number]
  selectNotifyOption: [option: 'now' | 'before_15min', scheduleId: string, msgId: number]
  skipNotify: [scheduleId: string, msgId: number]
  removeAttendee: [msgId: number, uid: string]
  restoreAttendee: [msgId: number, uid: string]
  confirmAttendees: [msgId: number, data: AttendeeTableData]
  confirmSkillParams: [params: Record<string, string | number>, msgId: number, data: ParamConfirmData]
  cancelSkillParams: [msgId: number]
  selectScheduleToEdit: [schedule: Schedule]
  selectConflictSlot: [slotIndex: number, data: ConflictResolutionData, msgId: number]
  acceptConflictNearest: [data: ConflictResolutionData, msgId: number]
  showMoreConflictSlots: [data: ConflictResolutionData, msgId: number]
  cancelConflict: [data: ConflictResolutionData, msgId: number]
  selectConflictCustomDate: [date: string, data: ConflictResolutionData, msgId: number]
  selectConflictAdjustTarget: [target: 'existing' | 'new', data: ConflictResolutionData, msgId: number]
  payAll: [data: import('../../types/message').PaymentOrderData, msgId: number]
  changeOrder: [orderId: string, orderType: 'flight' | 'hotel', data: import('../../types/message').PaymentOrderData, msgId: number]
  submitMeeting: [data: CreateMeetingData, msgId: number]
  confirmCancelSchedule: [scheduleId: string, msgId: number]
  reselectCancelSchedule: [scheduleId: string, msgId: number]
  confirmEditSchedule: [scheduleId: string, msgId: number]
  reselectEditSchedule: [scheduleId: string, msgId: number]
}>()

const chatBoxRef = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (chatBoxRef.value) {
      chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight
    }
  })
}

// 监听消息变化自动滚动
watch(() => props.messages.length, () => {
  scrollToBottom()
})

// 使用建议
function useSuggestion(chip: string) {
  emit('send', chip)
  if (inputRef.value) {
    inputRef.value.clear()
  }
}

// 判断消息类型
function isActionList(msg: Message): msg is Message & { data: Task[] } {
  return msg.type === 'action_list' && Array.isArray(msg.data)
}

function isResourceCard(msg: Message): msg is Message & { data: ResourceCardData } {
  return msg.type === 'resource_card' && msg.data !== null && 'resourceType' in (msg.data as object)
}

function isTransportSelector(msg: Message): msg is Message & { data: TransportSelectorData } {
  return msg.type === 'transport_selector' && msg.data !== null && 'options' in (msg.data as object)
}

function isAttendeeTable(msg: Message): msg is Message & { data: AttendeeTableData } {
  return msg.type === 'attendee_table' && msg.data !== null && 'rows' in (msg.data as object)
}

function isParamConfirm(msg: Message): msg is Message & { data: ParamConfirmData } {
  return msg.type === 'param_confirm' && msg.data !== null && 'fields' in (msg.data as object)
}

function isScheduleList(msg: Message): msg is Message & { data: ScheduleListData } {
  return msg.type === 'schedule_list' && msg.data !== null && 'schedules' in (msg.data as object)
}

function isFlightList(msg: Message): msg is Message & { data: FlightListData } {
  return msg.type === 'flight_list' && msg.data !== null && 'flights' in (msg.data as object)
}

function isHotelList(msg: Message): msg is Message & { data: HotelListData } {
  return msg.type === 'hotel_list' && msg.data !== null && 'hotels' in (msg.data as object)
}

function isTripApplication(msg: Message): msg is Message & { data: TripApplicationData } {
  return msg.type === 'trip_application' && msg.data !== null && 'reason' in (msg.data as object)
}

function isNotifyOption(msg: Message): msg is Message & { data: NotifyOptionData } {
  return msg.type === 'notify_option' && msg.data !== null && 'attendees' in (msg.data as object)
}

function isPaymentOrder(msg: Message): msg is Message & { data: import('../../types').PaymentOrderData } {
  return msg.type === 'payment_order' && msg.data !== null && 'orders' in (msg.data as object)
}

function isConflictResolution(msg: Message): msg is Message & { data: ConflictResolutionData } {
  return msg.type === 'conflict_resolution' && msg.data !== null && 'availableSlots' in (msg.data as object)
}

function isScheduleQueryResult(msg: Message): msg is Message & { data: ScheduleQueryResultData } {
  return msg.type === 'schedule_query_result' && msg.data !== null && 'schedules' in (msg.data as object) && 'summary' in (msg.data as object)
}

function isCreateMeeting(msg: Message): msg is Message & { data: CreateMeetingData } {
  return msg.type === 'create_meeting' && msg.data !== null && 'title' in (msg.data as object) && 'status' in (msg.data as object)
}

function isCancelConfirm(msg: Message): msg is Message & { data: CancelConfirmData } {
  return msg.type === 'cancel_confirm' && msg.data !== null && 'userAction' in (msg.data as object)
}

function isEditConfirm(msg: Message): msg is Message & { data: EditConfirmData } {
  return msg.type === 'edit_confirm' && msg.data !== null && 'userAction' in (msg.data as object)
}

defineExpose({
  scrollToBottom
})
</script>

<template>
  <div class="bg-white border-r border-gray-200 flex flex-col h-full relative z-20 shadow-xl">
    <!-- Header -->
    <div class="p-5 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center text-white shadow-lg relative overflow-hidden group">
          <i class="fa-solid fa-brain relative z-10 text-lg"></i>
          <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
        </div>
        <div>
          <h1 class="font-bold text-gray-900 text-lg tracking-tight">
            日程管理Agent 
            <span class="ml-1 text-indigo-600 text-[10px] bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 font-bold uppercase">
              Pro
            </span>
          </h1>
          <div class="flex items-center gap-2 mt-0.5">
            <span :class="['w-2 h-2 rounded-full animate-pulse', isThinking ? 'bg-purple-500' : (isCallingLLM ? 'bg-emerald-500' : 'bg-blue-500')]"></span>
            <p class="text-xs font-medium" :class="isCallingLLM ? 'text-emerald-600' : 'text-gray-500'">{{ statusText }}</p>
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <button 
          @click="emit('reset')" 
          class="w-9 h-9 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition" 
          title="清空会话"
        >
          <i class="fa-solid fa-trash-can"></i>
        </button>
        <button 
          @click="emit('openConfig')" 
          class="w-9 h-9 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 flex items-center justify-center transition" 
          title="配置中心"
        >
          <i class="fa-solid fa-sliders"></i>
        </button>
      </div>
    </div>

    <!-- Chat Area -->
    <div ref="chatBoxRef" class="flex-1 overflow-y-auto min-h-0 p-5 space-y-6 bg-gray-50/50 chat-scroll-container">
      <!-- Empty State -->
      <div v-if="messages.length === 0" class="text-center mt-20 opacity-60">
        <div class="w-24 h-24 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <i class="fa-solid fa-wand-magic-sparkles text-4xl text-indigo-300"></i>
        </div>
        <p class="text-gray-600 font-semibold text-lg">Gemini 智能助理已就绪</p>
        <div class="text-sm text-gray-400 mt-3 space-y-1">
          <p>"安排下周一上午10点和王总开会"</p>
          <p>"下周五坐<b>轮船</b>去大连出差"</p>
          <p>"明天去海南岛团建"</p>
        </div>
      </div>

      <!-- Messages -->
      <TransitionGroup name="slide-up">
        <ChatMessage 
          v-for="msg in messages" 
          :key="msg.id" 
          :message="msg"
        >
          <!-- Action List -->
          <ActionList 
            v-if="isActionList(msg)"
            :tasks="msg.data"
            @execute="emit('executeTask', $event)"
            @skip="emit('skipTask', $event)"
          />

          <!-- Resource Card -->
          <ResourceCard 
            v-if="isResourceCard(msg)"
            :data="msg.data"
            @confirm="emit('confirmResource', $event, msg.id)"
            @dismiss="emit('dismissResource', msg.id)"
          />

          <!-- Transport Selector -->
          <TransportSelector 
            v-if="isTransportSelector(msg)"
            :data="msg.data"
            @select="emit('selectTransport', $event, msg.id, msg.data)"
          />

          <!-- Attendee Table -->
          <AttendeeTable 
            v-if="isAttendeeTable(msg)"
            :data="msg.data"
            @remove="emit('removeAttendee', msg.id, $event)"
            @restore="emit('restoreAttendee', msg.id, $event)"
            @confirm="emit('confirmAttendees', msg.id, $event)"
          />

          <!-- Skill Param Confirm -->
          <SkillParamConfirm
            v-if="isParamConfirm(msg)"
            :data="msg.data"
            @confirm="emit('confirmSkillParams', $event, msg.id, msg.data)"
            @cancel="emit('cancelSkillParams', msg.id)"
          />

          <!-- Schedule List -->
          <ScheduleList
            v-if="isScheduleList(msg)"
            :schedules="msg.data.schedules"
            @select="emit('selectScheduleToEdit', $event)"
          />

          <!-- Flight List -->
          <FlightList
            v-if="isFlightList(msg)"
            :data="msg.data"
            @selectFlight="emit('selectFlight', $event, msg.data.scheduleId, msg.id)"
            @confirmFlight="emit('confirmFlight', $event, msg.data.scheduleId, msg.id)"
            @cancelFlight="emit('cancelFlight', msg.data.scheduleId, msg.id)"
          />

          <!-- Hotel List -->
          <HotelList
            v-if="isHotelList(msg)"
            :data="msg.data"
            @selectHotel="emit('selectHotel', $event, msg.data.scheduleId, msg.id)"
            @confirmHotel="emit('confirmHotel', $event, msg.data.scheduleId, msg.id)"
            @cancelHotel="emit('cancelHotel', msg.data.scheduleId, msg.id)"
          />

          <!-- Trip Application -->
          <TripApplication
            v-if="isTripApplication(msg)"
            :data="msg.data"
            @submit="emit('submitTripApplication', $event, msg.id)"
          />

          <!-- Notify Option -->
          <NotifyOption
            v-if="isNotifyOption(msg)"
            :data="msg.data"
            @select="(opt) => emit('selectNotifyOption', opt, msg.data.scheduleId, msg.id)"
            @skip="() => emit('skipNotify', msg.data.scheduleId, msg.id)"
          />

          <!-- Payment Order List -->
          <PaymentOrderList
            v-if="isPaymentOrder(msg)"
            :data="msg.data"
            @payAll="(data) => emit('payAll', data, msg.id)"
            @changeOrder="(orderId, orderType, data) => emit('changeOrder', orderId, orderType, data, msg.id)"
          />

          <!-- Conflict Resolution -->
          <ConflictResolver
            v-if="isConflictResolution(msg)"
            :data="msg.data"
            @selectSlot="(idx, data) => emit('selectConflictSlot', idx, data, msg.id)"
            @acceptNearest="(data) => emit('acceptConflictNearest', data, msg.id)"
            @showMoreSlots="(data) => emit('showMoreConflictSlots', data, msg.id)"
            @cancelConflict="(data) => emit('cancelConflict', data, msg.id)"
            @selectCustomDate="(date, data) => emit('selectConflictCustomDate', date, data, msg.id)"
            @selectAdjustTarget="(target, data) => emit('selectConflictAdjustTarget', target, data, msg.id)"
          />

          <!-- Schedule Query Result -->
          <ScheduleQueryResult
            v-if="isScheduleQueryResult(msg)"
            :data="msg.data"
          />

          <!-- Create Meeting Form -->
          <CreateMeetingForm
            v-if="isCreateMeeting(msg)"
            :data="msg.data"
            @submit="(data) => emit('submitMeeting', data, msg.id)"
          />

          <!-- Cancel Confirm -->
          <CancelConfirm
            v-if="isCancelConfirm(msg)"
            :data="msg.data"
            @confirm="(id) => emit('confirmCancelSchedule', id, msg.id)"
            @reselect="(id) => emit('reselectCancelSchedule', id, msg.id)"
          />

          <!-- Edit Confirm -->
          <EditConfirm
            v-if="isEditConfirm(msg)"
            :data="msg.data"
            @confirm="(id) => emit('confirmEditSchedule', id, msg.id)"
            @reselect="(id) => emit('reselectEditSchedule', id, msg.id)"
          />
        </ChatMessage>
      </TransitionGroup>

      <!-- Thinking Indicator -->
      <div v-if="isThinking" class="flex ml-12 items-center gap-2">
        <div class="bg-white border border-gray-100 shadow-sm rounded-full px-4 py-2 flex gap-1.5">
          <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
          <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
          <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
        </div>
        <span class="text-xs text-indigo-400 animate-pulse font-medium">{{ thinkingText }}</span>
      </div>
    </div>

    <!-- Input Area -->
    <div class="p-5 bg-white border-t border-gray-100 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
      <QuickChips 
        :chips="quickSuggestions"
        @select="useSuggestion"
      />
      <ChatInput 
        ref="inputRef"
        :is-recording="isRecording"
        :placeholder="placeholder"
        :transcript="transcript"
        :speech-error="speechError"
        :speech-supported="speechSupported"
        @send="emit('send', $event)"
        @toggle-recording="emit('toggleRecording')"
      />
    </div>
  </div>
</template>
