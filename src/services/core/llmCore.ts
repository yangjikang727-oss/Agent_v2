/**
 * LLM 核心服务 - 共享基础调用方法
 * 该模块被传统模式和ReAct模式共同使用
 */

// ==================== 类型定义 ====================

/** LLM 提供商类型 */
export type LLMProvider = 'gemini' | 'openai'

/** LLM 配置 */
export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  apiUrl?: string      // OpenAI 兼容模式可自定义 URL
  model?: string       // OpenAI 兼容模式可自定义模型
}

/** 默认配置 */
const DEFAULT_CONFIGS: Record<LLMProvider, { url: string; model: string }> = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    model: 'gemini-2.0-flash'
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  }
}

// 重试延迟时间 (毫秒)
const RETRY_DELAYS = [1000, 2000, 4000]

// ==================== Gemini 格式 ====================

async function callGemini<T>(
  prompt: string,
  systemInstruction: string,
  config: LLMConfig
): Promise<T | null> {
  const url = `${config.apiUrl || DEFAULT_CONFIGS.gemini.url}?key=${config.apiKey}`
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: { responseMimeType: 'application/json' }
  }

  for (let i = 0; i <= RETRY_DELAYS.length; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('Empty response from Gemini')
      
      return JSON.parse(text) as T
    } catch (error) {
      console.warn(`[Gemini] Attempt ${i + 1} failed:`, error)
      if (i === RETRY_DELAYS.length) {
        console.error('[Gemini] All retries failed')
        return null
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]))
    }
  }

  return null
}

// ==================== OpenAI 兼容格式 ====================

async function callOpenAI<T>(
  prompt: string,
  systemInstruction: string,
  config: LLMConfig
): Promise<T | null> {
  const url = config.apiUrl || DEFAULT_CONFIGS.openai.url
  const model = config.model || DEFAULT_CONFIGS.openai.model

  const messages = []
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction })
  }
  messages.push({ role: 'user', content: prompt })

  const payload = {
    model,
    messages,
    response_format: { type: 'json_object' }
  }

  for (let i = 0; i <= RETRY_DELAYS.length; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content
      if (!text) throw new Error('Empty response from OpenAI')

      return JSON.parse(text) as T
    } catch (error) {
      console.warn(`[OpenAI] Attempt ${i + 1} failed:`, error)
      if (i === RETRY_DELAYS.length) {
        console.error('[OpenAI] All retries failed')
        return null
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]))
    }
  }

  return null
}

// ==================== 统一调用接口 ====================

/**
 * 调用 LLM (自动根据 provider 选择格式)
 * 返回 JSON 解析后的结果
 */
export async function callLLM<T = unknown>(
  prompt: string,
  systemInstruction: string = '',
  config: LLMConfig
): Promise<T | null> {
  if (!config.apiKey) {
    console.warn('[LLM] No API Key provided. Using fallback.')
    return null
  }

  if (config.provider === 'openai') {
    return await callOpenAI<T>(prompt, systemInstruction, config)
  } else {
    return await callGemini<T>(prompt, systemInstruction, config)
  }
}

/**
 * 调用 LLM 并返回原始文本（用于ReAct等需要解析原始响应的场景）
 */
export async function callLLMRaw(
  prompt: string,
  systemInstruction: string = '',
  config: LLMConfig
): Promise<string | null> {
  if (!config.apiKey) {
    console.warn('[LLM] No API Key provided.')
    return null
  }

  const url = config.apiUrl || DEFAULT_CONFIGS.openai.url
  const model = config.model || DEFAULT_CONFIGS.openai.model

  const messages = []
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction })
  }
  messages.push({ role: 'user', content: prompt })

  const payload = {
    model,
    messages
    // 不使用 response_format: json_object，返回原始文本
  }

  for (let i = 0; i <= RETRY_DELAYS.length; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content
      if (!text) throw new Error('Empty response from LLM')

      // 直接返回原始文本，不进行JSON解析
      return text
    } catch (error) {
      console.warn(`[LLM Raw] Attempt ${i + 1} failed:`, error)
      if (i === RETRY_DELAYS.length) {
        console.error('[LLM Raw] All retries failed')
        return null
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]))
    }
  }

  return null
}

// ==================== 兼容旧接口 (废弃警告) ====================

/** @deprecated 请使用 callLLM */
export async function callGeminiLegacy<T = unknown>(
  prompt: string,
  systemInstruction: string = '',
  apiKey: string = ''
): Promise<T | null> {
  console.warn('[Deprecated] callGemini is deprecated. Use callLLM instead.')
  return callLLM<T>(prompt, systemInstruction, { provider: 'gemini', apiKey })
}
