/**
 * 工具注册入口
 * 
 * 将所有核心工具（日期计算、日程查询、冲突检测）和 ReAct 专用工具
 * （资源检查、意图分类、通知发送）统一注册到全局 toolRegistry。
 * 在应用启动时由 toolRegistry.ts 自动调用。
 */

import { toolRegistry } from '../services/react/toolRegistry'
import { loadSkillTool, triggerActionTool, dateCalculatorTool, scheduleQueryTool, conflictDetectorTool, cancelScheduleTool, editScheduleTool } from './coreTools'
import { resourceCheckerTool, intentClassifierTool } from './reactTools'
import { notificationSenderTool } from './notificationTool'

/**
 * 注册所有核心工具
 */
export function registerCoreTools(): void {
  // 注册 OpenCode 式 Skill 工具
  toolRegistry.registerTool(loadSkillTool)
  toolRegistry.registerTool(triggerActionTool)
  
  // 注册日期计算器工具
  toolRegistry.registerTool(dateCalculatorTool)
  
  // 注册日程查询工具
  toolRegistry.registerTool(scheduleQueryTool)
  
  // 注册冲突检测工具
  toolRegistry.registerTool(conflictDetectorTool)
  
  // 注册取消日程工具
  toolRegistry.registerTool(cancelScheduleTool)
  
  // 注册修改日程工具
  toolRegistry.registerTool(editScheduleTool)
  
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
    loadSkillTool.name,
    triggerActionTool.name,
    dateCalculatorTool.name,
    scheduleQueryTool.name,
    conflictDetectorTool.name,
    cancelScheduleTool.name,
    editScheduleTool.name,
    resourceCheckerTool.name,
    intentClassifierTool.name,
    notificationSenderTool.name
  ]
}