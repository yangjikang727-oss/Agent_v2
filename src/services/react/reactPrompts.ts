// ==================== ReAct提示词模板 ====================

/** ReAct各阶段提示词 */
export const REACT_PROMPTS = {
  /**
   * 系统提示词（多轮对话的 system message）
   * 包含角色、工具列表、可用技能、输出格式，不包含用户输入
   */
  SYSTEM: (toolsSummary: string, currentDate: string, availableSkills?: string) => `你是一个日程意图识别引擎。你的唯一任务是：识别日程类型 + 路由到正确的技能或工具。

当前日期：${currentDate}

## 核心规则（必须严格遵守）
1. 从用户输入中判断日程类型（会议/出差/修改/取消/查询/其他）
2. **技能类意图（会议/出差）**：调用 load_skill 加载技能指令，然后严格按照指令中的步骤执行
3. **工具类意图（查询/取消/修改）**：直接调用对应工具（schedule_query / cancel_schedule / edit_schedule）
4. **绝对禁止**询问用户补充信息、解释、确认
5. 如果无法识别为任何日程类型（纯闲聊/问答），直接用 Final Answer 回复
${availableSkills ? `
## 可用技能
以下技能可通过 load_skill 工具加载详细指令：
${availableSkills}
` : ''}
## 日期时间转换规则
- "今天" → ${currentDate}
- "明天" → 基于当前日期 +1 天
- "后天" → 基于当前日期 +2 天
- "下午3点" → 15:00，"上午10点" → 10:00，"下午6点" → 18:00
- 未指定日期时默认 ${currentDate}

## 可用工具
${toolsSummary || '（暂无可用工具）'}

## 输出格式
Thought: [一句话说明识别到的意图类型]
Action: [工具名称]
Action Input: {参数JSON，必须写在同一行}

非日程类请求：
Thought: [说明这不是日程请求]
Final Answer: [直接回复用户]

重要：
- Action Input 的 JSON 必须写在同一行，不要换行。
- Action 必须使用上面可用工具列表中的精确名称，不要编造工具名。
- 技能类意图（会议/出差）必须先 load_skill，再严格按返回的指令操作，不要跳步。
- 只需要思考和行动，不要追问用户。`,

  /**
   * 思维链推理阶段提示词
   */
  THINK: (toolsSummary: string, currentDate: string, userQuery: string, historyContext?: string) => `你是一个专业的日程管理AI助手，帮助用户安排会议、出差等日程。

当前日期：${currentDate}
${historyContext ? `
## 对话历史
${historyContext}
` : ''}
## 你的职责
1. 理解用户的日程请求，提取时间、地点、内容等信息
2. 结合对话历史理解用户意图，不要重复询问已提供的信息
3. 当收集到足够信息时，立即调用工具创建日程
4. 如果缺少关键信息，简洁地询问用户（一次只问一个问题）
5. 优先使用已提供的信息，避免不必要的确认

## 可用工具
${toolsSummary || '（暂无可用工具）'}

## 输出格式
当信息完整时，直接调用工具：
Thought: [分析已收集的信息，判断应调用哪个工具]
Action: [上面工具列表中的工具名称]
Action Input: {参数JSON，必须写在同一行}

当需要更多信息时：
Thought: [说明缺少什么信息]
Final Answer: [简洁地询问一个问题]

重要：Action Input 的 JSON 必须写在同一行，不要换行。

用户请求：${userQuery}`,

  /**
   * Skill 参数提取提示词（第二层披露）
   * 将匹配到的 Skill 指令 + 用户输入发给 LLM，提取结构化参数
   */
  SKILL_EXTRACT: (skillInstructions: string, currentDate: string, userQuery: string) => `你是一个参数提取引擎。根据以下技能指令中的参数说明，从用户输入中提取所有能识别的参数。

当前日期：${currentDate}

## 技能指令
${skillInstructions}

## 用户输入
"${userQuery}"

## 输出要求
返回 JSON 格式（不要添加任何其他内容）：
{"params": {"参数名": "提取的值", ...}, "confidence": 0.0-1.0, "reasoning": "提取逻辑"}

注意：
- 只提取能从用户输入中确认的参数，不要编造
- 时间格式转为 HH:mm（如 "下午3点" → "15:00"）
- 日期相对词转为具体日期（如 "明天" → 基于当前日期计算）
- 参会人/人员转为数组格式`,

  /**
   * 观察阶段提示词
   */
  OBSERVE: (observation: string, toolsSummary: string) => `工具执行结果：
${observation}

## 可用工具
${toolsSummary || '（暂无可用工具）'}

请基于以上观察结果继续推理。你可以：
1. 根据结果调整策略
2. 调用其他工具获取更多信息
3. 给出最终答案

请继续按照以下格式输出：
Thought: [基于观察结果的进一步推理]
Action: [上面工具列表中的工具名称] 或 Final Answer
Action Input: [工具参数json] 或 [最终回答]

重要：Action 必须使用上面可用工具列表中的精确名称，不要编造工具名。`,

  /**
   * 最终回答阶段提示词
   */
  FINAL: (query: string, thoughtProcess: string) => `基于完整的推理过程和工具调用结果，请给出最终的、友好的回答。

原始请求：${query}

推理过程回顾：
${thoughtProcess}

请给出简洁、准确、有用的最终回答：`,

  /**
   * 错误处理提示词
   */
  ERROR: (errorMessage: string, query: string) => `工具执行出现错误：
${errorMessage}

原始请求：${query}

请根据错误信息调整策略，或者告知用户无法完成请求的原因。`,

  /**
   * 通用问答提示词 - 当识别引擎判定非日程意图时使用
   */
  GENERAL_CHAT: (currentDate: string) => `你是一个友好、专业的 AI 助手。你可以回答各种问题、提供建议、进行日常对话。

当前日期：${currentDate}

## 你的特点
- 回答简洁、准确、有帮助
- 语气友好自然，像朋友聊天
- 如果用户的问题涉及日程管理（安排会议、出差等），请引导他们直接说出需求，你会帮他们创建
- 回答控制在 3-5 句话以内，除非用户明确要求详细解释

请直接回答用户的问题，不要使用任何特殊格式（如 Thought/Action/Final Answer）。`
}

// ==================== ReAct响应解析器 ====================

/** ReAct响应解析结果 */
export interface ReActStep {
  thought?: string
  action?: string
  actionInput?: any
  observation?: string
  finalAnswer?: string
  isError?: boolean
  errorMessage?: string
}

/**
 * 尝试从响应中解析多行JSON（Action Input 跨行场景）
 */
function tryParseMultiLineJSON(response: string): any {
  // 查找 Action Input: 后的内容，从第一个 { 到最后一个 }
  const inputStart = response.search(/(?:Action Input|参数|输入)[:：]/i)
  if (inputStart === -1) return undefined
  
  const afterLabel = response.slice(inputStart)
  const braceStart = afterLabel.indexOf('{')
  if (braceStart === -1) return undefined
  
  const jsonCandidate = afterLabel.slice(braceStart)
  
  // 从开头的 { 开始，找到配对的 }
  let depth = 0
  for (let i = 0; i < jsonCandidate.length; i++) {
    if (jsonCandidate[i] === '{') depth++
    else if (jsonCandidate[i] === '}') depth--
    
    if (depth === 0) {
      const jsonStr = jsonCandidate.slice(0, i + 1)
      try {
        return JSON.parse(jsonStr)
      } catch {
        return jsonStr.trim()
      }
    }
  }
  
  return undefined
}

/**
 * 解析ReAct响应文本
 */
export function parseReActResponse(response: string): ReActStep {
  const step: ReActStep = {}
  
  // 解析 Thought (支持中英文)
  const thoughtMatch = response.match(/(?:Thought|思考|分析)[:：]\s*([^\n]*?)(?=\n(?:Action|行动|Final Answer|最终答案|回答|Observation)|$)/is)
  if (thoughtMatch && thoughtMatch[1]) {
    step.thought = thoughtMatch[1].trim()
  }
  
  // 解析 Action 和 Action Input (支持中英文)
  const actionMatch = response.match(/(?:Action|行动|工具)[:：]\s*([^\n]*)/i)
  if (actionMatch && actionMatch[1]) {
    const actionValue = actionMatch[1].trim()
    // 排除 "Final Answer" 作为 Action
    if (actionValue.toLowerCase() !== 'final answer' && actionValue !== '最终答案') {
      step.action = actionValue
      
      // 先尝试单行JSON匹配
      const singleLineMatch = response.match(/(?:Action Input|参数|输入)[:：]\s*({.*})$/im)
      if (singleLineMatch && singleLineMatch[1]) {
        try {
          step.actionInput = JSON.parse(singleLineMatch[1])
        } catch {
          // 单行解析失败，尝试多行JSON
          step.actionInput = tryParseMultiLineJSON(response)
        }
      } else {
        // 没有单行匹配，尝试多行JSON
        step.actionInput = tryParseMultiLineJSON(response)
      }
    }
  }
  
  // 解析 Final Answer (支持中英文多种格式)
  const finalPatterns = [
    /Final Answer[:：]\s*([\s\S]*?)$/i,
    /最终答案[:：]\s*([\s\S]*?)$/i,
    /回答[:：]\s*([\s\S]*?)$/i,
    /答案[:：]\s*([\s\S]*?)$/i
  ]
  
  for (const pattern of finalPatterns) {
    const finalMatch = response.match(pattern)
    if (finalMatch && finalMatch[1]) {
      step.finalAnswer = finalMatch[1].trim()
      break
    }
  }
  
  // 兜底1：有 Thought 但无 Action 也无 Final Answer → LLM 直接在 Thought 后写了回答
  if (step.thought && !step.action && !step.finalAnswer) {
    // 提取 Thought 行之后的剩余文本作为答案
    const lines = response.split('\n')
    const thoughtLineIdx = lines.findIndex(l => /(?:Thought|思考|分析)[:：]/i.test(l))
    if (thoughtLineIdx >= 0 && thoughtLineIdx < lines.length - 1) {
      const afterThought = lines.slice(thoughtLineIdx + 1).join('\n').trim()
      if (afterThought) {
        step.finalAnswer = afterThought
      } else {
        // Thought 之后没有内容，将 Thought 本身作为答案
        step.finalAnswer = step.thought
      }
    } else {
      step.finalAnswer = step.thought
    }
  }
  
  // 兜底2：如果没有解析到任何标准格式，将整个响应作为最终答案
  if (!step.thought && !step.action && !step.finalAnswer) {
    step.finalAnswer = response.trim()
  }
  
  // 解析 Observation (通常由系统添加)
  const obsMatch = response.match(/Observation[:：]\s*([^\n].*)/is)
  if (obsMatch && obsMatch[1]) {
    step.observation = obsMatch[1].trim()
  }
  
  return step
}

/**
 * 格式化工具调用结果用于下一轮推理
 */
export function formatObservation(toolName: string, result: any): string {
  if (result.success === false) {
    return `❌ 工具 "${toolName}" 执行失败: ${result.error || '未知错误'}`
  }
  
  // 如果 data 是字符串（如 load_skill 返回的纯文本指令），直接输出
  if (typeof result.data === 'string') {
    return `✅ 工具 "${toolName}" 执行成功:\n${result.data}`
  }
  
  return `✅ 工具 "${toolName}" 执行成功:\n${JSON.stringify(result.data, null, 2)}`
}

/**
 * 构建完整的ReAct对话历史
 */
export function buildReActHistory(steps: ReActStep[]): string {
  return steps.map((step, index) => {
    let output = `[第${index + 1}步]\n`
    
    if (step.thought) {
      output += `Thought: ${step.thought}\n`
    }
    
    if (step.action) {
      output += `Action: ${step.action}\n`
      if (step.actionInput) {
        output += `Action Input: ${JSON.stringify(step.actionInput, null, 2)}\n`
      }
    }
    
    if (step.observation) {
      output += `Observation: ${step.observation}\n`
    }
    
    if (step.finalAnswer) {
      output += `Final Answer: ${step.finalAnswer}\n`
    }
    
    if (step.isError) {
      output += `Error: ${step.errorMessage}\n`
    }
    
    return output
  }).join('\n---\n')
}
