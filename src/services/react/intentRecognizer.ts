/**
 * 智能意图识别器
 * 识别用户输入属于会议日程、出差日程还是其他闲聊
 */

import type { Scenario } from '../../types'

export interface IntentRecognitionResult {
  intent: 'meeting' | 'trip' | 'chat' | 'other'
  confidence: number
  scenario?: Scenario
  matchedKeywords: string[]
  reasoning: string
}

export class IntentRecognizer {
  private static readonly INTENT_PATTERNS = {
    meeting: [
      /会议|例会|复盘|沟通|开会|约|聊|讨论|议题|agenda/i,
      /会议室|房间|地点|时间|几点|上午|下午/i
    ],
    trip: [
      /出差|飞|前往|机票|酒店|住宿|旅行|外出/i,
      /出发|目的地|行程|交通|航班|火车/i
    ]
  }

  /**
   * 识别用户意图
   */
  static recognizeIntent(
    userInput: string,
    availableScenarios: Scenario[]
  ): IntentRecognitionResult {
    const normalizedInput = userInput.toLowerCase().trim()
    
    // 1. 基于关键词的初步识别
    const keywordScores = this.calculateKeywordScores(normalizedInput)
    
    // 2. 基于场景配置的深度匹配
    const scenarioMatch = this.matchScenario(normalizedInput, availableScenarios)
    
    // 3. 综合判断
    let intent: 'meeting' | 'trip' | 'chat' | 'other' = 'other'
    let confidence = 0
    let matchedKeywords: string[] = []
    let reasoning = ''
    
    // 优先级：场景匹配 > 关键词匹配 > 默认
    if (scenarioMatch.confidence > 0.6) {
      intent = scenarioMatch.intent
      confidence = scenarioMatch.confidence
      matchedKeywords = scenarioMatch.matchedKeywords
      reasoning = `场景匹配: ${scenarioMatch.scenario?.name} (${(confidence * 100).toFixed(1)}%)`
    } else if (keywordScores.meeting > keywordScores.trip) {
      intent = 'meeting'
      confidence = keywordScores.meeting
      matchedKeywords = this.extractMatchedKeywords(normalizedInput, 'meeting')
      reasoning = `关键词识别: 会议相关 (${(confidence * 100).toFixed(1)}%)`
    } else if (keywordScores.trip > 0.3) {
      intent = 'trip'
      confidence = keywordScores.trip
      matchedKeywords = this.extractMatchedKeywords(normalizedInput, 'trip')
      reasoning = `关键词识别: 出差相关 (${(confidence * 100).toFixed(1)}%)`
    } else {
      // 低置信度或闲聊
      intent = 'chat'
      confidence = 0.2
      reasoning = '未识别到明确的业务意图，转为闲聊模式'
    }
    
    return {
      intent,
      confidence,
      scenario: scenarioMatch.scenario,
      matchedKeywords,
      reasoning
    }
  }

  /**
   * 计算关键词得分
   */
  private static calculateKeywordScores(input: string): { meeting: number; trip: number } {
    let meetingScore = 0
    let tripScore = 0
    
    // 会议关键词匹配
    for (const pattern of this.INTENT_PATTERNS.meeting) {
      if (pattern.test(input)) {
        meetingScore += 0.3
      }
    }
    
    // 出差关键词匹配
    for (const pattern of this.INTENT_PATTERNS.trip) {
      if (pattern.test(input)) {
        tripScore += 0.3
      }
    }
    
    // 上下文加分
    if (input.includes('预定') || input.includes('安排')) {
      meetingScore += 0.2
      tripScore += 0.2
    }
    
    if (input.includes('时间') || input.includes('几点')) {
      meetingScore += 0.15
    }
    
    if (input.includes('地址') || input.includes('地方')) {
      tripScore += 0.15
    }
    
    return {
      meeting: Math.min(meetingScore, 1),
      trip: Math.min(tripScore, 1)
    }
  }

  /**
   * 场景匹配
   */
  private static matchScenario(
    input: string,
    scenarios: Scenario[]
  ): { 
    intent: 'meeting' | 'trip' | 'chat' | 'other';
    confidence: number;
    scenario?: Scenario;
    matchedKeywords: string[]
  } {
    for (const scenario of scenarios) {
      const keywords = scenario.keywords.split(/[,，]/).map(k => k.trim().toLowerCase())
      const matchedKeywords: string[] = []
      let matchCount = 0
      
      for (const keyword of keywords) {
        if (input.includes(keyword)) {
          matchedKeywords.push(keyword)
          matchCount++
        }
      }
      
      const confidence = keywords.length > 0 ? matchCount / keywords.length : 0
      
      if (confidence > 0.5) {
        let intent: 'meeting' | 'trip' | 'chat' | 'other' = 'other'
        if (scenario.code === 'MEETING') intent = 'meeting'
        if (scenario.code === 'TRIP') intent = 'trip'
        
        return {
          intent,
          confidence,
          scenario,
          matchedKeywords
        }
      }
    }
    
    return {
      intent: 'other',
      confidence: 0,
      matchedKeywords: []
    }
  }

  /**
   * 提取匹配的关键词
   */
  private static extractMatchedKeywords(
    input: string,
    intentType: 'meeting' | 'trip'
  ): string[] {
    const patterns = this.INTENT_PATTERNS[intentType]
    const matched: string[] = []
    
    patterns.forEach(pattern => {
      const matches = input.match(pattern)
      if (matches) {
        matched.push(...matches.filter(Boolean))
      }
    })
    
    return [...new Set(matched)] // 去重
  }

  /**
   * 格式化识别结果
   */
  static formatResult(result: IntentRecognitionResult): string {
    const intentNames = {
      meeting: '会议日程',
      trip: '出差日程',
      chat: '闲聊模式',
      other: '其他'
    }
    
    return `🎯 意图识别: ${intentNames[result.intent]} (置信度: ${(result.confidence * 100).toFixed(1)}%)\n📝 识别依据: ${result.reasoning}`
  }
}