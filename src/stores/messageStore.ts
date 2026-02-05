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

  // 添加消息
  function addMessage(message: Omit<Message, 'id'>) {
    messages.value.push({
      ...message,
      id: Date.now()
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
    const msg = messages.value.find(m => m.id === id)
    if (msg) {
      Object.assign(msg, updates)
    }
  }

  // 获取消息
  function getMessage(id: number): Message | undefined {
    return messages.value.find(m => m.id === id)
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
