/**
 * Skill-ReAct 集成测试
 * 验证 Skill 系统是否正确集成到 ReAct 引擎中
 */

import { toolRegistry } from '../toolRegistry'

// ==================== 集成测试 ====================

export async function testSkillReActIntegration(): Promise<void> {
  console.log('=== Skill-ReAct 集成测试开始 ===')
  
  // 1. 检查工具是否正确注册
  console.log('\n1. 检查工具注册状态:')
  const allTools = toolRegistry.getAllTools()
  console.log(`总工具数: ${allTools.length}`)
  
  const skillTools = allTools.filter((tool: any) => 
    tool.name === 'book_meeting_room' || 
    tool.name === 'apply_business_trip'
  )
  console.log(`Skill 工具数: ${skillTools.length}`)
  
  skillTools.forEach((tool: any) => {
    console.log(`  - ${tool.name}: ${tool.description}`)
  })
  
  // 2. 测试会议预定工具
  console.log('\n2. 测试会议预定工具:')
  try {
    const bookMeetingTool = toolRegistry.getTool('book_meeting_room')
    if (bookMeetingTool) {
      const result = await bookMeetingTool.execute({
        title: '部门例会',
        date: '2024-01-15',
        startTime: '15:00',
        endTime: '16:00',
        attendees: ['张三', '李四', '王五'],
        location: '会议室A'
      }, {
        userId: 'test-user',
        currentDate: '2024-01-15',
        scheduleStore: {},
        taskStore: {},
        config: {}
      })
      
      console.log('会议预定结果:', result)
      if (result.success) {
        console.log('✅ 会议预定工具工作正常')
      } else {
        console.log('❌ 会议预定工具执行失败:', result.error)
      }
    } else {
      console.log('❌ 未找到会议预定工具')
    }
  } catch (error) {
    console.error('会议预定工具测试异常:', error)
  }
  
  // 3. 测试出差申请工具
  console.log('\n3. 测试出差申请工具:')
  try {
    const tripTool = toolRegistry.getTool('apply_business_trip')
    if (tripTool) {
      const result = await tripTool.execute({
        destination: '上海',
        departure: '北京',
        startDate: '2024-01-20',
        endDate: '2024-01-22',
        reason: '客户拜访'
      }, {
        userId: 'test-user',
        currentDate: '2024-01-15',
        scheduleStore: {},
        taskStore: {},
        config: {}
      })
      
      console.log('出差申请结果:', result)
      if (result.success) {
        console.log('✅ 出差申请工具工作正常')
      } else {
        console.log('❌ 出差申请工具执行失败:', result.error)
      }
    } else {
      console.log('❌ 未找到出差申请工具')
    }
  } catch (error) {
    console.error('出差申请工具测试异常:', error)
  }
  
  console.log('\n=== Skill-ReAct 集成测试结束 ===')
}
