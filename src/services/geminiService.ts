import type { IntentData } from '../types'

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent'

// 重试延迟时间 (毫秒)
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]

/**
 * 调用 Gemini API
 */
export async function callGemini<T = unknown>(
  prompt: string, 
  systemInstruction: string = '',
  apiKey: string = ''
): Promise<T | null> {
  if (!apiKey) {
    console.warn('No API Key provided. Using mock fallback.')
    return null
  }

  const url = `${API_URL}?key=${apiKey}`
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
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
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return JSON.parse(data.candidates[0].content.parts[0].text) as T
    } catch (error) {
      if (i === RETRY_DELAYS.length) {
        console.error('Gemini API failed after retries:', error)
        return null
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]))
    }
  }

  return null
}

/**
 * 解析用户意图
 */
export async function parseIntent(
  text: string, 
  currentDate: string,
  apiKey: string
): Promise<IntentData | null> {
  const systemPrompt = `You are a scheduling assistant. Current date is ${currentDate}. Extract intent. Return JSON: {intent:"create"|"query", summary:string, date:YYYY-MM-DD, startTime:HH:MM, endTime:HH:MM, attendees:string[], type:"meeting"|"trip"|"other", transport:"flight"|"train"|"car"|"ship"|null}`
  
  return await callGemini<IntentData>(`Parse: "${text}"`, systemPrompt, apiKey)
}

/**
 * 生成会议议程
 */
export async function generateAgenda(
  eventContent: string,
  apiKey: string
): Promise<string> {
  const prompt = `Generate a concise 3-item professional meeting agenda for "${eventContent}". Return Markdown. Language: Chinese.`
  
  const result = await callGemini<string>(prompt, '', apiKey)
  
  if (!result) {
    return '- 议题一：项目进度同步\n- 议题二：关键阻碍讨论\n- 议题三：下一步计划确认'
  }
  
  return typeof result === 'object' ? JSON.stringify(result) : result
}
