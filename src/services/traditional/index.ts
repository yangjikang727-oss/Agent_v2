/**
 * 传统模式服务导出
 * 包含意图解析、多轮对话等传统模式功能
 */

export { parseIntent, generateAgenda } from './intentParser'

// 重导出技能注册表（传统模式专用）
export * from '../skillRegistry'
