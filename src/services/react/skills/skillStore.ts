/**
 * Skill Store - OpenCode 式懒加载管理
 * 
 * 技能管理机制：
 * - 启动时加载所有 SKILL.md 元数据和指令到内存
 * - 元数据（name + description）注入系统提示词，供 Agent 识别意图
 * - Agent 调用 load_skill 工具时，按名称返回完整指令
 * - Agent 阅读指令后调用 trigger_action 执行 UI 动作
 */

import type { SkillMetadata, SkillInstruction, ParsedSkill } from './skillLoader'
import { loadAllSkillFiles } from './skillLoader'

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

  // ==================== 元数据访问（供系统提示词注入） ====================

  /**
   * 获取所有技能的元数据
   * 用于注入 LLM 系统提示词
   */
  getAllMetadata(): SkillMetadata[] {
    this.ensureInit()
    return Array.from(this.skills.values()).map(s => s.metadata)
  }

  /**
   * 获取所有技能的描述摘要（用于 LLM 系统提示词）
   * 格式：每行一个 "- name: description"
   */
  getMetadataSummary(): string {
    return this.getAllMetadata()
      .map(m => `- ${m.name}: ${m.description}`)
      .join('\n')
  }

  // ==================== 指令访问（供 load_skill 工具调用） ====================

  /**
   * 获取技能的完整指令
   * load_skill 工具调用此方法返回 Markdown 正文
   */
  getInstruction(name: string): SkillInstruction | undefined {
    this.ensureInit()
    return this.skills.get(name)?.instruction
  }

  /**
   * 获取技能的 UI 动作名
   * 返回 SKILL.md frontmatter 中的 action 字段
   */
  getAction(name: string): string | undefined {
    this.ensureInit()
    return this.skills.get(name)?.metadata.action
  }

  // ==================== 辅助方法 ====================

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
}

// ==================== 全局单例 ====================

export const skillStore = new SkillStore()
