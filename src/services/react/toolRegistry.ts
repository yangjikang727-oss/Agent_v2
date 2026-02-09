/**
 * ReAct 模式 - 工具注册表
 * 管理 ReAct 引擎可用的所有工具
 * 
 * 支持多提供者架构:
 * - 本地工具 (LocalProvider)
 * - 远程 API 工具 (ApiProvider)
 * - 插件工具 (预留)
 */

import type { ToolProvider, ToolAdapter } from './toolAdapter'

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
  private providers: Map<string, ToolProvider> = new Map()
  
  /**
   * 注册工具提供者
   */
  registerProvider(provider: ToolProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`[ToolRegistry] 提供者 ${provider.id} 已存在，将被覆盖`)
    }
    this.providers.set(provider.id, provider)
    console.log(`[ToolRegistry] 提供者已注册: ${provider.id} (${provider.name})`)
  }
  
  /**
   * 获取提供者
   */
  getProvider(id: string): ToolProvider | undefined {
    return this.providers.get(id)
  }
  
  /**
   * 获取所有提供者
   */
  getAllProviders(): ToolProvider[] {
    return Array.from(this.providers.values())
  }
  
  /**
   * 移除提供者
   */
  unregisterProvider(id: string): boolean {
    const provider = this.providers.get(id)
    if (provider) {
      provider.destroy?.()
      this.providers.delete(id)
      console.log(`[ToolRegistry] 提供者已移除: ${id}`)
      return true
    }
    return false
  }
  
  /**
   * 注册工具（兼容旧版 API）
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] 工具 ${tool.name} 已存在，将被覆盖`)
    }
    this.tools.set(tool.name, tool)
    console.log(`[ToolRegistry] 工具已注册: ${tool.name}`)
  }
  
  /**
   * 获取工具（优先从本地查找，然后遍历提供者）
   */
  getTool(name: string): Tool | undefined {
    // 先从本地工具查找
    const localTool = this.tools.get(name)
    if (localTool) return localTool
    
    // 从提供者中查找并转换为 Tool 格式
    for (const provider of this.providers.values()) {
      const adapter = provider.getTool(name)
      if (adapter) {
        return this.adapterToTool(adapter)
      }
    }
    
    return undefined
  }
  
  /**
   * 获取所有工具（合并本地和提供者的工具）
   */
  getAllTools(): Tool[] {
    const allTools: Tool[] = Array.from(this.tools.values())
    
    // 添加提供者的工具
    for (const provider of this.providers.values()) {
      const providerTools = provider.getTools().map(adapter => this.adapterToTool(adapter))
      allTools.push(...providerTools)
    }
    
    return allTools
  }
  
  /**
   * 获取所有工具适配器（新版 API）
   */
  getAllAdapters(): ToolAdapter[] {
    const adapters: ToolAdapter[] = []
    
    for (const provider of this.providers.values()) {
      adapters.push(...provider.getTools())
    }
    
    return adapters
  }
  
  /**
   * 获取指定类别的工具
   */
  getToolsByCategory(category: string): Tool[] {
    return this.getAllTools().filter(tool => tool.category === category)
  }
  
  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    if (this.tools.has(name)) return true
    
    for (const provider of this.providers.values()) {
      if (provider.hasTool(name)) return true
    }
    
    return false
  }
  
  /**
   * 移除工具
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }
  
  /**
   * 清空所有工具和提供者
   */
  clear(): void {
    this.tools.clear()
    for (const provider of this.providers.values()) {
      provider.destroy?.()
    }
    this.providers.clear()
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
  
  /**
   * 健康检查所有提供者
   */
  async healthCheck(): Promise<{
    healthy: boolean
    providers: Record<string, { healthy: boolean; details?: any }>
  }> {
    const results: Record<string, { healthy: boolean; details?: any }> = {}
    
    for (const [id, provider] of this.providers) {
      if (provider.healthCheck) {
        results[id] = await provider.healthCheck()
      } else {
        results[id] = { healthy: true }
      }
    }
    
    const allHealthy = Object.values(results).every(r => r.healthy)
    
    return {
      healthy: allHealthy,
      providers: results
    }
  }
  
  /**
   * 将 ToolAdapter 转换为兼容的 Tool 格式
   */
  private adapterToTool(adapter: ToolAdapter): Tool {
    const def = adapter.getDefinition()
    return {
      name: def.name,
      description: def.description,
      parameters: def.parameters.map(p => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required,
        enum: p.enum,
        default: p.default
      })),
      execute: adapter.execute.bind(adapter),
      requireConfirmation: def.requireConfirmation,
      category: def.category as Tool['category']
    }
  }
}

// ==================== 全局工具注册表实例 ====================

export const toolRegistry = new ToolRegistry()

// ==================== Skill 工具动态注册 ====================
// Skill 工具将由 SkillProvider 动态从 SKILL.md 生成并注册
// 不再使用硬编码的工具定义

import { skillStore } from './skills/skillStore'

/**
 * 从 SKILL.md 动态注册 Skill 工具到 toolRegistry
 */
function registerSkillTools(): void {
  console.log('[ToolRegistry] 开始注册 Skill 工具...')
  
  // 加载所有 SKILL.md
  skillStore.loadAllSkills()
  
  // 获取所有 Skill 元数据
  const allMetadata = skillStore.getAllMetadata()
  
  // 为每个 Skill 创建工具
  for (const metadata of allMetadata) {
    const tool: Tool = {
      name: metadata.name,
      description: metadata.description,
      parameters: extractParametersFromSkill(metadata.name),
      category: metadata.category as Tool['category'],
      requireConfirmation: false,
      
      async execute(params: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
        const startTime = Date.now()
        
        try {
          console.log(`[SkillTool:${metadata.name}] 执行`, params)
          
          // 返回成功结果，包含 action 信息
          // ReAct 引擎将根据 action 触发 UI 动作
          return {
            success: true,
            data: {
              action: metadata.action,
              skillName: metadata.name,
              params,
              taskId: `${metadata.name.toUpperCase()}-${Date.now()}`,
              message: `已触发 ${metadata.description}`
            },
            metadata: {
              executionTime: Date.now() - startTime,
              toolName: metadata.name
            }
          }
        } catch (error) {
          console.error(`[SkillTool:${metadata.name}] 执行失败`, error)
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误',
            metadata: {
              executionTime: Date.now() - startTime,
              toolName: metadata.name
            }
          }
        }
      }
    }
    
    toolRegistry.registerTool(tool)
    console.log(`[ToolRegistry] 已注册 Skill 工具: ${metadata.name}`)
  }
  
  console.log(`[ToolRegistry] Skill 工具注册完成，共 ${allMetadata.length} 个`)
}

/**
 * 从 Skill 的 instruction 中提取参数定义
 */
function extractParametersFromSkill(skillName: string): ToolParameter[] {
  const instruction = skillStore.getInstruction(skillName)
  if (!instruction) return []
  
  const parameters: ToolParameter[] = []
  const instructions = instruction.instructions
  
  // 匹配参数表格（简化版：查找 ## 参数说明 后的所有行）
  const lines = instructions.split('\n')
  let inParamTable = false
  let skipHeaderRow = 0
  
  for (const line of lines) {
    if (line.includes('## 参数说明')) {
      inParamTable = true
      continue
    }
    
    if (inParamTable) {
      // 跳过表头和分隔线
      if (skipHeaderRow < 2) {
        skipHeaderRow++
        continue
      }
      
      // 遇到下一个标题，结束解析
      if (line.trim().startsWith('##')) {
        break
      }
      
      // 解析参数行
      if (line.trim().startsWith('|')) {
        const cells = line.split('|').map(cell => cell.trim()).filter(Boolean)
        if (cells.length >= 4) {
          const name = cells[0]
          const type = cells[1]
          const required = cells[2]
          const description = cells[3]
          
          if (name && type && required && description) {
            parameters.push({
              name: name.trim(),
              type: normalizeParamType(type.trim()),
              description: description.trim(),
              required: required.trim() === '是'
            })
          }
        }
      }
    }
  }
  
  const match = parameters.length > 0
  
  if (!match) {
    console.warn(`[ToolRegistry] Skill "${skillName}" 未找到参数表格`)
  }
  
  return parameters
}

/**
 * 规范化参数类型
 */
function normalizeParamType(type: string): 'string' | 'number' | 'boolean' | 'array' | 'object' {
  const lowerType = type.toLowerCase()
  
  if (lowerType.includes('array') || lowerType.includes('数组')) return 'array'
  if (lowerType.includes('number') || lowerType.includes('数字')) return 'number'
  if (lowerType.includes('bool') || lowerType.includes('布尔')) return 'boolean'
  if (lowerType.includes('object') || lowerType.includes('对象')) return 'object'
  
  return 'string'
}

// 自动注册 Skill 工具
registerSkillTools()

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
