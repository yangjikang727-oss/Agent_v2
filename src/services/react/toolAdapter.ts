/**
 * 工具适配器接口 - 统一本地工具和远程 API 工具的调用方式
 * 
 * 架构说明:
 * - ToolAdapter: 工具执行的统一接口
 * - ToolProvider: 工具来源的抽象（本地/远程）
 * - ApiToolConfig: 远程 API 工具的配置
 */

import type { ToolContext, ToolResult, Tool } from './toolRegistry'

// ==================== 工具适配器类型 ====================

/** 工具类型枚举 */
export type ToolType = 'local' | 'api' | 'webhook' | 'grpc'

/** 工具元数据 */
export interface ToolMeta {
  /** 工具唯一标识 */
  name: string
  /** 工具描述 */
  description: string
  /** 工具类型 */
  type: ToolType
  /** 工具版本 */
  version?: string
  /** 工具提供者 */
  provider?: string
  /** 工具类别 */
  category?: string
  /** 是否需要用户确认 */
  requireConfirmation?: boolean
  /** 工具标签 */
  tags?: string[]
}

/** 工具参数 Schema (JSON Schema 兼容) */
export interface ToolParameterSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required?: boolean
  enum?: string[]
  default?: any
  /** JSON Schema 扩展属性 */
  format?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  items?: ToolParameterSchema
  properties?: Record<string, ToolParameterSchema>
}

/** 工具定义（扩展版） */
export interface ToolDefinition extends ToolMeta {
  /** 参数定义 */
  parameters: ToolParameterSchema[]
  /** 返回值描述 */
  returns?: {
    type: string
    description: string
  }
}

// ==================== 工具适配器接口 ====================

/**
 * 工具适配器接口 - 所有工具执行器必须实现此接口
 */
export interface ToolAdapter {
  /** 获取工具定义 */
  getDefinition(): ToolDefinition
  
  /** 执行工具 */
  execute(params: Record<string, any>, context: ToolContext): Promise<ToolResult>
  
  /** 验证参数 */
  validateParams?(params: Record<string, any>): { valid: boolean; errors?: string[] }
  
  /** 健康检查（用于远程工具） */
  healthCheck?(): Promise<boolean>
}

// ==================== API 工具配置 ====================

/** HTTP 方法 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/** 认证类型 */
export type AuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2'

/** API 认证配置 */
export interface ApiAuthConfig {
  type: AuthType
  /** API Key 配置 */
  apiKey?: {
    key: string
    header?: string  // 默认 'X-API-Key'
    prefix?: string  // 如 'Bearer '
  }
  /** Basic Auth 配置 */
  basic?: {
    username: string
    password: string
  }
  /** Bearer Token */
  bearer?: {
    token: string
  }
  /** OAuth2 配置 */
  oauth2?: {
    clientId: string
    clientSecret: string
    tokenUrl: string
    scopes?: string[]
  }
}

/** 参数映射规则 */
export interface ParamMapping {
  /** 源参数名 */
  from: string
  /** 目标参数名 */
  to: string
  /** 参数位置: query/path/body/header */
  in: 'query' | 'path' | 'body' | 'header'
  /** 值转换函数（可选） */
  transform?: string  // 如 'JSON.stringify', 'encodeURIComponent'
}

/** 响应映射规则 */
export interface ResponseMapping {
  /** 成功字段路径 */
  successPath?: string
  /** 数据字段路径 */
  dataPath?: string
  /** 错误字段路径 */
  errorPath?: string
  /** 自定义转换（函数字符串） */
  transform?: string
}

/** API 工具配置 */
export interface ApiToolConfig {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 工具类别 */
  category?: string
  
  /** API 端点配置 */
  endpoint: {
    /** 基础 URL */
    baseUrl: string
    /** 路径（支持路径参数，如 /users/{id}） */
    path: string
    /** HTTP 方法 */
    method: HttpMethod
    /** 超时时间（毫秒） */
    timeout?: number
    /** 重试次数 */
    retries?: number
  }
  
  /** 认证配置 */
  auth?: ApiAuthConfig
  
  /** 请求头 */
  headers?: Record<string, string>
  
  /** 参数定义 */
  parameters: ToolParameterSchema[]
  
  /** 参数映射规则 */
  paramMappings?: ParamMapping[]
  
  /** 响应映射规则 */
  responseMapping?: ResponseMapping
  
  /** 是否启用 */
  enabled?: boolean
  
  /** 标签 */
  tags?: string[]
}

// ==================== 工具提供者接口 ====================

/** 工具提供者配置 */
export interface ProviderConfig {
  /** 提供者 ID */
  id: string
  /** 提供者名称 */
  name: string
  /** 提供者类型 */
  type: 'local' | 'api' | 'plugin'
  /** 是否启用 */
  enabled: boolean
  /** 优先级（数字越小优先级越高） */
  priority?: number
  /** 提供者特定配置 */
  config?: Record<string, any>
}

/**
 * 工具提供者接口 - 不同来源的工具通过提供者注册
 */
export interface ToolProvider {
  /** 提供者 ID */
  readonly id: string
  
  /** 提供者名称 */
  readonly name: string
  
  /** 提供者类型 */
  readonly type: 'local' | 'api' | 'plugin'
  
  /** 初始化提供者 */
  initialize(config?: ProviderConfig): Promise<void>
  
  /** 获取所有可用工具 */
  getTools(): ToolAdapter[]
  
  /** 根据名称获取工具 */
  getTool(name: string): ToolAdapter | undefined
  
  /** 检查工具是否存在 */
  hasTool(name: string): boolean
  
  /** 注册工具 */
  registerTool(tool: ToolAdapter): void
  
  /** 注销工具 */
  unregisterTool(name: string): boolean
  
  /** 健康检查 */
  healthCheck?(): Promise<{ healthy: boolean; details?: Record<string, any> }>
  
  /** 销毁提供者 */
  destroy?(): Promise<void>
}

// ==================== 辅助函数 ====================

/**
 * 将旧版 Tool 转换为 ToolDefinition
 */
export function toolToDefinition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    type: 'local',
    category: tool.category,
    requireConfirmation: tool.requireConfirmation,
    parameters: tool.parameters.map(p => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
      enum: p.enum,
      default: p.default
    }))
  }
}

/**
 * 创建本地工具适配器
 */
export function createLocalAdapter(tool: Tool): ToolAdapter {
  return {
    getDefinition: () => toolToDefinition(tool),
    execute: tool.execute,
    validateParams: (params) => {
      const errors: string[] = []
      tool.parameters.forEach(p => {
        if (p.required && !(p.name in params)) {
          errors.push(`缺少必需参数: ${p.name}`)
        }
      })
      return { valid: errors.length === 0, errors }
    }
  }
}

/**
 * 生成工具摘要（用于 LLM 提示词）
 */
export function generateToolSummary(tools: ToolAdapter[]): string {
  return tools.map(tool => {
    const def = tool.getDefinition()
    const params = def.parameters.map(p => 
      `${p.name}:${p.type}${p.required ? '*' : ''}`
    ).join(', ')
    
    return `${def.name}[${params}]: ${def.description}`
  }).join('\n')
}
