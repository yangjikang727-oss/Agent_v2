/**
 * Skill Tool Adapter - 将 Skill 系统适配为 ReAct 可用的工具
 * 
 * 作用：让 ReAct 引擎可以通过标准工具调用方式使用 Skill 系统
 */

import type { Tool, ToolContext, ToolResult } from '../toolRegistry'

// ==================== 简化的 Skill 工具适配器 ====================

/**
 * 简单的会议预定工具 - 直接实现核心功能
 */
export const bookMeetingRoomTool: Tool = {
  name: 'book_meeting_room',
  description: '预定会议室，创建会议日程',
  parameters: [
    {
      name: 'title',
      type: 'string',
      description: '会议主题',
      required: true
    },
    {
      name: 'date',
      type: 'string',
      description: '会议日期',
      required: true
    },
    {
      name: 'startTime',
      type: 'string',
      description: '开始时间',
      required: true
    },
    {
      name: 'endTime',
      type: 'string',
      description: '结束时间',
      required: false
    },
    {
      name: 'attendees',
      type: 'array',
      description: '参会人员列表',
      required: true
    },
    {
      name: 'location',
      type: 'string',
      description: '会议地点/会议室',
      required: false
    }
  ] as any,
  
  async execute(params: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    try {
      console.log('[BookMeetingRoomTool] 执行会议预定:', params)
      
      // 模拟会议创建
      const meetingId = `MTG-${Date.now()}`
      
      const result = {
        success: true,
        meetingId,
        title: params.title,
        date: params.date,
        time: `${params.startTime} - ${params.endTime || '待定'}`,
        location: params.location || '待分配',
        attendees: params.attendees,
        message: `会议「${params.title}」已创建成功，会议ID: ${meetingId}`
      }
      
      console.log('[BookMeetingRoomTool] 会议预定成功:', result)
      
      return {
        success: true,
        data: result
      }
      
    } catch (error) {
      console.error('[BookMeetingRoomTool] 执行异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }
}

/**
 * 简单的出差申请工具
 */
export const applyBusinessTripTool: Tool = {
  name: 'apply_business_trip',
  description: '申请出差，包括交通和住宿安排',
  parameters: [
    {
      name: 'destination',
      type: 'string',
      description: '出差目的地',
      required: true
    },
    {
      name: 'departure',
      type: 'string',
      description: '出发城市',
      required: true
    },
    {
      name: 'startDate',
      type: 'string',
      description: '出发日期',
      required: true
    },
    {
      name: 'endDate',
      type: 'string',
      description: '返回日期',
      required: false
    },
    {
      name: 'reason',
      type: 'string',
      description: '出差事由',
      required: true
    }
  ] as any,
  
  async execute(params: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    try {
      console.log('[ApplyBusinessTripTool] 执行出差申请:', params)
      
      // 模拟出差申请
      const tripId = `TRIP-${Date.now()}`
      
      const result = {
        success: true,
        tripId,
        destination: params.destination,
        departure: params.departure,
        startDate: params.startDate,
        endDate: params.endDate || params.startDate,
        reason: params.reason,
        status: '已提交审批',
        message: `出差申请已提交，申请ID: ${tripId}`
      }
      
      console.log('[ApplyBusinessTripTool] 出差申请成功:', result)
      
      return {
        success: true,
        data: result
      }
      
    } catch (error) {
      console.error('[ApplyBusinessTripTool] 执行异常:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
    }
  }
}