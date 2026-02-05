// ==================== ReAct提示词模板 ====================

/** ReAct各阶段提示词 */
export const REACT_PROMPTS = {
  /**
   * 思维链推理阶段提示词
   */
  THINK: (toolsSummary: string, currentDate: string, userQuery: string) => `你是一个专业的日程管理AI助手，帮助用户安排会议、出差等日程。

当前日期：${currentDate}

## 你的职责
1. 理解用户的日程请求，提取时间、地点、内容等信息
2. 对于简单请求（问候、安排日程），直接友好回复
3. 只有需要查询已有日程或检测冲突时，才调用工具

## 可用工具
${toolsSummary || '（暂无可用工具）'}

## 输出格式
对于大多数请求，直接给出回复即可：
Final Answer: [你的回复]

只有需要调用工具时，使用：
Thought: [分析]
Action: [工具名]
Action Input: {"参数": "值"}

用户请求：${userQuery}`,

  /**
   * 观察阶段提示词
   */
  OBSERVE: (observation: string, toolsSummary: string) => `工具执行结果：
${observation}

请基于以上观察结果继续推理。你可以：
1. 根据结果调整策略
2. 调用其他工具获取更多信息
3. 给出最终答案

请继续按照以下格式输出：
Thought: [基于观察结果的进一步推理]
Action: [下一个要调用的工具名称] 或 Final Answer
Action Input: [工具参数json] 或 [最终回答]`,

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

请根据错误信息调整策略，或者告知用户无法完成请求的原因。`
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
      
      const inputMatch = response.match(/(?:Action Input|参数|输入)[:：]\s*({.*?})(?=\n|$)/is)
      if (inputMatch && inputMatch[1]) {
        try {
          step.actionInput = JSON.parse(inputMatch[1])
        } catch (e) {
          step.actionInput = inputMatch[1].trim()
        }
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
  
  // 兜底：如果没有解析到任何标准格式，且没有Action，将整个响应作为最终答案
  if (!step.thought && !step.action && !step.finalAnswer) {
    // LLM直接给出了回答，没有使用标准格式
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
  
  return `✅ 工具 "${toolName}" 执行成功:
${JSON.stringify(result.data, null, 2)}`
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