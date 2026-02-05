/**
 * 传统模式 - 意图解析与提示词
 * 用于传统的意图分类 + 多轮对话模式
 */

import type { IntentData } from '../../types'
import { callLLM, type LLMConfig } from '../core/llmCore'

// ==================== 场景提示词 ====================

/**
 * 会议场景提示词
 */
function getMeetingPrompt(currentDate: string): string {
  return `你是一个专业的会议日程管理助手。

当前日期：${currentDate}（格式：YYYY-MM-DD）

你的任务：
1. 理解用户输入的会议相关内容
2. 抽取会议信息，只抽取用户【明确提到】的信息
3. 只返回 json 格式的 JSON 数据

----------------------------
字段说明：
----------------------------
- summary：会议主题（如"项目评审会"、"与王总开会"）
- date：会议日期，格式 YYYY-MM-DD
  - "今天"转换为当前日期
  - "明天"转换为当前日期+1天
  - "后天"转换为当前日期+2天
  - "下周X"需计算具体日期
- startTime：开始时间，24小时制 HH:MM
  - "上午"范围 08:30-12:00
  - "下午"范围 13:30-17:30
  - "晚上"范围 18:00-22:00
- endTime：结束时间，24小时制 HH:MM
- location：会议室或地点（如"3楼会议室"、"线上"）
- attendees：参会人姓名数组

----------------------------
【强制确认规则】
----------------------------
若以下字段缺失或不明确，必须在 reply 中追问：

1. startTime 缺失（如"下午开会"未说具体几点）
   → reply: "请问下午几点开始？"

2. date 缺失（未提及日期）
   → reply: "请问哪天开会？"

----------------------------
输出格式（严格遵守）：
----------------------------
{
  "intent": "create",
  "type": "meeting",
  "summary": "会议主题",
  "date": "YYYY-MM-DD 或 null",
  "startTime": "HH:MM 或 null",
  "endTime": "HH:MM 或 null",
  "location": "地点 或 null",
  "attendees": ["姓名"],
  "transport": null,
  "reply": "追问内容 或 null"
}
`
}

/**
 * 出差场景提示词
 */
function getTripPrompt(currentDate: string): string {
  return `你是一个专业的出差行程管理助手。

当前日期：${currentDate}（格式：YYYY-MM-DD）

你的任务：
1. 理解用户输入的出差/行程相关内容
2. 抽取行程信息，只抽取用户【明确提到】的信息
3. 只返回 json 格式的 JSON 数据

----------------------------
字段说明：
----------------------------
- summary：行程主题（如"北京出差"、"上海调研"）
- date：出发日期，格式 YYYY-MM-DD
  - "今天"转换为当前日期
  - "明天"转换为当前日期+1天
  - "后天"转换为当前日期+2天
  - "下周X"需计算具体日期
- startTime：出发时间，24小时制 HH:MM（例如 09:00）
- endTime：返程时间，24小时制 HH:MM（例如 18:00），如果是多天行程且未明确提及返程时间，设为 null
- endDate：返程日期，格式 YYYY-MM-DD（仅当跨天出差时填写）
  - 如果提到"3天"、"两天"等天数，自动计算 endDate
  - 如果只提到出发日期，endDate 设为 null
- from：出发地（如"上海"、"深圳"）
- to：目的地（如"北京"、"上海总部"）
- attendees：同行人员姓名数组
- transport：交通方式
  - "flight"：飞机、航班
  - "train"：火车、高铁、动车
  - "car"：车、自驾、打车
  - "ship"：船、轮渡

----------------------------
【强制确认规则】
----------------------------
按以下优先级顺序，只追问【第一个】缺失的字段：

1. from 缺失（未提及出发地）
   → reply: "请问从哪里出发？"

2. to 缺失（未提及目的地）
   → reply: "请问出差去哪里？"

3. date 缺失（未提及日期）
   → reply: "请问哪天出发？"

4. startTime 缺失（未提及出发时间）
   → reply: "请问几点出发？"

5. endDate 缺失（跨天出差但未提及返程日期）
   → reply: "请问哪天返程？"

注意：reply 中只包含一个追问，不要合并多个问题。

----------------------------
输出格式（严格遵守）：
----------------------------
{
  "intent": "create",
  "type": "trip",
  "summary": "行程主题",
  "date": "YYYY-MM-DD 或 null",
  "startTime": "HH:MM 或 null",
  "endTime": "HH:MM 或 null",
  "endDate": "YYYY-MM-DD 或 null",
  "from": "出发地 或 null",
  "to": "目的地 或 null",
  "attendees": ["姓名"],
  "transport": "flight|train|car|ship 或 null",
  "reply": "追问内容 或 null"
}
`
}

/**
 * 通用意图分类提示词
 */
function getIntentClassifyPrompt(currentDate: string): string {
  return `你是一个日程管理助手。判断用户意图并返回 JSON。

当前日期：${currentDate}

----------------------------
意图类型（只选一个）：
----------------------------
1. "meeting" - 安排会议、开会、讨论、沟通、评审
2. "trip" - 出差、行程、飞、去某地、火车
3. "query" - 查看、查询、列出日程
4. "update" - 修改、调整、取消日程
5. "chat" - 闲聊、问候、与日程无关

----------------------------
输出格式：
----------------------------
{
  "intent": "meeting|trip|query|update|chat",
  "date": "YYYY-MM-DD 或 null",
  "reply": "聊天回复 或 null"
}

- query 意图需返回 date（默认当前日期）
- chat 意图需返回 reply
- 其他意图只需返回 intent
`
}

// ==================== 业务函数 ====================

/**
 * 解析用户意图（两阶段调用）
 * 第一阶段：意图分类
 * 第二阶段：根据场景调用专用提示词
 */
export async function parseIntent(
  text: string,
  currentDate: string,
  config: LLMConfig
): Promise<IntentData | null> {
  // 第一阶段：意图分类
  const classifyPrompt = getIntentClassifyPrompt(currentDate)
  const classifyResult = await callLLM<{ intent: string; date?: string; reply?: string }>(
    `用户输入："${text}"`,
    classifyPrompt,
    config
  )

  if (!classifyResult) return null

  // 处理 query 意图
  if (classifyResult.intent === 'query') {
    return {
      intent: 'query',
      date: classifyResult.date || currentDate
    } as IntentData
  }

  // 处理 update 意图
  if (classifyResult.intent === 'update') {
    return {
      intent: 'update'
    } as IntentData
  }

  // 处理 chat 意图
  if (classifyResult.intent === 'chat') {
    return {
      intent: 'chat',
      reply: classifyResult.reply || '有什么可以帮您的吗？'
    } as IntentData
  }

  // 第二阶段：会议或出差场景专用提示词
  if (classifyResult.intent === 'meeting') {
    const meetingPrompt = getMeetingPrompt(currentDate)
    return await callLLM<IntentData>(`用户输入："${text}"`, meetingPrompt, config)
  }

  if (classifyResult.intent === 'trip') {
    const tripPrompt = getTripPrompt(currentDate)
    return await callLLM<IntentData>(`用户输入："${text}"`, tripPrompt, config)
  }

  // 默认处理（未识别的意图）
  return {
    intent: 'chat',
    reply: '抱歉，我没有理解您的意思。请试着说"安排会议"或"出差"。'
  } as IntentData
}

/**
 * 生成会议议程
 */
export async function generateAgenda(
  eventContent: string,
  config: LLMConfig
): Promise<string> {
  const systemPrompt = `You are a meeting planning assistant. Generate a concise 3-item professional meeting agenda in Chinese. Return as JSON: {"agenda": "- 议题一：...\\n- 议题二：...\\n- 议题三：..."}`

  const result = await callLLM<{ agenda: string }>(
    `Generate agenda for: "${eventContent}"`,
    systemPrompt,
    config
  )

  if (!result?.agenda) {
    return '- 议题一：项目进度同步\n- 议题二：关键阻碍讨论\n- 议题三：下一步计划确认'
  }

  return result.agenda
}
