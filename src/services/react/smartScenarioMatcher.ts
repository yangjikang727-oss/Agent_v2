/**
 * 智能场景匹配器
 * 基于用户输入智能识别日程类型并匹配相应技能组
 */

import type { Scenario } from '../../types'

export class SmartScenarioMatcher {
  /**
   * 智能匹配场景
   * @param userInput 用户输入文本
   * @param scenarios 可用场景列表
   * @returns 匹配的场景和置信度
   */
  static matchScenario(userInput: string, scenarios: Scenario[]): {
    scenario: Scenario | null
    confidence: number
    matchedKeywords: string[]
  } {
    let bestMatch: Scenario | null = null
    let highestConfidence = 0
    let matchedKeywords: string[] = []

    for (const scenario of scenarios) {
      const result = this.calculateMatchScore(userInput, scenario)
      if (result.confidence > highestConfidence) {
        highestConfidence = result.confidence
        bestMatch = scenario
        matchedKeywords = result.matchedKeywords
      }
    }

    // 设置最小置信度阈值
    const minConfidence = 0.3
    if (highestConfidence < minConfidence) {
      return {
        scenario: null,
        confidence: 0,
        matchedKeywords: []
      }
    }

    return {
      scenario: bestMatch,
      confidence: highestConfidence,
      matchedKeywords: matchedKeywords
    }
  }

  /**
   * 计算匹配分数
   */
  private static calculateMatchScore(input: string, scenario: Scenario): {
    confidence: number
    matchedKeywords: string[]
  } {
    const keywords = scenario.keywords.split(/[,，]/).map((k: string) => k.trim())
    const matchedKeywords: string[] = []
    let score = 0

    // 关键词匹配
    for (const keyword of keywords) {
      if (input.includes(keyword)) {
        matchedKeywords.push(keyword)
        score += 1
      }
    }

    // 上下文权重调整
    const contextBoost = this.getContextualBoost(input, scenario)
    score += contextBoost

    // 计算置信度 (0-1)
    const maxPossibleScore = keywords.length + 2 // 关键词数量 + 最大上下文加成
    const confidence = Math.min(score / maxPossibleScore, 1)

    return {
      confidence,
      matchedKeywords
    }
  }

  /**
   * 获取上下文加成分数
   */
  private static getContextualBoost(input: string, scenario: Scenario): number {
    let boost = 0
    
    // 时间相关词汇加成
    if (this.hasTimeReference(input)) {
      boost += 0.5
    }
    
    // 地点相关词汇加成
    if (this.hasLocationReference(input)) {
      boost += 0.3
    }
    
    // 场景特定加成
    switch (scenario.code) {
      case 'MEETING':
        if (input.includes('会议室') || input.includes('开会')) {
          boost += 0.7
        }
        break
      case 'TRIP':
        if (input.includes('出差') || input.includes('旅行')) {
          boost += 0.7
        }
        break
    }
    
    return boost
  }

  private static hasTimeReference(input: string): boolean {
    const timePatterns = [
      /\d{1,2}[点时]/,
      /[上下]午/,
      /今天|明天|后天/,
      /\d{1,2}[:：]\d{2}/
    ]
    return timePatterns.some(pattern => pattern.test(input))
  }

  private static hasLocationReference(input: string): boolean {
    const locationPatterns = [
      /[AB]\d{3}/,  // 会议室编号
      /会议室|办公室|公司/,
      /[省市县区]/  // 地址相关
    ]
    return locationPatterns.some(pattern => pattern.test(input))
  }

  /**
   * 获取场景推荐理由
   */
  static getRecommendationReason(
    scenario: Scenario,
    confidence: number,
    matchedKeywords: string[]
  ): string {
    // const confidenceLevel = confidence > 0.7 ? '高' : confidence > 0.5 ? '中' : '低'
    
    return `检测到"${scenario.name}"场景 (置信度:${(confidence * 100).toFixed(1)}%)，匹配关键词：${matchedKeywords.join('、')}`
  }
}