import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { SkillMeta, Scenario } from '../types'
import { DEFAULT_SKILLS, DEFAULT_SCENARIOS } from '../types'
import type { LLMProvider, LLMConfig } from '../services/llmService'

export const useConfigStore = defineStore('config', () => {
  // 状态
  const skillList = ref<SkillMeta[]>([...DEFAULT_SKILLS])
  const scenarioList = ref<Scenario[]>([...DEFAULT_SCENARIOS])
  
  // LLM 配置 (默认使用阿里云 DashScope 兼容模式)
  const llmProvider = ref<LLMProvider>('openai')  // 使用openai兼容模式
  const llmApiKey = ref('sk-a23f6b429715488ab64eac9d90b15146')
  const llmApiUrl = ref('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  const llmModel = ref('qwen-max')

  // 兼容旧版 apiKey
  const apiKey = computed({
    get: () => llmApiKey.value,
    set: (val: string) => { llmApiKey.value = val }
  })

  // 获取 LLM 配置对象
  const llmConfig = computed<LLMConfig>(() => ({
    provider: llmProvider.value,
    apiKey: llmApiKey.value,
    apiUrl: llmApiUrl.value || undefined,
    model: llmModel.value || undefined
  }))

  // 获取技能
  function getSkill(code: string): SkillMeta | undefined {
    return skillList.value.find(s => s.code === code)
  }

  // 添加技能
  function addSkill(skill: SkillMeta) {
    skillList.value.push(skill)
  }

  // 更新技能
  function updateSkill(code: string, updates: Partial<SkillMeta>) {
    const skill = skillList.value.find(s => s.code === code)
    if (skill) {
      Object.assign(skill, updates)
    }
  }

  // 删除技能
  function deleteSkill(index: number) {
    skillList.value.splice(index, 1)
  }

  // 获取场景
  function getScenario(code: string): Scenario | undefined {
    return scenarioList.value.find(s => s.code === code)
  }

  // 添加场景
  function addScenario(scenario: Scenario) {
    scenarioList.value.push(scenario)
  }

  // 更新场景
  function updateScenario(code: string, updates: Partial<Scenario>) {
    const scenario = scenarioList.value.find(s => s.code === code)
    if (scenario) {
      Object.assign(scenario, updates)
    }
  }

  // 删除场景
  function deleteScenario(index: number) {
    scenarioList.value.splice(index, 1)
  }

  // 检查场景是否包含技能
  function hasSkill(scenario: Scenario, skillCode: string): boolean {
    return scenario.skills.includes(skillCode)
  }

  // 切换场景技能
  function toggleScenarioSkill(scenarioCode: string, skillCode: string) {
    const scenario = scenarioList.value.find(s => s.code === scenarioCode)
    if (scenario) {
      const idx = scenario.skills.indexOf(skillCode)
      if (idx > -1) {
        scenario.skills.splice(idx, 1)
      } else {
        scenario.skills.push(skillCode)
      }
    }
  }

  // 根据关键词匹配场景
  function matchScenario(text: string): Scenario | null {
    for (const scenario of scenarioList.value) {
      const keywords = scenario.keywords.split(/,|，/).map(k => k.trim())
      if (keywords.some(k => text.includes(k))) {
        return scenario
      }
    }
    return null
  }

  // 设置 API Key
  function setApiKey(key: string) {
    llmApiKey.value = key
  }

  // 设置 LLM 配置
  function setLLMConfig(config: Partial<LLMConfig>) {
    if (config.provider !== undefined) llmProvider.value = config.provider
    if (config.apiKey !== undefined) llmApiKey.value = config.apiKey
    if (config.apiUrl !== undefined) llmApiUrl.value = config.apiUrl
    if (config.model !== undefined) llmModel.value = config.model
  }

  return {
    // 状态
    skillList,
    scenarioList,
    apiKey,
    // LLM 配置
    llmProvider,
    llmApiKey,
    llmApiUrl,
    llmModel,
    llmConfig,
    // 方法
    getSkill,
    addSkill,
    updateSkill,
    deleteSkill,
    getScenario,
    addScenario,
    updateScenario,
    deleteScenario,
    hasSkill,
    toggleScenarioSkill,
    matchScenario,
    setApiKey,
    setLLMConfig
  }
})
