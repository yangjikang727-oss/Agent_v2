import type { Tool, ToolContext, ToolResult } from '../services/react/toolRegistry'

/**
 * 通知发送工具
 * 向用户或相关人员发送通知
 */
export const notificationSenderTool: Tool = {
  name: 'notification_sender',
  description: '发送各种类型的通知消息',
  category: 'communication',
  parameters: [
    {
      name: 'recipient',
      type: 'string',
      description: '接收者（用户ID、邮箱或手机号）',
      required: true
    },
    {
      name: 'message',
      type: 'string',
      description: '通知内容',
      required: true
    },
    {
      name: 'notificationType',
      type: 'string',
      description: '通知类型：email(邮件)、sms(短信)、push(推送)、in_app(站内信)',
      required: false,
      default: 'in_app',
      enum: ['email', 'sms', 'push', 'in_app']
    },
    {
      name: 'priority',
      type: 'string',
      description: '优先级：low(低)、normal(普通)、high(高)、urgent(紧急)',
      required: false,
      default: 'normal',
      enum: ['low', 'normal', 'high', 'urgent']
    }
  ],
  execute: async (params: Record<string, any>, _context: ToolContext): Promise<ToolResult> => {
    try {
      const { recipient, message, notificationType = 'in_app', priority = 'normal' } = params
      
      // 模拟发送通知
      const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // 模拟发送延迟
      await new Promise(resolve => setTimeout(resolve, 500))
      
      return {
        success: true,
        data: {
          notificationId,
          recipient,
          message,
          type: notificationType,
          priority,
          sentAt: new Date().toISOString(),
          status: 'sent'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `通知发送错误: ${(error as Error).message}`
      }
    }
  }
}