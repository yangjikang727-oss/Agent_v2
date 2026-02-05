/**
 * Skill Resources - 资源管理模块（第三层）
 * 
 * 核心职责：
 * 1. 按需加载脚本、模板、参考文档等资源
 * 2. 资源执行后仅返回结果，代码永不进入上下文
 * 3. 管理资源缓存和生命周期
 * 
 * 关键优势：
 * - 将复杂 Skill 的 Token 占用从数千压缩至百级
 * - Agent 仅获取当前所需知识，不被冗余信息干扰
 */

import type {
  SkillSpec,
  SkillResource,
  ResourceType,
  ResourceExecutionResult
} from './skillTypes'

// ==================== 资源加载器接口 ====================

/** 资源加载器 */
export interface ResourceLoader {
  /** 加载器类型 */
  type: ResourceType
  /** 加载资源 */
  load(resource: SkillResource): Promise<any>
  /** 执行资源 */
  execute?(resource: SkillResource, params: Record<string, any>): Promise<ResourceExecutionResult>
}

// ==================== 脚本资源加载器 ====================

/**
 * 脚本资源加载器
 * 执行 JavaScript/TypeScript 脚本，仅返回结果
 */
export class ScriptResourceLoader implements ResourceLoader {
  type: ResourceType = 'script'
  
  async load(resource: SkillResource): Promise<any> {
    // 脚本不加载到上下文，仅返回元信息
    return {
      id: resource.id,
      name: resource.name,
      description: resource.description,
      entryPoint: resource.entryPoint
    }
  }
  
  async execute(
    resource: SkillResource, 
    params: Record<string, any>
  ): Promise<ResourceExecutionResult> {
    const startTime = Date.now()
    
    try {
      // 动态导入并执行脚本
      // 注意：实际代码内容不进入 LLM 上下文
      if (resource.content) {
        // 内联脚本执行
        const fn = new Function('params', resource.content)
        const output = await fn(params)
        
        return {
          resourceId: resource.id,
          status: 'success',
          output,
          executionTime: Date.now() - startTime
        }
      }
      
      if (resource.path && resource.entryPoint) {
        // 外部脚本执行（预留接口）
        // 实际项目中可以通过动态 import 加载
        console.log(`[Resource] 执行脚本: ${resource.path}#${resource.entryPoint}`)
        
        return {
          resourceId: resource.id,
          status: 'success',
          output: { message: '脚本执行成功（模拟）' },
          executionTime: Date.now() - startTime
        }
      }
      
      throw new Error('脚本资源缺少 content 或 path/entryPoint')
      
    } catch (error) {
      return {
        resourceId: resource.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      }
    }
  }
}

// ==================== 模板资源加载器 ====================

/**
 * 模板资源加载器
 * 加载并渲染模板（如话术模板、消息模板）
 */
export class TemplateResourceLoader implements ResourceLoader {
  type: ResourceType = 'template'
  
  async load(resource: SkillResource): Promise<any> {
    // 返回模板元信息，不返回完整内容
    return {
      id: resource.id,
      name: resource.name,
      description: resource.description
    }
  }
  
  async execute(
    resource: SkillResource,
    params: Record<string, any>
  ): Promise<ResourceExecutionResult> {
    const startTime = Date.now()
    
    try {
      if (!resource.content) {
        throw new Error('模板资源缺少 content')
      }
      
      // 简单的模板渲染（替换 {{key}} 占位符）
      let rendered = resource.content
      for (const [key, value] of Object.entries(params)) {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
        rendered = rendered.replace(placeholder, String(value))
      }
      
      return {
        resourceId: resource.id,
        status: 'success',
        output: rendered,
        executionTime: Date.now() - startTime
      }
      
    } catch (error) {
      return {
        resourceId: resource.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      }
    }
  }
}

// ==================== 参考文档资源加载器 ====================

/**
 * 参考文档资源加载器
 * 按需加载参考文档（如 API 文档、操作指南）
 */
export class ReferenceResourceLoader implements ResourceLoader {
  type: ResourceType = 'reference'
  
  async load(resource: SkillResource): Promise<any> {
    // 仅返回摘要，不加载完整内容
    return {
      id: resource.id,
      name: resource.name,
      description: resource.description,
      // 可以返回文档摘要或目录
      summary: resource.description
    }
  }
  
  // 参考文档不需要执行
}

// ==================== 配置资源加载器 ====================

/**
 * 配置资源加载器
 * 加载配置文件（如 JSON 配置、环境变量）
 */
export class ConfigResourceLoader implements ResourceLoader {
  type: ResourceType = 'config'
  
  async load(resource: SkillResource): Promise<any> {
    if (resource.content) {
      try {
        return JSON.parse(resource.content)
      } catch {
        return resource.content
      }
    }
    
    return {
      id: resource.id,
      name: resource.name
    }
  }
}

// ==================== 资源管理器 ====================

/**
 * 资源管理器 - 统一管理所有资源的加载和执行
 */
export class ResourceManager {
  private loaders: Map<ResourceType, ResourceLoader> = new Map()
  private cache: Map<string, any> = new Map()
  
  constructor() {
    // 注册默认加载器
    this.registerLoader(new ScriptResourceLoader())
    this.registerLoader(new TemplateResourceLoader())
    this.registerLoader(new ReferenceResourceLoader())
    this.registerLoader(new ConfigResourceLoader())
  }
  
  /**
   * 注册资源加载器
   */
  registerLoader(loader: ResourceLoader): void {
    this.loaders.set(loader.type, loader)
  }
  
  /**
   * 获取资源加载器
   */
  getLoader(type: ResourceType): ResourceLoader | undefined {
    return this.loaders.get(type)
  }
  
  /**
   * 加载资源元信息（不加载完整内容）
   */
  async loadResourceMeta(resource: SkillResource): Promise<any> {
    const cacheKey = `meta:${resource.id}`
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    
    const loader = this.loaders.get(resource.type)
    if (!loader) {
      throw new Error(`未找到资源加载器: ${resource.type}`)
    }
    
    const meta = await loader.load(resource)
    this.cache.set(cacheKey, meta)
    
    return meta
  }
  
  /**
   * 执行资源（脚本、模板等）
   * 关键：代码内容不返回，只返回执行结果
   */
  async executeResource(
    resource: SkillResource,
    params: Record<string, any>
  ): Promise<ResourceExecutionResult> {
    const loader = this.loaders.get(resource.type)
    
    if (!loader) {
      return {
        resourceId: resource.id,
        status: 'error',
        error: `未找到资源加载器: ${resource.type}`,
        executionTime: 0
      }
    }
    
    if (!loader.execute) {
      return {
        resourceId: resource.id,
        status: 'error',
        error: `资源类型 ${resource.type} 不支持执行`,
        executionTime: 0
      }
    }
    
    return loader.execute(resource, params)
  }
  
  /**
   * 批量加载 Skill 的所有资源元信息
   */
  async loadSkillResources(spec: SkillSpec): Promise<Map<string, any>> {
    const results = new Map<string, any>()
    
    if (!spec.resources) {
      return results
    }
    
    for (const resource of spec.resources) {
      try {
        const meta = await this.loadResourceMeta(resource)
        results.set(resource.id, meta)
      } catch (error) {
        console.error(`[Resource] 加载资源失败: ${resource.id}`, error)
      }
    }
    
    return results
  }
  
  /**
   * 根据参数映射执行资源
   */
  async executeWithMapping(
    resource: SkillResource,
    skillParams: Record<string, any>
  ): Promise<ResourceExecutionResult> {
    // 如果有参数映射，转换参数名
    const mappedParams: Record<string, any> = {}
    
    if (resource.paramMapping) {
      for (const [skillField, resourceParam] of Object.entries(resource.paramMapping)) {
        if (skillParams[skillField] !== undefined) {
          mappedParams[resourceParam] = skillParams[skillField]
        }
      }
    } else {
      Object.assign(mappedParams, skillParams)
    }
    
    return this.executeResource(resource, mappedParams)
  }
  
  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
  }
  
  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

// ==================== 资源工厂函数 ====================

/**
 * 创建脚本资源
 */
export function createScriptResource(
  id: string,
  name: string,
  description: string,
  options: {
    content?: string
    path?: string
    entryPoint?: string
    paramMapping?: Record<string, string>
  }
): SkillResource {
  return {
    id,
    type: 'script',
    name,
    description,
    lazyLoad: true,
    ...options
  }
}

/**
 * 创建模板资源
 */
export function createTemplateResource(
  id: string,
  name: string,
  description: string,
  content: string
): SkillResource {
  return {
    id,
    type: 'template',
    name,
    description,
    content,
    lazyLoad: true
  }
}

/**
 * 创建参考文档资源
 */
export function createReferenceResource(
  id: string,
  name: string,
  description: string,
  path: string
): SkillResource {
  return {
    id,
    type: 'reference',
    name,
    description,
    path,
    lazyLoad: true
  }
}

/**
 * 创建配置资源
 */
export function createConfigResource(
  id: string,
  name: string,
  description: string,
  config: Record<string, any>
): SkillResource {
  return {
    id,
    type: 'config',
    name,
    description,
    content: JSON.stringify(config),
    lazyLoad: false
  }
}

// ==================== 导出 ====================

export const resourceManager = new ResourceManager()
