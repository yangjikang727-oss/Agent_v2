/**
 * 大模型驱动的智能参数提取器
 * 使用LLM来理解和提取用户输入中的关键信息
 */

import { callLLMRaw } from '../core/llmCore'
import type { LLMConfig } from '../core/llmCore'

interface ExtractedParams {
  title?: string
  date?: string
  startTime?: string
  endTime?: string
  duration?: number
  location?: string
  attendees?: string[]
  from?: string
  to?: string
}

interface ExtractionResult {
  params: ExtractedParams
  confidence: number
  reasoning: string
}

export class LLMParamExtractor {
  private static readonly EXTRACTION_PROMPT = `
你是一个专业的信息提取助手。请从用户的输入中提取以下信息：

需要提取的字段：
- title: 会议主题/活动名称
- date: 日期（格式：YYYY-MM-DD）
- startTime: 开始时间（格式：HH:mm）
- endTime: 结束时间（格式：HH:mm）
- duration: 持续时间（小时数）
- location: 地点/会议室
- attendees: 参会人员列表
- from: 出发地（出差场景）
- to: 目的地（出差场景）

用户输入：{{input}}

请严格按照以下JSON格式返回结果：
{
  "params": {
    "title": "提取的主题",
    "date": "提取的日期",
    "startTime": "提取的开始时间",
    "endTime": "提取的结束时间",
    "duration": 提取的时长数字,
    "location": "提取的地点",
    "attendees": ["提取的人员1", "提取的人员2"],
    "from": "提取的出发地",
    "to": "提取的到达地"
  },
  "confidence": 0.85,
  "reasoning": "提取逻辑说明"
}

注意事项：
1. 只提取明确提及的信息，未提及的字段保持为空
2. 时间信息要标准化格式
3. 人员名单要拆分为数组
4. confidence表示提取的可信度（0-1）
5. reasoning简要说明提取依据
`

  /**
   * 使用大模型提取参数
   */
  static async extractParams(
    input: string,
    llmConfig: LLMConfig
  ): Promise<ExtractionResult> {
    try {
      const prompt = this.EXTRACTION_PROMPT.replace('{{input}}', input)
      
      const response = await callLLMRaw(prompt, '', llmConfig)
      
      if (!response) {
        throw new Error('LLM调用失败')
      }
      
      // 解析JSON响应
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as ExtractionResult
        
        // 验证必要字段
        if (!result.params) {
          throw new Error('缺少params字段')
        }
        
        return result
      } else {
        throw new Error('无法解析JSON响应')
      }
      
    } catch (error) {
      console.error('[LLMParamExtractor] 提取失败:', error)
      
      // 兜底返回空结果
      return {
        params: {},
        confidence: 0,
        reasoning: `提取失败: ${(error as Error).message}`
      }
    }
  }

  /**
   * 混合提取模式：LLM为主，正则为辅
   */
  static async hybridExtract(
    input: string,
    llmConfig: LLMConfig,
    fallbackParams: ExtractedParams = {}
  ): Promise<ExtractionResult> {
    try {
      // 首先使用LLM提取
      const llmResult = await this.extractParams(input, llmConfig)
      
      // 如果LLM提取置信度较高，直接使用
      if (llmResult.confidence > 0.7) {
        return llmResult
      }
      
      // 否则结合fallback参数进行补充
      const mergedParams = { ...fallbackParams, ...llmResult.params }
      
      return {
        params: mergedParams,
        confidence: Math.max(llmResult.confidence, 0.5),
        reasoning: `LLM提取(${llmResult.confidence.toFixed(2)}) + fallback补充`
      }
      
    } catch (error) {
      console.error('[LLMParamExtractor] 混合提取失败:', error)
      
      // 完全兜底：返回fallback参数
      return {
        params: fallbackParams,
        confidence: 0.3,
        reasoning: '使用fallback参数（LLM提取失败）'
      }
    }
  }

  /**
   * 格式化提取结果用于显示
   */
  static formatResult(result: ExtractionResult): string {
    const params = result.params
    const items: string[] = []
    
    if (params.title) items.push(`主题: ${params.title}`)
    if (params.date) items.push(`日期: ${params.date}`)
    if (params.startTime) items.push(`开始时间: ${params.startTime}`)
    if (params.endTime) items.push(`结束时间: ${params.endTime}`)
    if (params.duration) items.push(`时长: ${params.duration}小时`)
    if (params.location) items.push(`地点: ${params.location}`)
    if (params.attendees && params.attendees.length > 0) {
      items.push(`参会人: ${params.attendees.join(', ')}`)
    }
    if (params.from) items.push(`出发地: ${params.from}`)
    if (params.to) items.push(`目的地: ${params.to}`)
    
    return items.length > 0 
      ? `✅ 提取到信息: ${items.join('; ')} (置信度: ${(result.confidence * 100).toFixed(1)}%)`
      : '❌ 未提取到有效信息'
  }
}