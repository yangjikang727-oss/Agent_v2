import { toolRegistry } from '../services/react/toolRegistry'
import { dateCalculatorTool, scheduleQueryTool, conflictDetectorTool } from './coreTools'
import { resourceCheckerTool, intentClassifierTool } from './reactTools'
import { notificationSenderTool } from './notificationTool'

/**
 * 注册所有核心工具
 */
export function registerCoreTools(): void {
  // 注册日期计算器工具
  toolRegistry.registerTool(dateCalculatorTool)
  
  // 注册日程查询工具
  toolRegistry.registerTool(scheduleQueryTool)
  
  // 注册冲突检测工具
  toolRegistry.registerTool(conflictDetectorTool)
  
  // 注册ReAct专用工具
  toolRegistry.registerTool(resourceCheckerTool)
  toolRegistry.registerTool(intentClassifierTool)
  toolRegistry.registerTool(notificationSenderTool)
  
  console.log('[ToolRegistration] 所有工具注册完成')
}

/**
 * 获取已注册的核心工具列表
 */
export function getRegisteredCoreTools(): string[] {
  return [
    dateCalculatorTool.name,
    scheduleQueryTool.name,
    conflictDetectorTool.name,
    resourceCheckerTool.name,
    intentClassifierTool.name,
    notificationSenderTool.name
  ]
}