<template>
  <BaseModal
    :show="visible"
    @close="handleClose"
    title="创建会议"
    width="600px"
  >
    <div class="meeting-form-container">
      <!-- 会议基本信息 -->
      <div class="form-section">
        <h3 class="section-title">会议基本信息</h3>
        
        <div class="form-grid">
          <!-- 会议主题 -->
          <div class="form-item">
            <label class="form-label">会议主题 *</label>
            <input
              v-model="formData.title"
              type="text"
              class="form-input"
              placeholder="请输入会议主题"
              @blur="validateField('title')"
            />
            <span v-if="errors.title" class="error-message">{{ errors.title }}</span>
          </div>

          <!-- 开始时间 -->
          <div class="form-item">
            <label class="form-label">开始时间 *</label>
            <input
              v-model="formData.startTime"
              type="datetime-local"
              class="form-input"
              @blur="validateField('startTime')"
            />
            <span v-if="errors.startTime" class="error-message">{{ errors.startTime }}</span>
          </div>

          <!-- 结束时间 -->
          <div class="form-item">
            <label class="form-label">结束时间 *</label>
            <input
              v-model="formData.endTime"
              type="datetime-local"
              class="form-input"
              @blur="validateField('endTime')"
            />
            <span v-if="errors.endTime" class="error-message">{{ errors.endTime }}</span>
          </div>

          <!-- 会议地点 -->
          <div class="form-item">
            <label class="form-label">会议地点 *</label>
            <input
              v-model="formData.location"
              type="text"
              class="form-input"
              placeholder="请输入具体会议室号或地点"
              @blur="validateField('location')"
            />
            <span v-if="errors.location" class="error-message">{{ errors.location }}</span>
          </div>

          <!-- 会议室类型 -->
          <div class="form-item">
            <label class="form-label">会议室类型 *</label>
            <select
              v-model="formData.roomType"
              class="form-select"
              @change="validateField('roomType')"
            >
              <option value="">请选择会议室类型</option>
              <option value="大型会议室">大型会议室</option>
              <option value="中型会议室">中型会议室</option>
              <option value="小型会议室">小型会议室</option>
              <option value="培训室">培训室</option>
              <option value="视频会议室">视频会议室</option>
              <option value="线上会议">线上会议</option>
            </select>
            <span v-if="errors.roomType" class="error-message">{{ errors.roomType }}</span>
          </div>
        </div>
      </div>

      <!-- 参会人员 -->
      <div class="form-section">
        <h3 class="section-title">参会人员</h3>
        <div class="attendees-section">
          <div class="attendee-input-area">
            <input
              v-model="newAttendee"
              type="text"
              class="form-input"
              placeholder="输入姓名或邮箱，按回车添加"
              @keyup.enter="addAttendee"
            />
            <BaseButton
              @click="addAttendee"
              size="sm"
              variant="primary"
            >
              添加
            </BaseButton>
          </div>
          
          <div class="attendee-list">
            <div
              v-for="(attendee, index) in formData.attendees"
              :key="index"
              class="attendee-tag"
            >
              <span class="attendee-name">{{ attendee }}</span>
              <button
                @click="removeAttendee(index)"
                class="remove-btn"
                type="button"
              >
                ×
              </button>
            </div>
            
            <div v-if="formData.attendees.length === 0" class="empty-state">
              暂无参会人员
            </div>
          </div>
        </div>
      </div>

      <!-- 会议备注 -->
      <div class="form-section">
        <h3 class="section-title">会议备注</h3>
        <textarea
          v-model="formData.remarks"
          class="form-textarea"
          rows="3"
          placeholder="请输入会议备注信息..."
        ></textarea>
      </div>

      <!-- 操作按钮 -->
      <div class="form-actions">
        <BaseButton
          @click="handleClose"
          variant="secondary"
          :disabled="isSubmitting"
        >
          取消
        </BaseButton>
        
        <BaseButton
          @click="handleSubmit"
          variant="primary"
          :loading="isSubmitting"
          :disabled="!isFormValid"
        >
          {{ isSubmitting ? '创建中...' : '创建会议' }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import BaseModal from '../common/BaseModal.vue'
import BaseButton from '../common/BaseButton.vue'

// ==================== Props 和 Emits ====================
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  initialData: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['close', 'submit'])

// ==================== 状态管理 ====================
const isSubmitting = ref(false)
const newAttendee = ref('')

const formData = reactive({
  title: '',
  startTime: '',
  endTime: '',
  location: '',
  roomType: '',
  attendees: [] as string[],
  remarks: ''
})

const errors = reactive<Record<string, string>>({
  title: '',
  startTime: '',
  endTime: '',
  location: '',
  roomType: ''
})

// ==================== 计算属性 ====================
const isFormValid = computed(() => {
  return (
    formData.title &&
    formData.startTime &&
    formData.endTime &&
    formData.location &&
    formData.roomType &&
    !Object.values(errors).some(error => error)
  )
})

// ==================== 方法 ====================

// 初始化表单数据
const initializeForm = () => {
  // 从初始数据填充表单
  if (props.initialData) {
    formData.title = props.initialData.title || ''
    formData.startTime = props.initialData.startTime || ''
    formData.endTime = props.initialData.endTime || ''
    formData.location = props.initialData.location || ''
    formData.roomType = props.initialData.roomType || ''
    formData.attendees = normalizeAttendees(props.initialData.attendees)
    formData.remarks = props.initialData.remarks || ''
  }
  
  // 清空错误
  clearErrors()
}

/**
 * 归一化参会人员列表
 * 兼容 LLM 传入的多种格式：
 * - 字符串: "杨继康，何珍珍，袁博文"
 * - 单元素数组: ["杨继康，何珍珍，袁博文"]
 * - 正常数组: ["杨继康", "何珍珍", "袁博文"]
 */
function normalizeAttendees(raw: any): string[] {
  if (!raw) return []
  
  // 字符串 → 按常见分隔符拆分
  if (typeof raw === 'string') {
    return raw.split(/[,，、;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
  }
  
  // 数组 → 对每个元素递归拆分（处理单元素包含多人的情况）
  if (Array.isArray(raw)) {
    return raw.flatMap((item: any) =>
      typeof item === 'string'
        ? item.split(/[,，、;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : [String(item)]
    )
  }
  
  return []
}

// 验证单个字段
const validateField = (fieldName: string) => {
  errors[fieldName] = ''
  
  switch (fieldName) {
    case 'title':
      if (!formData.title.trim()) {
        errors.title = '请输入会议主题'
      }
      break
      
    case 'startTime':
      if (!formData.startTime) {
        errors.startTime = '请选择开始时间'
      }
      break
      
    case 'endTime':
      if (!formData.endTime) {
        errors.endTime = '请选择结束时间'
      } else if (formData.startTime && new Date(formData.endTime) <= new Date(formData.startTime)) {
        errors.endTime = '结束时间必须晚于开始时间'
      }
      break
      
    case 'location':
      if (!formData.location) {
        errors.location = '请输入会议地点'
      }
      break
      
    case 'roomType':
      if (!formData.roomType) {
        errors.roomType = '请选择会议室类型'
      }
      break
  }
}

// 清空所有错误
const clearErrors = () => {
  Object.keys(errors).forEach(key => {
    errors[key] = ''
  })
}

// 添加参会人员
const addAttendee = () => {
  const trimmedAttendee = newAttendee.value.trim()
  if (trimmedAttendee && !formData.attendees.includes(trimmedAttendee)) {
    formData.attendees.push(trimmedAttendee)
    newAttendee.value = ''
  }
}

// 删除参会人员
const removeAttendee = (index: number) => {
  formData.attendees.splice(index, 1)
}

// 表单验证
const validateForm = () => {
  // 验证所有必填字段
  validateField('title')
  validateField('startTime')
  validateField('endTime')
  validateField('location')
  validateField('roomType')
  
  return !Object.values(errors).some(error => error)
}

// 提交表单
const handleSubmit = async () => {
  if (!validateForm()) {
    return
  }
  
  isSubmitting.value = true
  
  try {
    // 构造提交数据
    const submitData = {
      ...formData,
      attendees: [...formData.attendees]
    }
    
    // 触发提交事件
    emit('submit', submitData)
    
  } catch (error) {
    console.error('创建会议失败:', error)
  } finally {
    isSubmitting.value = false
  }
}

// 关闭模态框
const handleClose = () => {
  emit('close')
}

// ==================== 监听器 ====================
watch(() => props.visible, (newVal) => {
  if (newVal) {
    initializeForm()
  }
})

watch(() => props.initialData, () => {
  if (props.visible) {
    initializeForm()
  }
}, { deep: true })
</script>

<style scoped>
.meeting-form-container {
  padding: 20px;
}

.form-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e5e7eb;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.form-input,
.form-select,
.form-textarea {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s ease;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.error-message {
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
}

.attendees-section {
  margin-top: 12px;
}

.attendee-input-area {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.attendee-input-area .form-input {
  flex: 1;
}

.attendee-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 40px;
  padding: 8px;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  background-color: #f9fafb;
}

.attendee-tag {
  display: flex;
  align-items: center;
  background-color: #e0f2fe;
  border: 1px solid #0ea5e9;
  border-radius: 16px;
  padding: 4px 12px;
}

.attendee-name {
  font-size: 13px;
  color: #0c4a6e;
  margin-right: 6px;
}

.remove-btn {
  background: none;
  border: none;
  color: #0c4a6e;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.remove-btn:hover {
  background-color: rgba(12, 74, 110, 0.1);
}

.empty-state {
  color: #9ca3af;
  font-size: 14px;
  font-style: italic;
  align-self: center;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
  margin-top: 20px;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  
  .attendee-input-area {
    flex-direction: column;
  }
  
  .form-actions {
    flex-direction: column;
  }
}
</style>