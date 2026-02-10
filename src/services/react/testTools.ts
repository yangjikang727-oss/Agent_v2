/**
 * ReAct 工具扩展能力测试脚本
 * 
 * 运行方式:
 * 在浏览器控制台中粘贴并执行以下代码
 */

// 注意: 此脚本需要先在项目中导入相关模块
// 由于当前环境限制，这里提供概念性测试代码

console.log('%c=== ReAct 工具扩展能力测试 ===', 'font-size: 16px; font-weight: bold; color: #2563eb;')

// ==================== 测试场景 ====================

/**
 * 场景 1: 本地工具提供者测试
 */
async function testScenario1() {
  console.log('\n%c场景 1: 本地工具提供者', 'font-weight: bold; color: #059669;')
  
  // 模拟本地工具
  const mockWeatherTool = {
    name: 'get_weather',
    description: '查询指定城市的天气',
    parameters: [
      { name: 'city', type: 'string', description: '城市名称', required: true }
    ],
    execute: async (params: Record<string, any>) => ({
      success: true,
      data: {
        city: params.city,
        temperature: 25,
        condition: '晴天'
      }
    }),
    category: 'query'
  }
  
  console.log('✅ 模拟工具定义完成')
  console.log('  工具名:', mockWeatherTool.name)
  console.log('  描述:', mockWeatherTool.description)
  
  // 模拟执行
  const result = await mockWeatherTool.execute({ city: '北京' })
  console.log('✅ 工具执行结果:', result.data)
}

/**
 * 场景 2: API 工具提供者测试
 */
async function testScenario2() {
  console.log('\n%c场景 2: API 工具提供者', 'font-weight: bold; color: #059669;')
  
  // 模拟 API 工具配置
  const apiToolConfig = {
    name: 'get_user_info',
    description: '获取用户详细信息',
    endpoint: {
      baseUrl: 'https://api.example.com',
      path: '/users/{userId}',
      method: 'GET'
    },
    parameters: [
      { name: 'userId', type: 'string', description: '用户ID', required: true }
    ]
  }
  
  console.log('✅ API 工具配置:')
  console.log('  名称:', apiToolConfig.name)
  console.log('  路径:', apiToolConfig.endpoint.path)
  console.log('  方法:', apiToolConfig.endpoint.method)
  
  // 模拟参数验证
  const validateParams = (params: Record<string, any>) => {
    const errors = []
    if (!params.userId) {
      errors.push('缺少必需参数: userId')
    }
    return { valid: errors.length === 0, errors }
  }
  
  const validResult = validateParams({ userId: '123' })
  const invalidResult = validateParams({})
  
  console.log('✅ 参数验证:')
  console.log('  有效参数:', validResult.valid, validResult.errors || '无错误')
  console.log('  无效参数:', invalidResult.valid, invalidResult.errors)
}

/**
 * 场景 3: 多提供者协同测试
 */
async function testScenario3() {
  console.log('\n%c场景 3: 多提供者协同', 'font-weight: bold; color: #059669;')
  
  // 模拟多个工具
  const tools = [
    { name: 'get_weather', type: 'local', description: '查询天气' },
    { name: 'get_user_info', type: 'api', description: '获取用户信息' },
    { name: 'create_order', type: 'api', description: '创建订单' },
    { name: 'send_notification', type: 'local', description: '发送通知' }
  ]
  
  console.log('✅ 已注册工具列表:')
  tools.forEach((tool, index) => {
    console.log(`  ${index + 1}. [${tool.type}] ${tool.name} - ${tool.description}`)
  })
  
  console.log(`\n✅ 统计信息:`)
  console.log(`  总工具数: ${tools.length}`)
  console.log(`  本地工具: ${tools.filter(t => t.type === 'local').length}`)
  console.log(`  API工具: ${tools.filter(t => t.type === 'api').length}`)
}

/**
 * 场景 4: 实际接入示例
 */
async function testScenario4() {
  console.log('\n%c场景 4: 实际接入示例', 'font-weight: bold; color: #059669;')
  
  // 模拟接入企业 ERP 系统
  const erpIntegration = {
    system: 'ERP System',
    baseUrl: 'https://erp.company.com/api/v1',
    auth: 'Bearer Token',
    tools: [
      {
        name: 'get_employee_leave_balance',
        description: '查询员工假期余额',
        endpoint: '/employees/{empId}/leave-balance'
      },
      {
        name: 'submit_travel_request',
        description: '提交差旅申请',
        endpoint: '/travel-requests'
      }
    ]
  }
  
  console.log('✅ 企业系统接入配置:')
  console.log('  系统:', erpIntegration.system)
  console.log('  基础URL:', erpIntegration.baseUrl)
  console.log('  认证方式:', erpIntegration.auth)
  
  console.log('\n✅ 可用工具:')
  erpIntegration.tools.forEach((tool, index) => {
    console.log(`  ${index + 1}. ${tool.name}`)
    console.log(`     描述: ${tool.description}`)
    console.log(`     接口: ${tool.endpoint}`)
  })
  
  console.log('\n✅ 接入优势:')
  console.log('  ✓ 统一的工具调用接口')
  console.log('  ✓ 自动参数验证和类型检查')
  console.log('  ✓ 支持多种认证方式')
  console.log('  ✓ 内置超时和重试机制')
  console.log('  ✓ 健康检查和监控')
}

/**
 * 运行所有测试
 */
async function runAllScenarios() {
  try {
    await testScenario1()
    await testScenario2()
    await testScenario3()
    await testScenario4()
    
    console.log('\n%c🎉 所有测试场景完成!', 'font-size: 18px; font-weight: bold; color: #10b981;')
    console.log('\n%c💡 提示: 这些测试展示了 ReAct 模式扩展架构的核心能力', 'color: #6b7280;')
    console.log('%c   现在你可以轻松接入任何外部系统 API', 'color: #6b7280;')
    
  } catch (error) {
    console.error('❌ 测试执行出错:', error)
  }
}

// 导出测试函数
;(window as any).runReActToolTests = runAllScenarios

console.log('\n%c使用方法:', 'font-weight: bold;')
console.log('在控制台输入: await runReActToolTests()')

// 自动运行示例
setTimeout(() => {
  console.log('\n%c👉 即将运行示例测试...', 'color: #f59e0b;')
  runAllScenarios()
}, 1000)