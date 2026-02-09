/**
 * Skill Loader - SKILL.md 文件解析器
 * 
 * 对齐 Qoder Skill 的文件格式：
 * - YAML frontmatter（--- ... ---）→ 元数据（第一层）
 * - Markdown 正文 → 核心指令（第二层）
 * 
 * 使用 Vite 的 import.meta.glob 在构建时加载所有 SKILL.md 文件
 */

// ==================== 类型定义 ====================

/** 第一层：元数据（~100 Token，始终加载） */
export interface SkillMetadata {
  /** 技能唯一标识 */
  name: string
  /** 能力描述（LLM 用它做意图匹配） */
  description: string
  /** 关键词标签 */
  tags: string[]
  /** 技能类别 */
  category: string
  /** 优先级（数字越小越高） */
  priority: number
  /** 触发的 UI 动作名 */
  action: string
}

/** 第二层：核心指令（~500 Token，匹配后加载） */
export interface SkillInstruction {
  /** 技能名称 */
  name: string
  /** Markdown 正文（完整指令文本） */
  instructions: string
}

/** 完整解析结果 */
export interface ParsedSkill {
  /** 第一层：元数据 */
  metadata: SkillMetadata
  /** 第二层：核心指令 */
  instruction: SkillInstruction
  /** 原始 Markdown 全文 */
  raw: string
}

// ==================== YAML Frontmatter 解析 ====================

/**
 * 解析 YAML frontmatter
 * 从 --- ... --- 之间提取键值对
 */
function parseFrontmatter(raw: string): { frontmatter: Record<string, any>; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = raw.match(frontmatterRegex)

  if (!match) {
    return { frontmatter: {}, body: raw }
  }

  const yamlStr = match[1] || ''
  const body = match[2] || ''
  const frontmatter: Record<string, any> = {}

  // 逐行解析简单 YAML（不引入重型 YAML 库）
  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmed.slice(0, colonIndex).trim()
    let value: any = trimmed.slice(colonIndex + 1).trim()

    // 解析数组格式：[a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0)
    }
    // 解析数字
    else if (/^\d+$/.test(value)) {
      value = parseInt(value, 10)
    }
    // 解析布尔
    else if (value === 'true') {
      value = true
    } else if (value === 'false') {
      value = false
    }

    frontmatter[key] = value
  }

  return { frontmatter, body: body.trim() }
}

// ==================== SKILL.md 文件解析 ====================

/**
 * 解析单个 SKILL.md 文件内容
 */
export function parseSkillMd(raw: string): ParsedSkill | null {
  const { frontmatter, body } = parseFrontmatter(raw)

  // 验证必需字段
  if (!frontmatter.name || !frontmatter.description) {
    console.warn('[SkillLoader] SKILL.md 缺少必需字段 name/description')
    return null
  }

  const metadata: SkillMetadata = {
    name: frontmatter.name,
    description: frontmatter.description,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    category: frontmatter.category || 'utility',
    priority: typeof frontmatter.priority === 'number' ? frontmatter.priority : 99,
    action: frontmatter.action || ''
  }

  const instruction: SkillInstruction = {
    name: frontmatter.name,
    instructions: body
  }

  return { metadata, instruction, raw }
}

// ==================== 批量加载 ====================

/**
 * 加载所有 SKILL.md 文件
 * 使用 Vite 的 import.meta.glob 在构建时收集所有 SKILL.md
 */
export function loadAllSkillFiles(): ParsedSkill[] {
  const skillFiles = import.meta.glob('./*/SKILL.md', { eager: true, query: '?raw', import: 'default' })

  const skills: ParsedSkill[] = []

  for (const [path, raw] of Object.entries(skillFiles)) {
    if (typeof raw !== 'string') {
      console.warn(`[SkillLoader] 无法读取文件: ${path}`)
      continue
    }

    const parsed = parseSkillMd(raw)
    if (parsed) {
      skills.push(parsed)
      console.log(`[SkillLoader] 已加载技能: ${parsed.metadata.name} (${path})`)
    } else {
      console.warn(`[SkillLoader] 解析失败: ${path}`)
    }
  }

  // 按优先级排序
  skills.sort((a, b) => a.metadata.priority - b.metadata.priority)

  console.log(`[SkillLoader] 共加载 ${skills.length} 个技能`)
  return skills
}
