/**
 * 从文本中提取日期
 * 支持：今天、明天、后天
 */
export function extractDate(text: string): string | null {
  const today = new Date()
  
  if (text.includes('今天')) {
    return today.toISOString().split('T')[0] || null
  }
  
  if (text.includes('明天')) {
    today.setDate(today.getDate() + 1)
    return today.toISOString().split('T')[0] || null
  }
  
  if (text.includes('后天')) {
    today.setDate(today.getDate() + 2)
    return today.toISOString().split('T')[0] || null
  }
  
  return null
}

/**
 * 从文本中提取时间
 * 支持：
 * - 数字格式：10:30、10点30分
 * - 中文格式：十点半、三点一刻
 * - 时段前缀：上午、下午、晚上
 */
export function extractTime(text: string): string | null {
  // 清理文本
  let clean = text.replace(/\s+/g, '').replace(/：/g, ':')
  
  // 匹配时间模式
  const match = clean.match(
    /([上下]午|晚上|凌晨|中午)?([0-9]{1,2}|[零一二两三四五六七八九十]{1,3})[:点]([0-9]{1,2}|[零一二两三四五六七八九十]{1,3}|半|刻)?(分)?/
  )
  
  if (!match) return null
  
  // 中文数字转阿拉伯数字
  const parseNum = (str: string): number => {
    if (/^\d+$/.test(str)) return parseInt(str)
    const map: Record<string, number> = {
      '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
      '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
    }
    return map[str] || 0
  }
  
  let hour = parseNum(match[2] || '')
  let minute = 0
  
  if (match[3]) {
    if (match[3] === '半') {
      minute = 30
    } else if (match[3] === '刻') {
      minute = 15
    } else {
      minute = parseNum(match[3])
    }
  }
  
  // 处理上下午
  if (match[1] && (match[1].includes('下午') || match[1].includes('晚上')) && hour < 12) {
    hour += 12
  }
  
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 从文本中提取参会人
 * 支持：和XX、跟XX、与XX、通知XX
 */
export function extractAttendees(text: string): string[] {
  const match = text.match(/(?:和|跟|与|通知)\s*([^,，.。]+)/)
  
  if (!match) return []
  
  const content = match[1]
  if (!content) return []
  
  return content
    .split(/[、\s]+/)
    .filter(n => n.length > 0 && !['我', '一下', '的'].includes(n))
}

/**
 * 从文本中识别交通方式
 */
export function extractTransport(text: string): 'flight' | 'train' | 'car' | 'ship' | null {
  if (/飞机|航班|飞/.test(text)) return 'flight'
  if (/火车|高铁|动车/.test(text)) return 'train'
  if (/车|打车|专车/.test(text)) return 'car'
  if (/船|轮渡|轮船/.test(text)) return 'ship'
  return null
}

/**
 * 识别场景类型
 * 优先级：出差 > 会议
 * 逻辑：当同时包含出差和会议关键词时（如"出差开会"），判定为出差场景
 */
export function detectScenarioType(text: string): 'trip' | 'meeting' | 'other' {
  // 优先匹配出差场景（包含出差、交通工具、住宿等关键词）
  if (/出差|机票|酒店|去.{1,5}(?:市|省|区)|travel|trip|飞|火车|高铁/.test(text)) {
    return 'trip'
  }
  // 其次匹配会议场景（仅当不是出差的情况下）
  if (/会议|讨论|meet|复盘|沟通|开会|约|聊/.test(text)) {
    return 'meeting'
  }
  return 'other'
}
