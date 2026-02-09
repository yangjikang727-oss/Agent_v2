import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message, MessageType, AttendeeRow } from '../types'

export const useMessageStore = defineStore('message', () => {
  // 状态
  const messages = ref<Message[]>([
    { 
      id: 0, 
      role: 'system', 
      type: 'text', 
      content: '日程管理Agent 已启动。' 
    }
  ])

  // 自增计数器，避免 Date.now() 在同毫秒内产生重复 ID
  let nextId = 1

  // 添加消息
  function addMessage(message: Omit<Message, 'id'>) {
    const newMessage = {
      ...message,
      id: nextId++
    }
    messages.value.push(newMessage)
    console.log('[MessageStore] ➕ 添加消息:', {
      id: newMessage.id,
      type: newMessage.type,
      role: newMessage.role,
      contentPreview: typeof newMessage.content === 'string' 
        ? newMessage.content.substring(0, 50) + (newMessage.content.length > 50 ? '...' : '')
        : `[${newMessage.type}]`,
      hasData: !!newMessage.data
    })
  }

  // 添加用户消息
  function addUserMessage(content: string) {
    addMessage({
      role: 'user',
      type: 'text',
      content
    })
  }

  // 添加系统消息
  function addSystemMessage(content: string, thoughts?: string[]) {
    addMessage({
      role: 'system',
      type: 'text',
      content,
      thoughts
    })
  }

  // 添加带数据的消息
  function addDataMessage(type: MessageType, content: string, data: Message['data'], thoughts?: string[]) {
    addMessage({
      role: 'system',
      type,
      content,
      data,
      thoughts
    })
  }

  // 更新消息
  function updateMessage(id: number, updates: Partial<Message>) {
    console.log('[MessageStore] ✏️ 更新消息:', id, '更新内容:', Object.keys(updates))
    const msg = messages.value.find(m => m.id === id)
    if (msg) {
      Object.assign(msg, updates)
      console.log('[MessageStore] ✓ 消息已更新')
    } else {
      console.error('[MessageStore] ✗ 未找到消息:', id)
    }
  }

  // 获取消息
  function getMessage(id: number): Message | undefined {
    const msg = messages.value.find(m => m.id === id)
    if (!msg) {
      console.warn('[MessageStore] ⚠ getMessage: 未找到消息', id)
    }
    return msg
  }

  // 更新参会人表格行
  function updateAttendeeRow(msgId: number, uid: string, updates: Partial<AttendeeRow>) {
    const msg = messages.value.find(m => m.id === msgId)
    if (msg && msg.data && 'rows' in msg.data) {
      const row = msg.data.rows.find((r: AttendeeRow) => r.uid === uid)
      if (row) {
        Object.assign(row, updates)
      }
    }
  }

  // 清空消息
  function clearMessages() {
    messages.value = [
      { 
        id: 0, 
        role: 'system', 
        type: 'text', 
        content: '会话已重置。' 
      }
    ]
  }

  return {
    // 状态
    messages,
    // 方法
    addMessage,
    addUserMessage,
    addSystemMessage,
    addDataMessage,
    updateMessage,
    getMessage,
    updateAttendeeRow,
    clearMessages
  }
})
