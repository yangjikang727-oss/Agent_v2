/**
 * 远程 API 工具提供者 - 对接外部系统 API
 * 
 * 使用示例:
 * ```typescript
 * const apiProvider = new ApiToolProvider()
 * await apiProvider.initialize({
 *   id: 'external-api',
 *   name: '外部系统',
 *   type: 'api',
 *   enabled: true,
 *   config: {
 *     baseUrl: 'https://api.example.com',
 *     auth: { type: 'bearer', bearer: { token: 'xxx' } }
 *   }
 * })
 * 
 * // 注册 API 工具
 * apiProvider.registerApiTool({
 *   name: 'get_user_info',
 *   description: '获取用户信息',
 *   endpoint: {
 *     baseUrl: 'https://api.example.com',
 *     path: '/users/{userId}',
 *     method: 'GET'
 *   },
 *   parameters: [
 *     { name: 'userId', type: 'string', description: '用户ID', required: true }
 *   ]
 * })
 * ```
 */

import type { 
  ToolProvider, 
  ToolAdapter, 
  ProviderConfig,
  ToolDefinition,
  ApiToolConfig,
  ApiAuthConfig,
  ParamMapping
} from '../toolAdapter'
import type { ToolContext, ToolResult } from '../toolRegistry'

// ==================== API 工具适配器 ====================

/**
 * API 工具适配器 - 将 API 配置转换为可执行的工具
 */
class ApiToolAdapter implements ToolAdapter {
  private config: ApiToolConfig
  private globalAuth?: ApiAuthConfig
  private globalHeaders?: Record<string, string>
  
  constructor(
    config: ApiToolConfig,
    globalAuth?: ApiAuthConfig,
    globalHeaders?: Record<string, string>
  ) {
    this.config = config
    this.globalAuth = globalAuth
    this.globalHeaders = globalHeaders
  }
  
  getDefinition(): ToolDefinition {
    return {
      name: this.config.name,
      description: this.config.description,
      type: 'api',
      category: this.config.category,
      tags: this.config.tags,
      parameters: this.config.parameters
    }
  }
  
  async execute(params: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now()
    
    try {
      // 构建请求 URL
      const url = this.buildUrl(params)
      
      // 构建请求头
      const headers = this.buildHeaders()
      
      // 构建请求体
      const body = this.buildBody(params)
      
      // 发送请求
      const response = await this.sendRequest(url, headers, body)
      
      // 解析响应
      const result = this.parseResponse(response)
      
      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.config.name
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `API调用失败: ${(error as Error).message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.config.name
        }
      }
    }
  }
  
  validateParams(params: Record<string, any>): { valid: boolean; errors?: string[] } {
    const errors: string[] = []
    
    this.config.parameters.forEach(p => {
      if (p.required && !(p.name in params)) {
        errors.push(`缺少必需参数: ${p.name}`)
      }
      
      // 类型检查
      if (p.name in params) {
        const value = params[p.name]
        const actualType = Array.isArray(value) ? 'array' : typeof value
        if (actualType !== p.type) {
          errors.push(`参数 ${p.name} 类型错误: 期望 ${p.type}, 实际 ${actualType}`)
        }
      }
    })
    
    return { valid: errors.length === 0, errors }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      // 简单的连接测试
      const url = new URL(this.config.endpoint.path, this.config.endpoint.baseUrl)
      const response = await fetch(url.toString(), {
        method: 'HEAD',
        headers: this.buildHeaders()
      })
      return response.ok || response.status === 405 // 405 表示服务器存在但不支持 HEAD
    } catch {
      return false
    }
  }
  
  // ==================== 私有方法 ====================
  
  private buildUrl(params: Record<string, any>): string {
    let path = this.config.endpoint.path
    const queryParams: Record<string, string> = {}
    
    // 处理参数映射
    const mappings = this.config.paramMappings || this.getDefaultMappings()
    
    mappings.forEach(mapping => {
      const value = params[mapping.from]
      if (value === undefined) return
      
      if (mapping.in === 'path') {
        // 路径参数替换
        path = path.replace(`{${mapping.to}}`, encodeURIComponent(String(value)))
      } else if (mapping.in === 'query') {
        // 查询参数
        queryParams[mapping.to] = String(value)
      }
    })
    
    // 构建完整 URL
    const url = new URL(path, this.config.endpoint.baseUrl)
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
    
    return url.toString()
  }
  
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.globalHeaders,
      ...this.config.headers
    }
    
    // 添加认证头
    const auth = this.config.auth || this.globalAuth
    if (auth) {
      switch (auth.type) {
        case 'api_key':
          if (auth.apiKey) {
            const headerName = auth.apiKey.header || 'X-API-Key'
            const prefix = auth.apiKey.prefix || ''
            headers[headerName] = prefix + auth.apiKey.key
          }
          break
        case 'bearer':
          if (auth.bearer) {
            headers['Authorization'] = `Bearer ${auth.bearer.token}`
          }
          break
        case 'basic':
          if (auth.basic) {
            const credentials = btoa(`${auth.basic.username}:${auth.basic.password}`)
            headers['Authorization'] = `Basic ${credentials}`
          }
          break
      }
    }
    
    return headers
  }
  
  private buildBody(params: Record<string, any>): string | undefined {
    if (this.config.endpoint.method === 'GET' || this.config.endpoint.method === 'DELETE') {
      return undefined
    }
    
    const bodyParams: Record<string, any> = {}
    const mappings = this.config.paramMappings || this.getDefaultMappings()
    
    mappings.forEach(mapping => {
      const value = params[mapping.from]
      if (value !== undefined && mapping.in === 'body') {
        bodyParams[mapping.to] = value
      }
    })
    
    // 如果没有明确的 body 映射，将所有非 path/query 参数放入 body
    if (Object.keys(bodyParams).length === 0) {
      const pathAndQueryParams = new Set(
        mappings
          .filter(m => m.in === 'path' || m.in === 'query')
          .map(m => m.from)
      )
      
      Object.entries(params).forEach(([key, value]) => {
        if (!pathAndQueryParams.has(key)) {
          bodyParams[key] = value
        }
      })
    }
    
    return Object.keys(bodyParams).length > 0 ? JSON.stringify(bodyParams) : undefined
  }
  
  private async sendRequest(url: string, headers: Record<string, string>, body?: string): Promise<any> {
    const controller = new AbortController()
    const timeout = this.config.endpoint.timeout || 30000
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        method: this.config.endpoint.method,
        headers,
        body,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }
      
      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      if ((error as Error).name === 'AbortError') {
        throw new Error(`请求超时 (${timeout}ms)`)
      }
      throw error
    }
  }
  
  private parseResponse(response: any): any {
    const mapping = this.config.responseMapping
    if (!mapping) return response
    
    let result = response
    
    // 提取数据字段
    if (mapping.dataPath) {
      result = this.getNestedValue(response, mapping.dataPath)
    }
    
    return result
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }
  
  private getDefaultMappings(): ParamMapping[] {
    // 默认: 所有参数都放在 body 中
    return this.config.parameters.map(p => ({
      from: p.name,
      to: p.name,
      in: this.config.endpoint.method === 'GET' ? 'query' : 'body'
    }))
  }
}

// ==================== API 工具提供者 ====================

export class ApiToolProvider implements ToolProvider {
  readonly id: string
  readonly name: string
  readonly type = 'api' as const
  
  private tools: Map<string, ApiToolAdapter> = new Map()
  private initialized = false
  private globalAuth?: ApiAuthConfig
  private globalHeaders?: Record<string, string>
  private baseUrl?: string
  
  constructor(id: string = 'api', name: string = '远程API') {
    this.id = id
    this.name = name
  }
  
  async initialize(config?: ProviderConfig): Promise<void> {
    if (this.initialized) {
      console.warn(`[ApiProvider:${this.id}] 已初始化，跳过`)
      return
    }
    
    if (config?.config) {
      this.baseUrl = config.config.baseUrl
      this.globalAuth = config.config.auth
      this.globalHeaders = config.config.headers
    }
    
    console.log(`[ApiProvider:${this.id}] 初始化完成`)
    this.initialized = true
  }
  
  getTools(): ToolAdapter[] {
    return Array.from(this.tools.values())
  }
  
  getTool(name: string): ToolAdapter | undefined {
    return this.tools.get(name)
  }
  
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }
  
  registerTool(_tool: ToolAdapter): void {
    console.warn(`[ApiProvider:${this.id}] registerTool 不支持直接注册，请使用 registerApiTool`)
  }
  
  /**
   * 注册 API 工具
   */
  registerApiTool(config: ApiToolConfig): void {
    // 使用全局 baseUrl 作为默认值
    if (!config.endpoint.baseUrl && this.baseUrl) {
      config.endpoint.baseUrl = this.baseUrl
    }
    
    const adapter = new ApiToolAdapter(config, this.globalAuth, this.globalHeaders)
    
    if (this.tools.has(config.name)) {
      console.warn(`[ApiProvider:${this.id}] 工具 ${config.name} 已存在，将被覆盖`)
    }
    
    this.tools.set(config.name, adapter)
    console.log(`[ApiProvider:${this.id}] API工具已注册: ${config.name}`)
  }
  
  /**
   * 批量注册 API 工具
   */
  registerApiTools(configs: ApiToolConfig[]): void {
    configs.forEach(config => this.registerApiTool(config))
  }
  
  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name)
    if (result) {
      console.log(`[ApiProvider:${this.id}] 工具已注销: ${name}`)
    }
    return result
  }
  
  async healthCheck(): Promise<{ healthy: boolean; details?: Record<string, any> }> {
    const results: Record<string, boolean> = {}
    
    for (const [name, tool] of this.tools) {
      try {
        results[name] = await tool.healthCheck()
      } catch {
        results[name] = false
      }
    }
    
    const healthyCount = Object.values(results).filter(Boolean).length
    
    return {
      healthy: healthyCount === this.tools.size,
      details: {
        totalTools: this.tools.size,
        healthyTools: healthyCount,
        toolStatus: results
      }
    }
  }
  
  async destroy(): Promise<void> {
    this.tools.clear()
    this.initialized = false
    console.log(`[ApiProvider:${this.id}] 已销毁`)
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 API 工具提供者
 */
export function createApiProvider(
  id: string,
  name: string,
  config?: {
    baseUrl?: string
    auth?: ApiAuthConfig
    headers?: Record<string, string>
  }
): ApiToolProvider {
  const provider = new ApiToolProvider(id, name)
  
  if (config) {
    provider.initialize({
      id,
      name,
      type: 'api',
      enabled: true,
      config
    })
  }
  
  return provider
}
