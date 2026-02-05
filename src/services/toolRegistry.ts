import type { Schedule, Task } from '../types'

// ==================== 工具类型定义 ====================

/** 工具参数定义 */
export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required?: boolean
  enum?: string[]
  default?: any
}

/** 工具执行上下文 */
export interface ToolContext {
  userId: string
  currentDate: string
  scheduleStore: any // 实际类型将在集成时确定
  taskStore: any
  config: any
}

/** 工具执行结果 */
export interface ToolResult {
  success: boolean
  data?: any
  error?: string
  metadata?: {
    executionTime: number
    toolName: string
  }
}

/** 工具接口 */
export interface Tool {
  /** 工具唯一标识 */
  name: string
  
  /** 工具描述 */
  description: string
  
  /** 工具参数定义 */
  parameters: ToolParameter[]
  
  /** 工具执行函数 */
  execute: (params: Record<string, any>, context: ToolContext) => Promise<ToolResult>
  
  /** 是否需要用户确认 */
  requireConfirmation?: boolean
  
  /** 工具类别 */
  category?: 'schedule' | 'query' | 'resource' | 'utility' | 'communication'
}

// ==================== 工具注册表 ====================

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map()
  
  /**
   * 注册工具
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具 ${tool.name} 已存在，将被覆盖`)
    }
    this.tools.set(tool.name, tool)
    console.log(`[ToolRegistry] 工具已注册: ${tool.name}`)
  }
  
  /**
   * 获取工具
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name)
  }
  
  /**
   * 获取所有工具
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values())
  }
  
  /**
   * 获取指定类别的工具
   */
  getToolsByCategory(category: string): Tool[] {
    return Array.from(this.tools.values()).filter(tool => tool.category === category)
  }
  
  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }
  
  /**
   * 移除工具
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }
  
  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear()
  }
  
  /**
   * 获取工具列表摘要（用于提示词）
   */
  getToolsSummary(): string {
    const tools = this.getAllTools()
    return tools.map(tool => {
      const params = tool.parameters.map(p => 
        `${p.name}:${p.type}${p.required ? '*' : ''}`
      ).join(', ')
      
      return `${tool.name}[${params}]: ${tool.description}`
    }).join('\n')
  }
}

// ==================== 全局工具注册表实例 ====================

export const toolRegistry = new ToolRegistry()

// ==================== 工具执行辅助函数 ====================

/**
 * 安全执行工具
 */
export async function executeTool(
  toolName: string,
  params: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = toolRegistry.getTool(toolName)
  
  if (!tool) {
    return {
      success: false,
      error: `工具 "${toolName}" 不存在`,
      metadata: {
        executionTime: 0,
        toolName
      }
    }
  }
  
  const startTime = Date.now()
  
  try {
    // 验证必需参数
    const missingParams: string[] = []
    tool.parameters.forEach(param => {
      if (param.required && !(param.name in params)) {
        missingParams.push(param.name)
      }
    })
    
    if (missingParams.length > 0) {
      return {
        success: false,
        error: `缺少必需参数: ${missingParams.join(', ')}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName
        }
      }
    }
    
    // 执行工具
    const result = await tool.execute(params, context)
    
    return {
      ...result,
      metadata: {
        executionTime: Date.now() - startTime,
        toolName
      }
    }
  } catch (error) {
    console.error(`[ToolRegistry] 工具执行失败: ${toolName}`, error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      metadata: {
        executionTime: Date.now() - startTime,
        toolName
      }
    }
  }
}

/**
 * 批量执行工具
 */
export async function executeTools(
  toolCalls: Array<{ name: string; params: Record<string, any> }>,
  context: ToolContext
): Promise<ToolResult[]> {
  return Promise.all(
    toolCalls.map(call => executeTool(call.name, call.params, context))
  )
}