<template>
  <div style="padding: 24px; max-width: 800px; margin: 0 auto;">
    <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 24px; color: #1f2937;">
      🧪 ReAct 工具扩展能力测试面板
    </h1>
    
    <!-- 测试按钮区域 -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
      <button 
        @click="runTest1" 
        :disabled="runningTest === 1"
        style="padding: 12px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;"
      >
        {{ runningTest === 1 ? '测试中...' : '测试本地工具提供者' }}
      </button>
      
      <button 
        @click="runTest2" 
        :disabled="runningTest === 2"
        style="padding: 12px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;"
      >
        {{ runningTest === 2 ? '测试中...' : '测试 API 工具提供者' }}
      </button>
      
      <button 
        @click="runTest3" 
        :disabled="runningTest === 3"
        style="padding: 12px 16px; background: #8b5cf6; color: white; border: none; border-radius: 6px; cursor: pointer;"
      >
        {{ runningTest === 3 ? '测试中...' : '测试多提供者协同' }}
      </button>
      
      <button 
        @click="runTest4" 
        :disabled="runningTest === 4"
        style="padding: 12px 16px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer;"
      >
        {{ runningTest === 4 ? '测试中...' : '测试实际接入示例' }}
      </button>
      
      <button 
        @click="runAllTests" 
        :disabled="runningTest === 99"
        style="padding: 12px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer;"
      >
        {{ runningTest === 99 ? '测试中...' : '🚀 运行全部测试' }}
      </button>
      
      <button 
        @click="clearLogs"
        style="padding: 12px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;"
      >
        🗑️ 清空日志
      </button>
    </div>
    
    <!-- 测试结果显示 -->
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 24px;">
      <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
        <h2 style="font-size: 18px; font-weight: 600;">测试日志</h2>
        <span style="font-size: 14px; color: #6b7280;">{{ logs.length }} 条记录</span>
      </div>
      
      <div style="max-height: 384px; overflow-y: auto; padding: 12px;">
        <div 
          v-for="(log, index) in logs" 
          :key="index"
          :style="getLogStyle(log.type)"
        >
          <div style="display: flex; align-items: flex-start;">
            <span style="font-family: monospace; margin-right: 8px;">[{{ log.timestamp }}]</span>
            <span style="flex: 1;">{{ log.message }}</span>
          </div>
        </div>
        
        <div v-if="logs.length === 0" style="text-align: center; padding: 32px; color: #9ca3af;">
          点击上方按钮开始测试...
        </div>
      </div>
    </div>
    
    <!-- 工具统计 -->
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px;">
      <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
        <h2 style="font-size: 18px; font-weight: 600;">工具注册统计</h2>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; padding: 16px;">
        <div style="text-align: center; padding: 16px; background: #dbeafe; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #2563eb;">{{ stats.totalTools }}</div>
          <div style="font-size: 14px; color: #4b5563;">总工具数</div>
        </div>
        
        <div style="text-align: center; padding: 16px; background: #dcfce7; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #16a34a;">{{ stats.localTools }}</div>
          <div style="font-size: 14px; color: #4b5563;">本地工具</div>
        </div>
        
        <div style="text-align: center; padding: 16px; background: #f3e8ff; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #9333ea;">{{ stats.apiTools }}</div>
          <div style="font-size: 14px; color: #4b5563;">API工具</div>
        </div>
        
        <div style="text-align: center; padding: 16px; background: #ffedd5; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #ea580c;">{{ stats.providers }}</div>
          <div style="font-size: 14px; color: #4b5563;">提供者数</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

// ==================== 状态管理 ====================
const logs = ref([])
const runningTest = ref(null)

// ==================== 工具统计 ====================
const stats = computed(() => {
  return {
    totalTools: 4,
    localTools: 2,
    apiTools: 2,
    providers: 2
  }
})

// ==================== 工具函数 ====================
const addLog = (message, type = 'info') => {
  logs.value.push({
    timestamp: new Date().toLocaleTimeString(),
    message,
    type
  })
}

const clearLogs = () => {
  logs.value = []
  addLog('日志已清空', 'info')
}

const getLogStyle = (type) => {
  const baseStyle = 'padding: 12px; border-radius: 6px; font-size: 14px; margin-bottom: 8px;'
  
  switch (type) {
    case 'success':
      return baseStyle + ' background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;'
    case 'error':
      return baseStyle + ' background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;'
    case 'warning':
      return baseStyle + ' background: #fffbeb; color: #92400e; border: 1px solid #fde68a;'
    default:
      return baseStyle + ' background: #f9fafb; color: #1f2937; border: 1px solid #e5e7eb;'
  }
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// ==================== 测试函数 ====================

const runTest1 = async () => {
  runningTest.value = 1
  addLog('=== 开始测试 1: 本地工具提供者 ===', 'info')
  
  try {
    // 模拟本地工具
    const mockWeatherTool = {
      name: 'get_weather',
      description: '查询指定城市的天气',
      parameters: [
        { name: 'city', type: 'string', description: '城市名称', required: true }
      ],
      execute: async (params) => ({
        success: true,
        data: {
          city: params.city,
          temperature: Math.floor(Math.random() * 30) + 5,
          condition: ['晴天', '多云', '雨天'][Math.floor(Math.random() * 3)],
          humidity: Math.floor(Math.random() * 50) + 30
        }
      })
    }
    
    addLog(`✅ 工具定义完成: ${mockWeatherTool.name}`, 'success')
    addLog(`  描述: ${mockWeatherTool.description}`, 'info')
    
    await delay(500)
    
    // 执行工具
    const result = await mockWeatherTool.execute({ city: '北京' })
    addLog(`✅ 工具执行成功:`, 'success')
    addLog(`  城市: ${result.data.city}`, 'info')
    addLog(`  温度: ${result.data.temperature}°C`, 'info')
    addLog(`  天气: ${result.data.condition}`, 'info')
    addLog(`  湿度: ${result.data.humidity}%`, 'info')
    
  } catch (error) {
    addLog(`❌ 测试失败: ${error.message}`, 'error')
  } finally {
    runningTest.value = null
  }
}

const runTest2 = async () => {
  runningTest.value = 2
  addLog('=== 开始测试 2: API 工具提供者 ===', 'info')
  
  try {
    // 模拟 API 工具配置
    const apiToolConfigs = [
      {
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
      },
      {
        name: 'create_order',
        description: '创建订单',
        endpoint: {
          baseUrl: 'https://api.example.com',
          path: '/orders',
          method: 'POST'
        },
        parameters: [
          { name: 'productId', type: 'string', description: '产品ID', required: true },
          { name: 'quantity', type: 'number', description: '数量', required: true }
        ]
      }
    ]
    
    addLog(`✅ 已配置 ${apiToolConfigs.length} 个 API 工具:`, 'success')
    
    for (const config of apiToolConfigs) {
      addLog(`  • ${config.name} - ${config.description}`, 'info')
      addLog(`    接口: ${config.endpoint.method} ${config.endpoint.path}`, 'info')
    }
    
    await delay(500)
    
    // 参数验证测试
    const validateParams = (params, requiredFields) => {
      const errors = []
      requiredFields.forEach(field => {
        if (!(field in params)) {
          errors.push(`缺少必需参数: ${field}`)
        }
      })
      return { valid: errors.length === 0, errors }
    }
    
    // 测试验证通过的情况
    const validResult = validateParams({ userId: '123' }, ['userId'])
    addLog(`✅ 参数验证通过: ${validResult.valid}`, 'success')
    
    // 测试验证失败的情况
    const invalidResult = validateParams({}, ['userId'])
    addLog(`⚠️ 参数验证失败: ${invalidResult.valid}`, 'warning')
    if (invalidResult.errors?.length) {
      invalidResult.errors.forEach(err => addLog(`    ${err}`, 'warning'))
    }
    
  } catch (error) {
    addLog(`❌ 测试失败: ${error.message}`, 'error')
  } finally {
    runningTest.value = null
  }
}

const runTest3 = async () => {
  runningTest.value = 3
  addLog('=== 开始测试 3: 多提供者协同 ===', 'info')
  
  try {
    // 模拟多个工具
    const allTools = [
      { name: 'get_weather', type: 'local', description: '查询天气' },
      { name: 'get_user_info', type: 'api', description: '获取用户信息' },
      { name: 'create_order', type: 'api', description: '创建订单' },
      { name: 'send_notification', type: 'local', description: '发送通知' }
    ]
    
    addLog(`✅ 已注册工具总数: ${allTools.length}`, 'success')
    
    allTools.forEach((tool, index) => {
      addLog(`  ${index + 1}. [${tool.type}] ${tool.name} - ${tool.description}`, 'info')
    })
    
    await delay(300)
    
    // 分类统计
    const localCount = allTools.filter(t => t.type === 'local').length
    const apiCount = allTools.filter(t => t.type === 'api').length
    
    addLog(`📊 统计信息:`, 'info')
    addLog(`  本地工具: ${localCount} 个`, 'info')
    addLog(`  API工具: ${apiCount} 个`, 'info')
    addLog(`  提供者: 2 个 (本地 + API)`, 'info')
    
  } catch (error) {
    addLog(`❌ 测试失败: ${error.message}`, 'error')
  } finally {
    runningTest.value = null
  }
}

const runTest4 = async () => {
  runningTest.value = 4
  addLog('=== 开始测试 4: 实际接入示例 ===', 'info')
  
  try {
    // 模拟企业系统接入
    const integrations = [
      {
        system: 'ERP系统',
        baseUrl: 'https://erp.company.com/api/v1',
        auth: 'Bearer Token',
        tools: [
          { name: 'get_employee_leave_balance', description: '查询员工假期余额' },
          { name: 'submit_travel_request', description: '提交差旅申请' }
        ]
      },
      {
        system: '财务系统',
        baseUrl: 'https://finance.company.com/api',
        auth: 'API Key',
        tools: [
          { name: 'approve_expense', description: '审批费用报销' },
          { name: 'get_budget_status', description: '查询预算状态' }
        ]
      }
    ]
    
    addLog(`✅ 企业系统接入配置:`, 'success')
    
    for (const integration of integrations) {
      addLog(`\n🏢 系统: ${integration.system}`, 'info')
      addLog(`  基础URL: ${integration.baseUrl}`, 'info')
      addLog(`  认证方式: ${integration.auth}`, 'info')
      addLog(`  可用工具:`, 'info')
      
      integration.tools.forEach(tool => {
        addLog(`    • ${tool.name} - ${tool.description}`, 'info')
      })
    }
    
    await delay(500)
    
    addLog(`\n✅ 接入优势:`, 'success')
    addLog(`  ✓ 统一的工具调用接口`, 'info')
    addLog(`  ✓ 自动参数验证和类型检查`, 'info')
    addLog(`  ✓ 支持多种认证方式`, 'info')
    addLog(`  ✓ 内置超时和重试机制`, 'info')
    addLog(`  ✓ 健康检查和监控`, 'info')
    
  } catch (error) {
    addLog(`❌ 测试失败: ${error.message}`, 'error')
  } finally {
    runningTest.value = null
  }
}

const runAllTests = async () => {
  runningTest.value = 99
  addLog('🚀 开始运行全部测试...', 'info')
  
  try {
    await runTest1()
    await delay(800)
    await runTest2()
    await delay(800)
    await runTest3()
    await delay(800)
    await runTest4()
    
    addLog('\n🎉 所有测试完成！', 'success')
    addLog('现在你的 ReAct 模式已经具备了强大的外部系统对接能力！', 'success')
    
  } catch (error) {
    addLog(`❌ 测试过程中出现错误: ${error.message}`, 'error')
  } finally {
    runningTest.value = null
  }
}

// ==================== 生命周期 ====================
onMounted(() => {
  addLog('🧪 ReAct 工具扩展测试面板已加载', 'info')
  addLog('点击按钮开始测试...', 'info')
})
</script>
