import type { Tool, ToolContext, ToolResult } from '../services/react/toolRegistry'

/**
 * 资源可用性检查工具
 * 检查会议室、车辆等资源在指定时间的可用性
 */
export const resourceCheckerTool: Tool = {
  name: 'resource_checker',
  description: '检查资源（会议室、车辆等）在指定时间的可用性',
  category: 'resource',
  parameters: [
    {
      name: 'resourceType',
      type: 'string',
      description: '资源类型：room(会议室)、car(车辆)、equipment(设备)',
      required: true,
      enum: ['room', 'car', 'equipment']
    },
    {
      name: 'date',
      type: 'string',
      description: '检查日期 (YYYY-MM-DD格式)',
      required: true
    },
    {
      name: 'startTime',
      type: 'string',
      description: '开始时间 (HH:MM格式)',
      required: true
    },
    {
      name: 'endTime',
      type: 'string',
      description: '结束时间 (HH:MM格式)',
      required: true
    },
    {
      name: 'location',
      type: 'string',
      description: '地点/区域筛选',
      required: false
    }
  ],
  execute: async (params: Record<string, any>, _context: ToolContext): Promise<ToolResult> => {
    try {
      const { resourceType, date, startTime, endTime, location } = params
      
      // 模拟资源数据库
      const mockResources = getMockResources(resourceType)
      
      // 过滤指定地点的资源
      let filteredResources = mockResources
      if (location) {
        filteredResources = mockResources.filter(r => 
          r.location.toLowerCase().includes(location.toLowerCase())
        )
      }
      
      // 检查可用性（基于确定性逻辑：根据时间段哈希判断可用性，确保同一查询结果一致）
      const availableResources = filteredResources.map(resource => {
        // 使用资源ID + 日期 + 时间段生成确定性可用状态
        const hash = simpleHash(`${resource.id}-${date}-${startTime}-${endTime}`)
        const isAvailable = hash % 10 >= 3 // 约 70% 可用，但结果确定性
        return {
          ...resource,
          isAvailable,
          bookingStatus: isAvailable ? 'available' : 'occupied'
        }
      })
      
      return {
        success: true,
        data: {
          resourceType,
          date,
          timeRange: `${startTime}-${endTime}`,
          totalResources: filteredResources.length,
          availableCount: availableResources.filter(r => r.isAvailable).length,
          resources: availableResources
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `资源检查错误: ${(error as Error).message}`
      }
    }
  }
}

/**
 * 意图分类工具
 * 使用LLM对用户输入进行意图分类
 */
export const intentClassifierTool: Tool = {
  name: 'intent_classifier',
  description: '使用LLM对用户输入进行意图分类和信息提取',
  category: 'utility',
  parameters: [
    {
      name: 'userInput',
      type: 'string',
      description: '用户输入的原始文本',
      required: true
    },
    {
      name: 'classificationType',
      type: 'string',
      description: '分类类型：intent(意图)、entity(实体)、sentiment(情感)',
      required: false,
      default: 'intent',
      enum: ['intent', 'entity', 'sentiment']
    }
  ],
  execute: async (params: Record<string, any>, _context: ToolContext): Promise<ToolResult> => {
    try {
      const { userInput, classificationType = 'intent' } = params
      
      // 这里应该调用LLM进行分类，暂时返回模拟结果
      const mockResults = {
        intent: {
          primaryIntent: detectPrimaryIntent(userInput),
          confidence: 0.85,
          extractedInfo: extractKeyInfo(userInput)
        },
        entity: {
          entities: extractEntities(userInput),
          confidence: 0.78
        },
        sentiment: {
          sentiment: analyzeSentiment(userInput),
          score: 0.6
        }
      }
      
      return {
        success: true,
        data: {
          input: userInput,
          classificationType,
          result: mockResults[classificationType as keyof typeof mockResults]
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `意图分类错误: ${(error as Error).message}`
      }
    }
  }
}

// ==================== 辅助函数 ====================

/**
 * 简单字符串哈希（确定性，同一输入始终返回同一结果）
 */
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * 获取模拟资源数据
 */
function getMockResources(type: string) {
  const resources: Record<string, any[]> = {
    room: [
      { id: 'r001', name: '大会议室A', capacity: 20, location: '3楼', type: 'room' },
      { id: 'r002', name: '中会议室B', capacity: 10, location: '2楼', type: 'room' },
      { id: 'r003', name: '小会议室C', capacity: 6, location: '1楼', type: 'room' }
    ],
    car: [
      { id: 'c001', name: '商务车1', capacity: 7, location: '停车场A', type: 'car' },
      { id: 'c002', name: '轿车2', capacity: 4, location: '停车场B', type: 'car' }
    ],
    equipment: [
      { id: 'e001', name: '投影仪A', type: 'equipment', location: '设备间' },
      { id: 'e002', name: '音响设备B', type: 'equipment', location: '设备间' }
    ]
  }
  
  return resources[type] || []
}

/**
 * 检测主要意图
 */
function detectPrimaryIntent(input: string): string {
  const inputLower = input.toLowerCase()
  
  if (inputLower.includes('会议') || inputLower.includes('开会')) {
    return 'schedule_meeting'
  }
  if (inputLower.includes('出差') || inputLower.includes('旅行')) {
    return 'schedule_trip'
  }
  if (inputLower.includes('查询') || inputLower.includes('查看')) {
    return 'query_schedule'
  }
  if (inputLower.includes('取消') || inputLower.includes('删除')) {
    return 'cancel_schedule'
  }
  
  return 'unknown'
}

/**
 * 提取关键信息
 */
function extractKeyInfo(input: string): Record<string, any> {
  const info: Record<string, any> = {}
  
  // 提取时间相关
  const timePattern = /(\d{1,2})[:：](\d{2})/
  const timeMatch = input.match(timePattern)
  if (timeMatch) {
    info.time = `${timeMatch[1]}:${timeMatch[2]}`
  }
  
  // 提取日期相关
  const datePatterns = [
    /今天|今日/,
    /明天|明日/,
    /后天/,
    /(\d{1,2})月(\d{1,2})日/
  ]
  
  for (const pattern of datePatterns) {
    const match = input.match(pattern)
    if (match) {
      info.date = match[0]
      break
    }
  }
  
  return info
}

/**
 * 提取实体
 */
function extractEntities(input: string): any[] {
  const entities: any[] = []
  
  // 简单的实体提取示例
  const peoplePattern = /[\u4e00-\u9fa5]{2,3}/g
  const matches = input.match(peoplePattern)
  
  if (matches) {
    matches.forEach(match => {
      if (match.length >= 2) {
        entities.push({
          type: 'PERSON',
          value: match,
          confidence: 0.8
        })
      }
    })
  }
  
  return entities
}

/**
 * 情感分析
 */
function analyzeSentiment(input: string): string {
  const positiveWords = ['好', '棒', '不错', '喜欢', '满意']
  const negativeWords = ['不好', '糟糕', '讨厌', '不满意', '麻烦']
  
  let score = 0
  positiveWords.forEach(word => {
    if (input.includes(word)) score += 1
  })
  negativeWords.forEach(word => {
    if (input.includes(word)) score -= 1
  })
  
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}