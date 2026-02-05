/**
 * API 工具提供者测试用例
 * 
 * 测试命令:
 * npm run test:unit src/services/react/__tests__/apiProvider.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiToolProvider } from '../providers/apiProvider'
import type { ApiToolConfig } from '../toolAdapter'

describe('ApiToolProvider', () => {
  let provider: ApiToolProvider
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    provider = new ApiToolProvider('test-provider', '测试提供者')
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  it('应该正确初始化提供者', async () => {
    await provider.initialize({
      id: 'test',
      name: 'Test Provider',
      type: 'api',
      enabled: true,
      config: {
        baseUrl: 'https://api.example.com'
      }
    })

    expect(provider.id).toBe('test-provider')
    expect(provider.name).toBe('测试提供者')
  })

  it('应该成功注册 API 工具', () => {
    const config: ApiToolConfig = {
      name: 'get_user',
      description: '获取用户信息',
      endpoint: {
        baseUrl: 'https://api.example.com',
        path: '/users/{id}',
        method: 'GET'
      },
      parameters: [
        {
          name: 'id',
          type: 'string',
          description: '用户ID',
          required: true
        }
      ]
    }

    provider.registerApiTool(config)
    
    expect(provider.hasTool('get_user')).toBe(true)
    const tool = provider.getTool('get_user')
    expect(tool).toBeDefined()
    
    const definition = tool!.getDefinition()
    expect(definition.name).toBe('get_user')
    expect(definition.description).toBe('获取用户信息')
  })

  it('应该正确构建 GET 请求 URL', async () => {
    const config: ApiToolConfig = {
      name: 'get_user',
      description: '获取用户信息',
      endpoint: {
        baseUrl: 'https://api.example.com',
        path: '/users/{id}',
        method: 'GET'
      },
      parameters: [
        {
          name: 'id',
          type: 'string',
          description: '用户ID',
          required: true
        }
      ]
    }

    provider.registerApiTool(config)
    const tool = provider.getTool('get_user')!

    // Mock fetch response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '123', name: '张三' })
    })

    const result = await tool.execute({ id: '123' }, {} as any)
    
    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/users/123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    )
  })

  it('应该正确处理 POST 请求', async () => {
    const config: ApiToolConfig = {
      name: 'create_user',
      description: '创建用户',
      endpoint: {
        baseUrl: 'https://api.example.com',
        path: '/users',
        method: 'POST'
      },
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: '用户名',
          required: true
        },
        {
          name: 'email',
          type: 'string',
          description: '邮箱',
          required: true
        }
      ]
    }

    provider.registerApiTool(config)
    const tool = provider.getTool('create_user')!

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '456', name: '李四' })
    })

    const result = await tool.execute(
      { name: '李四', email: 'lisi@example.com' }, 
      {} as any
    )
    
    expect(result.success).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: '李四', email: 'lisi@example.com' })
      })
    )
  })

  it('应该正确处理 Bearer 认证', async () => {
    const config: ApiToolConfig = {
      name: 'protected_api',
      description: '受保护的API',
      endpoint: {
        baseUrl: 'https://api.example.com',
        path: '/protected',
        method: 'GET'
      },
      auth: {
        type: 'bearer',
        bearer: {
          token: 'test-token-123'
        }
      },
      parameters: []
    }

    provider.registerApiTool(config)
    const tool = provider.getTool('protected_api')!

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'success' })
    })

    await tool.execute({}, {} as any)
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/protected',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token-123'
        })
      })
    )
  })

  it('应该正确处理 API Key 认证', async () => {
    const config: ApiToolConfig = {
      name: 'apikey_api',
      description: 'API Key认证',
      endpoint: {
        baseUrl: 'https://api.example.com',
        path: '/data',
        method: 'GET'
      },
      auth: {
        type: 'api_key',
        apiKey: {
          key: 'secret-key-456',
          header: 'X-API-Key'
        }
      },
      parameters: []
    }

    provider.registerApiTool(config)
    const tool = provider.getTool('apikey_api')!

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'success' })
    })

    await tool.execute({}, {} as any)
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'secret-key-456'
        })
      })
    )
  })

  it('应该正确验证参数', () => {
    const config: ApiToolConfig = {
      name: 'validate_test',
      description: '参数验证测试',
      endpoint: {
        baseUrl: 'https://api.example.com',
        path: '/test',
        method: 'POST'
      },
      parameters: [
        {
          name: 'required_field',
          type: 'string',
          description: '必填字段',
          required: true
        },
        {
          name: 'optional_field',
          type: 'number',
          description: '可选字段',
          required: false
        }
      ]
    }

    provider.registerApiTool(config)
    const tool = provider.getTool('validate_test')!

    // 测试缺少必填参数
    const result1 = tool.validateParams!({})
    expect(result1.valid).toBe(false)
    expect(result1.errors).toContain('缺少必需参数: required_field')

    // 测试参数类型错误
    const result2 = tool.validateParams!({ 
      required_field: 'test',
      optional_field: 'not-a-number'
    })
    expect(result2.valid).toBe(false)
    expect(result2.errors).toContain('参数 optional_field 类型错误: 期望 number, 实际 string')

    // 测试正确参数
    const result3 = tool.validateParams!({ 
      required_field: 'test',
      optional_field: 123
    })
    expect(result3.valid).toBe(true)
  })

  it('应该正确处理健康检查', async () => {
    const config: ApiToolConfig = {
      name: 'health_check_test',
      description: '健康检查测试',
      endpoint: {
        baseUrl: 'https://api.example.com',
        path: '/status',
        method: 'GET'
      },
      parameters: []
    }

    provider.registerApiTool(config)
    const tool = provider.getTool('health_check_test')!

    // 成功情况
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    expect(await tool.healthCheck!()).toBe(true)

    // 405 状态码也认为是健康的（服务器存在但不支持 HEAD）
    mockFetch.mockResolvedValueOnce({ ok: false, status: 405 })
    expect(await tool.healthCheck!()).toBe(true)

    // 失败情况
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    expect(await tool.healthCheck!()).toBe(false)
  })

  it('应该支持批量注册工具', () => {
    const configs: ApiToolConfig[] = [
      {
        name: 'tool1',
        description: '工具1',
        endpoint: { baseUrl: '', path: '/tool1', method: 'GET' },
        parameters: []
      },
      {
        name: 'tool2',
        description: '工具2',
        endpoint: { baseUrl: '', path: '/tool2', method: 'POST' },
        parameters: []
      }
    ]

    provider.registerApiTools(configs)
    
    expect(provider.hasTool('tool1')).toBe(true)
    expect(provider.hasTool('tool2')).toBe(true)
  })
})
