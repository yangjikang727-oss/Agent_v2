/**
 * Skill Selector Prompts - 技能选择推理提示词模板
 * 
 * 基于推理的 Skill 选择，而非规则匹配
 */

import type { SkillSpec, SkillContext, ExecutionHistoryEntry } from './skillTypes'

// ==================== 系统提示词 ====================

export const SKILL_SELECTOR_SYSTEM_PROMPT = `你是一个智能技能调度系统，负责根据用户输入选择合适的技能（Skill）来完成任务。

## 你的职责

1. **理解意图**：准确理解用户想要完成什么任务
2. **选择技能**：从可用技能列表中选择最合适的技能
3. **提取参数**：从用户输入中提取技能所需的参数
4. **判断完整性**：检查必填参数是否齐全
5. **主动澄清**：当关键信息缺失时，生成澄清问题

## 核心原则

- **推理优先**：通过推理决定是否调用技能，而非硬编码规则
- **不猜测**：关键信息缺失时必须反问用户，不要猜测或补全
- **精准匹配**：只在用户意图明确匹配时才选择技能
- **一次一问**：需要澄清时，一次只问一个最关键的问题

## 输出格式

你必须以JSON格式输出决策结果，格式如下：

### 1. 调用技能 (skill_call)
\`\`\`json
{
  "decision": "skill_call",
  "skill_name": "技能名称",
  "params": { "参数名": "参数值" },
  "confidence": 0.95,
  "reasoning": "推理过程说明"
}
\`\`\`

### 2. 需要澄清 (clarification)
\`\`\`json
{
  "decision": "clarification",
  "skill_name": "技能名称",
  "missing_fields": ["缺失字段1", "缺失字段2"],
  "question": "需要问用户的问题",
  "reasoning": "推理过程说明"
}
\`\`\`

### 3. 延迟执行 (pending)
\`\`\`json
{
  "decision": "pending",
  "skill_name": "技能名称",
  "partial_params": { "已有参数": "值" },
  "waiting_for": "等待的信息",
  "reasoning": "推理过程说明"
}
\`\`\`

### 4. 技能链 (chain)
\`\`\`json
{
  "decision": "chain",
  "skills": [
    { "skill_name": "技能1", "params": {} },
    { "skill_name": "技能2", "params": {}, "depends_on": "技能1" }
  ],
  "reasoning": "推理过程说明"
}
\`\`\`

### 5. 无匹配 (no_match)
\`\`\`json
{
  "decision": "no_match",
  "reason": "无法匹配的原因",
  "suggestion": "建议用户怎么做",
  "reasoning": "推理过程说明"
}
\`\`\`

## 重要提醒

1. 时间表达要精确：
   - "下周三" 需要转换为具体日期
   - "下午" 需要明确具体时间
   - 时间模糊时必须澄清

2. 对象要明确：
   - "和张总开会" 需要明确张总的全名或联系方式
   - "给他发邮件" 需要明确"他"是谁

3. 参数验证：
   - 检查参数类型是否正确
   - 检查枚举值是否在允许范围内
   - 检查数值是否在有效区间`

// ==================== 构建用户提示词 ====================

/**
 * 构建技能列表描述
 */
export function buildSkillsDescription(specs: SkillSpec[]): string {
  if (specs.length === 0) {
    return '当前没有可用的技能。'
  }
  
  return specs.map((spec, index) => {
    const requiredFields = spec.input_schema
      .filter(f => spec.required_fields.includes(f.name))
      .map(f => `${f.name}(${f.type}): ${f.description}`)
      .join('\n    - ')
    
    const optionalFields = spec.input_schema
      .filter(f => !spec.required_fields.includes(f.name))
      .map(f => `${f.name}(${f.type}): ${f.description}`)
      .join('\n    - ')
    
    const examples = spec.examples?.map(e => 
      `  用户: "${e.userInput}" → ${e.expectedAction}`
    ).join('\n') || '无'
    
    return `## ${index + 1}. ${spec.name}

**描述**: ${spec.description}

**适用条件**: ${spec.when_to_use}
${spec.when_not_to_use ? `**不适用**: ${spec.when_not_to_use}` : ''}

**必填参数**:
    - ${requiredFields || '无'}

**可选参数**:
    - ${optionalFields || '无'}

**支持组合**: ${spec.composable ? '是' : '否'}
**支持延迟**: ${spec.deferred_allowed ? '是' : '否'}

**示例**:
${examples}`
  }).join('\n\n---\n\n')
}

/**
 * 构建上下文信息
 */
export function buildContextInfo(context: SkillContext): string {
  const parts: string[] = []
  
  parts.push(`当前日期: ${context.currentDate}`)
  parts.push(`用户ID: ${context.userId}`)
  
  // 活跃技能信息
  if (context.activeSkill) {
    const filledSlots = context.activeSkill.slots
      .filter(s => s.filled)
      .map(s => `${s.field}=${JSON.stringify(s.value)}`)
      .join(', ')
    
    parts.push(`\n当前活跃技能: ${context.activeSkill.skillName}`)
    parts.push(`状态: ${context.activeSkill.status}`)
    parts.push(`已填充参数: ${filledSlots || '无'}`)
  }
  
  // Pending 技能
  if (context.pendingSkills.length > 0) {
    parts.push(`\n等待中的技能:`)
    context.pendingSkills.forEach(ps => {
      parts.push(`  - ${ps.skillName}: 等待 "${ps.waitingFor}"`)
    })
  }
  
  // 上下文变量
  if (Object.keys(context.variables).length > 0) {
    parts.push(`\n上下文变量:`)
    Object.entries(context.variables).forEach(([key, value]) => {
      parts.push(`  - ${key}: ${JSON.stringify(value)}`)
    })
  }
  
  return parts.join('\n')
}

/**
 * 构建历史记录摘要
 */
export function buildHistorySummary(history: ExecutionHistoryEntry[], limit: number = 5): string {
  if (history.length === 0) {
    return '无历史记录'
  }
  
  const recent = history.slice(-limit)
  
  return recent.map(entry => {
    const status = entry.result.status === 'success' ? '✓' : '✗'
    return `${status} [${entry.skillName}] ${entry.userInput} (${entry.result.status})`
  }).join('\n')
}

/**
 * 构建完整的用户提示词
 */
export function buildSelectorPrompt(
  userInput: string,
  specs: SkillSpec[],
  context: SkillContext
): string {
  const skillsDescription = buildSkillsDescription(specs)
  const contextInfo = buildContextInfo(context)
  const historySummary = buildHistorySummary(context.history)
  
  return `# 可用技能列表

${skillsDescription}

---

# 当前上下文

${contextInfo}

---

# 最近执行历史

${historySummary}

---

# 用户输入

"${userInput}"

---

# 任务

请分析用户输入，决定应该如何处理。按照系统提示中的格式输出 JSON 决策结果。

注意：
1. 仔细分析用户意图，选择最合适的技能
2. 从用户输入中提取所有可以提取的参数
3. 如果必填参数缺失，生成友好的澄清问题
4. 时间相关的参数需要转换为具体日期时间
5. 输出必须是有效的 JSON 格式`
}

// ==================== 澄清问题生成 ====================

/**
 * 构建澄清问题提示词
 */
export function buildClarificationPrompt(
  skillName: string,
  spec: SkillSpec,
  missingFields: string[],
  existingParams: Record<string, any>,
  context: SkillContext
): string {
  const fieldDescriptions = missingFields.map(fieldName => {
    const field = spec.input_schema.find(f => f.name === fieldName)
    if (!field) return `${fieldName}: 未知字段`
    
    const prompt = field.clarificationPrompt || `请提供${field.description}`
    const examples = field.examples?.join('、') || ''
    
    return `- ${fieldName} (${field.type}): ${field.description}
  提问模板: "${prompt}"
  ${examples ? `示例值: ${examples}` : ''}`
  }).join('\n')
  
  const existingInfo = Object.entries(existingParams)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')
  
  return `# 澄清任务

用户想要执行 "${skillName}" 技能，但缺少以下必要信息：

${fieldDescriptions}

已有信息：
${existingInfo || '无'}

当前日期: ${context.currentDate}

请生成一个简洁、友好的问题来询问用户缺失的信息。

要求：
1. 一次只问一个最关键的问题
2. 问题要自然、口语化
3. 如果有多个选项，可以列出供用户选择
4. 结合上下文，避免问已知的信息

输出格式：
{
  "question": "你要问的问题",
  "field": "对应的字段名",
  "options": ["选项1", "选项2"] // 可选，如果有明确选项
}`
}

// ==================== 解析器 ====================

/**
 * 解析 Selector 输出
 */
export function parseSelectorResponse(response: string): {
  success: boolean
  decision?: any
  error?: string
} {
  try {
    // 尝试提取 JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    let jsonStr: string = (jsonMatch && jsonMatch[1]) ? jsonMatch[1] : response
    
    if (!jsonStr) {
      return {
        success: false,
        error: '响应内容为空'
      }
    }
    
    // 清理可能的非 JSON 内容
    const jsonStart = jsonStr.indexOf('{')
    const jsonEnd = jsonStr.lastIndexOf('}')
    
    if (jsonStart === -1 || jsonEnd === -1) {
      return {
        success: false,
        error: '未找到有效的 JSON 结构'
      }
    }
    
    jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1)
    
    const parsed = JSON.parse(jsonStr)
    
    // 验证必要字段
    if (!parsed.decision) {
      return {
        success: false,
        error: '缺少 decision 字段'
      }
    }
    
    return {
      success: true,
      decision: parsed
    }
    
  } catch (error) {
    return {
      success: false,
      error: `JSON 解析失败: ${(error as Error).message}`
    }
  }
}

/**
 * 将解析结果转换为 SelectorDecision 类型
 */
export function toSelectorDecision(parsed: any): import('./skillTypes').SelectorDecision {
  switch (parsed.decision) {
    case 'skill_call':
      return {
        type: 'skill_call',
        skillName: parsed.skill_name,
        params: parsed.params || {},
        confidence: parsed.confidence || 0.8,
        reasoning: parsed.reasoning || ''
      }
      
    case 'clarification':
      return {
        type: 'clarification',
        skillName: parsed.skill_name,
        missingFields: parsed.missing_fields || [],
        questions: [{
          field: parsed.missing_fields?.[0] || '',
          question: parsed.question || '',
          options: parsed.options
        }],
        reasoning: parsed.reasoning || ''
      }
      
    case 'pending':
      return {
        type: 'pending',
        skillName: parsed.skill_name,
        partialParams: parsed.partial_params || {},
        waitingFor: parsed.waiting_for || '',
        timeout: parsed.timeout || 300000,
        reasoning: parsed.reasoning || ''
      }
      
    case 'chain':
      return {
        type: 'chain',
        skills: (parsed.skills || []).map((s: any) => ({
          skillName: s.skill_name,
          params: s.params || {},
          dependsOn: s.depends_on
        })),
        reasoning: parsed.reasoning || ''
      }
      
    case 'no_match':
    default:
      return {
        type: 'no_match',
        reason: parsed.reason || '无法匹配合适的技能',
        suggestion: parsed.suggestion,
        reasoning: parsed.reasoning || ''
      }
  }
}
