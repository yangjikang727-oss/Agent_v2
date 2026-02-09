/**
 * Skill Store - 三层渐进式披露管理
 * 
 * 完全对齐 Qoder Skill 的渐进式披露机制：
 * - 第一层（元数据 ~100 Token）：启动时加载，用于 LLM 动态意图匹配
 * - 第二层（核心指令 ~500 Token）：匹配后加载，用于参数提取
 * - 第三层（执行）：按指令中声明的 action 触发 UI 动作
 */

import type { SkillMetadata, SkillInstruction, ParsedSkill } from './skillLoader'
import { loadAllSkillFiles } from './skillLoader'
import { callLLMRaw, type LLMConfig } from '../../core/llmCore'

// ==================== 匹配结果类型 ====================

/** Skill 匹配结果 */
export interface SkillMatchResult {
  /** 是否匹配到技能 */
  matched: boolean
  /** 匹配的技能名称 */
  skillName: string
  /** 匹配置信度 (0-1) */
  confidence: number
  /** 推理过程 */
  reasoning: string
}

// ==================== Skill Store ====================

class SkillStore {
  /** 已加载的技能（完整解析结果） */
  private skills: Map<string, ParsedSkill> = new Map()
  /** 是否已初始化 */
  private initialized = false

  // ==================== 初始化 ====================

  /**
   * 加载所有 SKILL.md 文件并缓存
   * 应在应用启动时调用一次
   */
  loadAllSkills(): void {
    if (this.initialized) {
      console.log('[SkillStore] 已初始化，跳过重复加载')
      return
    }

    const parsedSkills = loadAllSkillFiles()

    for (const skill of parsedSkills) {
      this.skills.set(skill.metadata.name, skill)
    }

    this.initialized = true
    console.log(`[SkillStore] 初始化完成，已注册 ${this.skills.size} 个技能`)
  }

  /**
   * 确保已初始化
   */
  private ensureInit(): void {
    if (!this.initialized) {
      this.loadAllSkills()
    }
  }

  // ==================== 第一层：元数据访问 ====================

  /**
   * 获取所有技能的元数据（第一层）
   * 用于注入 LLM 提示词进行意图匹配
   */
  getAllMetadata(): SkillMetadata[] {
    this.ensureInit()
    return Array.from(this.skills.values()).map(s => s.metadata)
  }

  /**
   * 获取所有技能的描述摘要（用于 LLM 提示词）
   * 格式：每行一个 "- name: description"
   */
  getMetadataSummary(): string {
    return this.getAllMetadata()
      .map(m => `- ${m.name}: ${m.description}`)
      .join('\n')
  }

  // ==================== 第一层：LLM 动态意图匹配 ====================

  /**
   * 使用 LLM 动态匹配技能（第一层披露）
   * 将所有 Skill 的 name + description 注入提示词，让 LLM 判断用户意图
   */
  async matchSkill(userInput: string, llmConfig: LLMConfig): Promise<SkillMatchResult> {
    this.ensureInit()

    const metadata = this.getAllMetadata()
    if (metadata.length === 0) {
      return { matched: false, skillName: '', confidence: 0, reasoning: '无可用技能' }
    }

    // 先尝试关键词快速匹配（节省 LLM 调用）
    const quickMatch = this.quickTagMatch(userInput)
    if (quickMatch && quickMatch.confidence >= 0.8) {
      console.log(`[SkillStore] 关键词快速匹配: ${quickMatch.skillName} (${quickMatch.confidence})`)
      return quickMatch
    }

    // 构建第一层提示词
    const skillList = metadata.map(m =>
      `技能名: ${m.name}\n描述: ${m.description}\n标签: ${m.tags.join(', ')}`
    ).join('\n\n')

    const prompt = `你是一个意图识别引擎。根据用户输入，判断应该匹配哪个技能。

## 可用技能
${skillList}

## 用户输入
"${userInput}"

## 输出要求
返回 JSON 格式（不要添加任何其他内容）：
{"matched": true/false, "skillName": "技能名", "confidence": 0.0-1.0, "reasoning": "匹配理由"}

如果用户输入不匹配任何技能，返回 {"matched": false, "skillName": "", "confidence": 0, "reasoning": "原因"}`

    try {
      const response = await callLLMRaw(prompt, '', llmConfig)
      if (!response) {
        console.warn('[SkillStore] LLM 返回空响应，使用兜底匹配')
        return quickMatch || { matched: false, skillName: '', confidence: 0, reasoning: 'LLM 无响应' }
      }

      const parsed = this.parseJSON<SkillMatchResult>(response)
      if (parsed && parsed.matched && this.skills.has(parsed.skillName)) {
        console.log(`[SkillStore] LLM 匹配结果: ${parsed.skillName} (${parsed.confidence})`)
        return parsed
      }

      // LLM 返回了不存在的技能名
      if (parsed && parsed.matched && !this.skills.has(parsed.skillName)) {
        console.warn(`[SkillStore] LLM 返回了不存在的技能: ${parsed.skillName}`)
        return quickMatch || { matched: false, skillName: '', confidence: 0, reasoning: '技能不存在' }
      }

      return parsed || { matched: false, skillName: '', confidence: 0, reasoning: '解析失败' }

    } catch (error) {
      console.error('[SkillStore] LLM 意图匹配失败:', error)
      // 兜底：使用关键词匹配
      return quickMatch || { matched: false, skillName: '', confidence: 0, reasoning: 'LLM 调用失败' }
    }
  }

  // ==================== 第二层：核心指令访问 ====================

  /**
   * 获取技能的完整指令（第二层）
   * 匹配成功后调用，返回 Markdown 正文
   */
  getInstruction(name: string): SkillInstruction | undefined {
    this.ensureInit()
    return this.skills.get(name)?.instruction
  }

  // ==================== 第三层：执行动作 ====================

  /**
   * 获取技能的 UI 动作名（第三层入口）
   * 返回 SKILL.md frontmatter 中的 action 字段
   */
  getAction(name: string): string | undefined {
    this.ensureInit()
    return this.skills.get(name)?.metadata.action
  }

  // ==================== 辅助方法 ====================

  /**
   * 关键词快速匹配（兜底方案）
   * 基于 tags 进行关键词匹配，无需 LLM 调用
   */
  private quickTagMatch(userInput: string): SkillMatchResult | null {
    this.ensureInit()
    const input = userInput.toLowerCase()

    let bestMatch: { name: string; score: number } | null = null

    for (const [name, skill] of this.skills) {
      const tags = skill.metadata.tags
      let matchCount = 0

      for (const tag of tags) {
        if (input.includes(tag.toLowerCase())) {
          matchCount++
        }
      }

      if (matchCount > 0) {
        const score = matchCount / tags.length
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { name, score }
        }
      }
    }

    if (bestMatch) {
      // 将 tag 匹配率映射到置信度
      const confidence = Math.min(0.5 + bestMatch.score * 0.5, 1.0)
      return {
        matched: true,
        skillName: bestMatch.name,
        confidence,
        reasoning: `关键词匹配 (score: ${bestMatch.score.toFixed(2)})`
      }
    }

    return null
  }

  /**
   * 获取技能完整信息
   */
  getSkill(name: string): ParsedSkill | undefined {
    this.ensureInit()
    return this.skills.get(name)
  }

  /**
   * 检查技能是否存在
   */
  hasSkill(name: string): boolean {
    this.ensureInit()
    return this.skills.has(name)
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; names: string[] } {
    this.ensureInit()
    return {
      total: this.skills.size,
      names: Array.from(this.skills.keys())
    }
  }

  /**
   * JSON 解析辅助
   */
  private parseJSON<T>(response: string): T | null {
    try {
      // 尝试提取 JSON 代码块
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
      let jsonStr = (jsonMatch && jsonMatch[1]) ? jsonMatch[1] : response

      if (!jsonStr) return null

      // 清理非 JSON 内容
      const jsonStart = jsonStr.indexOf('{')
      const jsonEnd = jsonStr.lastIndexOf('}')

      if (jsonStart === -1 || jsonEnd === -1) return null

      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1)
      return JSON.parse(jsonStr) as T
    } catch {
      console.error('[SkillStore] JSON 解析失败')
      return null
    }
  }
}

// ==================== 全局单例 ====================

export const skillStore = new SkillStore()
