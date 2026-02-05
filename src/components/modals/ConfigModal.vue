<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SkillMeta, Scenario } from '../../types'
import type { LLMProvider } from '../../services/llmService'
import BaseModal from '../common/BaseModal.vue'

const props = defineProps<{
  show: boolean
  skillList: SkillMeta[]
  scenarioList: Scenario[]
  llmProvider: LLMProvider
  llmApiKey: string
  llmApiUrl: string
  llmModel: string
}>()

const emit = defineEmits<{
  close: []
  addSkill: []
  deleteSkill: [index: number]
  addScenario: []
  deleteScenario: [index: number]
  toggleScenarioSkill: [scenarioCode: string, skillCode: string]
  updateLLMConfig: [config: { provider?: LLMProvider; apiKey?: string; apiUrl?: string; model?: string }]
}>()

const configTab = ref<'scenarios' | 'skills' | 'llm'>('scenarios')

// LLM 本地编辑状态
const localProvider = ref<LLMProvider>(props.llmProvider)
const localApiKey = ref(props.llmApiKey)
const localApiUrl = ref(props.llmApiUrl)
const localModel = ref(props.llmModel)
const saveSuccess = ref(false)

// 监听 props 变化同步本地状态
import { watch } from 'vue'
watch(() => props.llmProvider, (v) => { localProvider.value = v })
watch(() => props.llmApiKey, (v) => { localApiKey.value = v })
watch(() => props.llmApiUrl, (v) => { localApiUrl.value = v })
watch(() => props.llmModel, (v) => { localModel.value = v })

// 默认配置提示
const providerDefaults = {
  gemini: { url: 'generativelanguage.googleapis.com', model: 'gemini-2.0-flash' },
  openai: { url: 'api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' }
}

const currentDefault = computed(() => providerDefaults[localProvider.value])

function saveLLMConfig() {
  emit('updateLLMConfig', {
    provider: localProvider.value,
    apiKey: localApiKey.value,
    apiUrl: localApiUrl.value,
    model: localModel.value
  })
  // 显示保存成功提示
  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
  }, 2000)
}

function hasSkill(scenario: Scenario, skillCode: string): boolean {
  return scenario.skills.includes(skillCode)
}
</script>

<template>
  <BaseModal :show="show" width="max-w-4xl" @close="emit('close')">
    <template #header>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
          <i class="fa-solid fa-sliders"></i>
        </div>
        <div>
          <h2 class="text-lg font-bold text-gray-800">设置中心</h2>
          <p class="text-xs text-gray-500">配置 Agent 的思考逻辑与技能链</p>
        </div>
      </div>
    </template>

    <div class="flex -m-6 h-[60vh]">
      <!-- Sidebar -->
      <div class="w-48 bg-gray-50 border-r border-gray-200 p-4 flex flex-col gap-2 shrink-0">
        <div 
          @click="configTab = 'scenarios'"
          :class="['config-sidebar-item', configTab === 'scenarios' ? 'active' : '']"
        >
          <i class="fa-solid fa-layer-group mr-2"></i> 场景编排
        </div>
        <div 
          @click="configTab = 'skills'"
          :class="['config-sidebar-item', configTab === 'skills' ? 'active' : '']"
        >
          <i class="fa-solid fa-cubes mr-2"></i> 技能库管理
        </div>
        <div 
          @click="configTab = 'llm'"
          :class="['config-sidebar-item', configTab === 'llm' ? 'active' : '']"
        >
          <i class="fa-solid fa-robot mr-2"></i> LLM 配置
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 bg-white">
        <!-- Scenarios Tab -->
        <div v-if="configTab === 'scenarios'">
          <div 
            v-for="scenario in scenarioList" 
            :key="scenario.code"
            class="mb-8 border border-gray-100 rounded-xl p-4 hover:border-blue-200 transition"
          >
            <div class="flex justify-between items-start mb-4">
              <div class="flex items-center gap-3">
                <div class="bg-gray-100 px-2 py-1 rounded text-xs font-mono text-gray-500">
                  {{ scenario.code }}
                </div>
                <input 
                  v-model="scenario.name"
                  class="font-bold text-gray-800 bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:border-blue-500 outline-none transition"
                />
              </div>
            </div>
            
            <div class="mb-4">
              <label class="form-label">触发关键词</label>
              <input 
                v-model="scenario.keywords"
                class="form-input"
              />
            </div>

            <div class="bg-gray-50 rounded-lg p-3">
              <div class="text-xs font-bold text-gray-500 mb-2 uppercase">启用技能</div>
              <div class="grid grid-cols-2 gap-3">
                <div 
                  v-for="skill in skillList" 
                  :key="skill.code"
                  class="flex items-center gap-2 p-2 rounded border bg-white cursor-pointer select-none"
                  :class="hasSkill(scenario, skill.code) ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'"
                  @click="emit('toggleScenarioSkill', scenario.code, skill.code)"
                >
                  <div 
                    :class="[
                      'w-4 h-4 rounded-sm flex items-center justify-center border',
                      hasSkill(scenario, skill.code) 
                        ? 'bg-blue-500 border-blue-500 text-white' 
                        : 'border-gray-300 bg-white'
                    ]"
                  >
                    <i v-if="hasSkill(scenario, skill.code)" class="fa-solid fa-check text-[10px]"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold truncate">{{ skill.name }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Skills Tab -->
        <div v-if="configTab === 'skills'">
          <div class="space-y-4">
            <div 
              v-for="(skill, idx) in skillList" 
              :key="skill.code"
              class="border border-gray-200 rounded-xl p-4 bg-white relative group hover:shadow-md transition"
            >
              <button 
                @click="emit('deleteSkill', idx)"
                class="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition"
              >
                <i class="fa-solid fa-trash-can"></i>
              </button>
              
              <div class="grid grid-cols-12 gap-4">
                <div class="col-span-2 flex flex-col items-center justify-center bg-gray-50 rounded-lg p-2">
                  <div class="w-8 h-8 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2">
                    <i :class="['fa-solid', skill.icon || 'fa-cube']"></i>
                  </div>
                  <input 
                    v-model="skill.icon"
                    class="text-[10px] text-center bg-transparent border-b border-gray-300 w-full outline-none"
                    placeholder="Icon"
                  >
                </div>
                <div class="col-span-10 space-y-2">
                  <div class="flex gap-2">
                    <input 
                      v-model="skill.name"
                      class="font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none transition w-1/2"
                      placeholder="技能名称"
                    >
                    <input 
                      v-model="skill.code"
                      class="text-xs font-mono text-gray-400 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none transition w-1/2 text-right"
                      placeholder="Code"
                    >
                  </div>
                  <input 
                    v-model="skill.description"
                    class="w-full text-xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none transition"
                    placeholder="技能描述"
                  >
                </div>
              </div>
            </div>

            <button 
              @click="emit('addSkill')"
              class="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold hover:border-blue-400 hover:text-blue-500 transition flex items-center justify-center gap-2"
            >
              <i class="fa-solid fa-plus"></i> 添加新技能
            </button>
          </div>
        </div>

        <!-- LLM Config Tab -->
        <div v-if="configTab === 'llm'">
          <div class="space-y-6">
            <!-- Provider Selection -->
            <div class="border border-gray-200 rounded-xl p-5 bg-white">
              <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <i class="fa-solid fa-server text-blue-500"></i> 模型提供商
              </h3>
              <div class="flex gap-4">
                <label 
                  class="flex-1 flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition"
                  :class="localProvider === 'gemini' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'"
                >
                  <input 
                    type="radio" 
                    v-model="localProvider" 
                    value="gemini"
                    class="w-4 h-4 text-blue-600"
                  >
                  <div>
                    <div class="font-bold text-gray-800">Google Gemini</div>
                    <div class="text-xs text-gray-500">官方 Gemini API</div>
                  </div>
                </label>
                <label 
                  class="flex-1 flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition"
                  :class="localProvider === 'openai' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'"
                >
                  <input 
                    type="radio" 
                    v-model="localProvider" 
                    value="openai"
                    class="w-4 h-4 text-blue-600"
                  >
                  <div>
                    <div class="font-bold text-gray-800">OpenAI 兼容</div>
                    <div class="text-xs text-gray-500">GPT / Azure / Ollama 等</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- API Key -->
            <div class="border border-gray-200 rounded-xl p-5 bg-white">
              <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <i class="fa-solid fa-key text-amber-500"></i> API Key
              </h3>
              <input 
                v-model="localApiKey"
                type="password"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                placeholder="输入您的 API Key..."
              >
              <p class="text-xs text-gray-400 mt-2">
                <i class="fa-solid fa-lock mr-1"></i> Key 仅保存在本地浏览器，不会上传至服务器
              </p>
            </div>

            <!-- Custom Endpoint (Optional) -->
            <div class="border border-gray-200 rounded-xl p-5 bg-white">
              <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <i class="fa-solid fa-link text-purple-500"></i> 自定义配置 
                <span class="text-xs font-normal text-gray-400">(可选)</span>
              </h3>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-sm text-gray-600 mb-1">API 地址</label>
                  <input 
                    v-model="localApiUrl"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 outline-none transition text-sm"
                    :placeholder="`默认: ${currentDefault.url}`"
                  >
                </div>
                <div>
                  <label class="block text-sm text-gray-600 mb-1">模型名称</label>
                  <input 
                    v-model="localModel"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 outline-none transition text-sm"
                    :placeholder="`默认: ${currentDefault.model}`"
                  >
                </div>
              </div>

              <div class="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                <i class="fa-solid fa-circle-info mr-1"></i>
                <template v-if="localProvider === 'gemini'">
                  Gemini 模式下，API Key 会作为 URL 参数传递
                </template>
                <template v-else>
                  OpenAI 兼容模式支持: OpenAI / Azure OpenAI / Ollama / vLLM / LocalAI 等
                </template>
              </div>
            </div>

            <!-- Save Button -->
            <button 
              @click="saveLLMConfig"
              :class="[
                'w-full py-3 font-bold rounded-xl transition flex items-center justify-center gap-2',
                saveSuccess 
                  ? 'bg-green-500 text-white' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              ]"
            >
              <i :class="saveSuccess ? 'fa-solid fa-check-circle' : 'fa-solid fa-check'"></i>
              {{ saveSuccess ? '保存成功!' : '保存配置' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>
