/**
 * 本地工具提供者 - 管理本地定义的工具
 */

import type { 
  ToolProvider, 
  ToolAdapter, 
  ProviderConfig
} from '../toolAdapter'
import { createLocalAdapter } from '../toolAdapter'
import type { Tool } from '../toolRegistry'

export class LocalToolProvider implements ToolProvider {
  readonly id = 'local'
  readonly name = '本地工具'
  readonly type = 'local' as const
  
  private tools: Map<string, ToolAdapter> = new Map()
  private initialized = false
  
  async initialize(_config?: ProviderConfig): Promise<void> {
    if (this.initialized) {
      console.warn('[LocalProvider] 已初始化，跳过')
      return
    }
    
    console.log('[LocalProvider] 初始化本地工具提供者')
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
  
  registerTool(tool: ToolAdapter): void {
    const def = tool.getDefinition()
    if (this.tools.has(def.name)) {
      console.warn(`[LocalProvider] 工具 ${def.name} 已存在，将被覆盖`)
    }
    this.tools.set(def.name, tool)
    console.log(`[LocalProvider] 工具已注册: ${def.name}`)
  }
  
  /**
   * 注册旧版 Tool 对象（兼容现有代码）
   */
  registerLegacyTool(tool: Tool): void {
    const adapter = createLocalAdapter(tool)
    this.registerTool(adapter)
  }
  
  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name)
    if (result) {
      console.log(`[LocalProvider] 工具已注销: ${name}`)
    }
    return result
  }
  
  async healthCheck(): Promise<{ healthy: boolean; details?: Record<string, any> }> {
    return {
      healthy: true,
      details: {
        toolCount: this.tools.size,
        tools: Array.from(this.tools.keys())
      }
    }
  }
  
  async destroy(): Promise<void> {
    this.tools.clear()
    this.initialized = false
    console.log('[LocalProvider] 已销毁')
  }
}

// 创建默认本地提供者实例
export const localProvider = new LocalToolProvider()
