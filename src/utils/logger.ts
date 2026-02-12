/**
 * 日志管理系统
 * 
 * 功能：
 * 1. 控制台输出（开发模式）
 * 2. 本地持久化（IndexedDB）
 * 3. 支持按会话ID分组
 * 4. 支持日志等级过滤
 * 5. 支持日志导出
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface SessionInfo {
  sessionId: string
  label: string        // 可读标签，如 "2025-06-15 14:30"
  logCount: number
  firstTime: number    // 最早日志时间
  lastTime: number     // 最近日志时间
  isCurrent: boolean
}

export interface LogEntry {
  timestamp: number
  datetime: string
  sessionId: string
  level: LogLevel
  module: string
  message: string
  data?: any
  stack?: string
}

class Logger {
  private sessionId: string = ''
  private dbName = 'ReactSchedulerLogs'
  private storeName = 'logs'
  private db: IDBDatabase | null = null
  private pendingLogs: LogEntry[] = []
  private maxPendingSize = 50
  private flushInterval = 5000 // 5秒刷新一次
  private lastTimestamp = 0 // 用于保证时间戳单调递增，避免主键冲突

  constructor() {
    this.sessionId = this.generateSessionId()
    this.initDB()
    this.startFlushTimer()
  }

  /**
   * 生成会话ID：日期_时间戳
   */
  private generateSessionId(): string {
    const now = new Date()
    const isoString = now.toISOString()
    const datePart = isoString.split('T')[0]
    const date = datePart ? datePart.replace(/-/g, '') : ''
    const time = now.getTime()
    return `session_${date}_${time}`
  }

  /**
   * 初始化 IndexedDB
   */
  private async initDB() {
    try {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => {
        console.error('[Logger] IndexedDB 打开失败')
      }

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        console.log('[Logger] ✓ IndexedDB 已初始化')
        // 立即刷新待处理的日志
        this.flushLogs()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { 
            keyPath: 'timestamp',
            autoIncrement: false 
          })
          
          // 创建索引
          objectStore.createIndex('sessionId', 'sessionId', { unique: false })
          objectStore.createIndex('level', 'level', { unique: false })
          objectStore.createIndex('datetime', 'datetime', { unique: false })
          objectStore.createIndex('module', 'module', { unique: false })
          
          console.log('[Logger] ✓ IndexedDB 存储结构已创建')
        }
      }
    } catch (error) {
      console.error('[Logger] IndexedDB 初始化失败:', error)
    }
  }

  /**
   * 启动定时刷新
   */
  private startFlushTimer() {
    setInterval(() => {
      this.flushLogs()
    }, this.flushInterval)
  }

  /**
   * 刷新日志到 IndexedDB
   */
  private async flushLogs() {
    if (!this.db || this.pendingLogs.length === 0) return

    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite')
      const objectStore = transaction.objectStore(this.storeName)

      const logsToFlush = [...this.pendingLogs]
      this.pendingLogs = []

      for (const log of logsToFlush) {
        objectStore.add(log)
      }

      transaction.oncomplete = () => {
        // console.log(`[Logger] ✓ 已刷新 ${logsToFlush.length} 条日志到 IndexedDB`)
      }

      transaction.onerror = () => {
        console.error('[Logger] ✗ 日志刷新失败')
        // 失败的日志重新加回队列
        this.pendingLogs.unshift(...logsToFlush)
      }
    } catch (error) {
      console.error('[Logger] 刷新日志异常:', error)
    }
  }

  /**
   * 生成单调递增的唯一时间戳，避免同毫秒内主键冲突
   */
  private getUniqueTimestamp(): number {
    let ts = Date.now()
    if (ts <= this.lastTimestamp) {
      ts = this.lastTimestamp + 1
    }
    this.lastTimestamp = ts
    return ts
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, module: string, message: string, data?: any, error?: Error) {
    const timestamp = this.getUniqueTimestamp()
    const datetime = new Date(timestamp).toISOString()

    const entry: LogEntry = {
      timestamp,
      datetime,
      sessionId: this.sessionId,
      level,
      module,
      message,
      data,
      stack: error?.stack
    }

    // 添加到待处理队列
    this.pendingLogs.push(entry)

    // 如果队列满了，立即刷新
    if (this.pendingLogs.length >= this.maxPendingSize) {
      this.flushLogs()
    }

    // 控制台输出
    this.consoleLog(entry)
  }

  /**
   * 控制台输出
   */
  private consoleLog(entry: LogEntry) {
    const prefix = `[${entry.module}]`
    const timestamp = new Date(entry.timestamp).toLocaleTimeString()

    switch (entry.level) {
      case 'DEBUG':
        console.debug(`${timestamp} ${prefix}`, entry.message, entry.data || '')
        break
      case 'INFO':
        console.log(`${timestamp} ${prefix}`, entry.message, entry.data || '')
        break
      case 'WARN':
        console.warn(`${timestamp} ${prefix}`, entry.message, entry.data || '')
        break
      case 'ERROR':
        console.error(`${timestamp} ${prefix}`, entry.message, entry.data || '', entry.stack || '')
        break
    }
  }

  // ==================== 公共 API ====================

  debug(module: string, message: string, data?: any) {
    this.log('DEBUG', module, message, data)
  }

  info(module: string, message: string, data?: any) {
    this.log('INFO', module, message, data)
  }

  warn(module: string, message: string, data?: any) {
    this.log('WARN', module, message, data)
  }

  error(module: string, message: string, error?: Error, data?: any) {
    this.log('ERROR', module, message, data, error)
  }

  /**
   * 获取当前会话ID
   */
  getSessionId(): string {
    return this.sessionId
  }

  /**
   * 查询日志
   */
  async queryLogs(options?: {
    sessionId?: string
    level?: LogLevel
    module?: string
    startTime?: number
    endTime?: number
    limit?: number
  }): Promise<LogEntry[]> {
    if (!this.db) {
      console.warn('[Logger] DB 未初始化')
      return []
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readonly')
        const objectStore = transaction.objectStore(this.storeName)
        
        let request: IDBRequest

        if (options?.sessionId) {
          const index = objectStore.index('sessionId')
          request = index.getAll(options.sessionId)
        } else {
          request = objectStore.getAll()
        }

        request.onsuccess = () => {
          let results: LogEntry[] = request.result

          // 过滤
          if (options?.level) {
            results = results.filter(log => log.level === options.level)
          }
          if (options?.module) {
            results = results.filter(log => log.module === options.module)
          }
          if (options?.startTime) {
            results = results.filter(log => log.timestamp >= options.startTime!)
          }
          if (options?.endTime) {
            results = results.filter(log => log.timestamp <= options.endTime!)
          }

          // 排序（按时间正序，最早的在前）
          results.sort((a, b) => a.timestamp - b.timestamp)

          // 限制数量
          if (options?.limit) {
            results = results.slice(0, options.limit)
          }

          resolve(results)
        }

        request.onerror = () => {
          reject(new Error('查询日志失败'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 导出日志为 JSON
   */
  async exportLogs(sessionId?: string): Promise<string> {
    const logs = await this.queryLogs({ sessionId })
    return JSON.stringify(logs, null, 2)
  }

  /**
   * 导出日志为文本
   */
  async exportLogsAsText(sessionId?: string): Promise<string> {
    const logs = await this.queryLogs({ sessionId })
    
    let text = `ReAct Scheduler AI - 日志导出\n`
    text += `会话ID: ${sessionId || '全部'}\n`
    text += `导出时间: ${new Date().toISOString()}\n`
    text += `日志条数: ${logs.length}\n`
    text += `${'='.repeat(80)}\n\n`

    for (const log of logs) {
      text += `[${log.datetime}] [${log.level}] [${log.module}]\n`
      text += `  ${log.message}\n`
      if (log.data) {
        text += `  数据: ${JSON.stringify(log.data)}\n`
      }
      if (log.stack) {
        text += `  堆栈: ${log.stack}\n`
      }
      text += '\n'
    }

    return text
  }

  /**
   * 清理旧日志（保留最近N天）
   */
  async cleanOldLogs(daysToKeep: number = 7) {
    if (!this.db) return

    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000

    return new Promise<number>((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readwrite')
        const objectStore = transaction.objectStore(this.storeName)
        const request = objectStore.openCursor()

        let deletedCount = 0

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            const log: LogEntry = cursor.value
            if (log.timestamp < cutoffTime) {
              cursor.delete()
              deletedCount++
            }
            cursor.continue()
          }
        }

        transaction.oncomplete = () => {
          console.log(`[Logger] ✓ 已清理 ${deletedCount} 条旧日志`)
          resolve(deletedCount)
        }

        transaction.onerror = () => {
          reject(new Error('清理日志失败'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 获取所有会话ID列表
   */
  async getSessionIds(): Promise<string[]> {
    if (!this.db) return []

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readonly')
        const objectStore = transaction.objectStore(this.storeName)
        const index = objectStore.index('sessionId')
        const request = index.getAllKeys()

        request.onsuccess = () => {
          const sessionIds = [...new Set(request.result as string[])]
          resolve(sessionIds)
        }

        request.onerror = () => {
          reject(new Error('获取会话列表失败'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 将 sessionId (session_YYYYMMDD_timestamp) 转为可读标签
   */
  private formatSessionLabel(sessionId: string): string {
    // 格式: session_20250615_1718438400000
    const parts = sessionId.split('_')
    if (parts.length >= 3) {
      const ts = parseInt(parts[2] || '0', 10)
      if (ts > 0) {
        const d = new Date(ts)
        const pad = (n: number) => n.toString().padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      }
    }
    return sessionId
  }

  /**
   * 获取所有会话的统计信息（日志数、时间范围）
   * 按时间倒序排列，当前会话标记 isCurrent
   */
  async getSessionsWithStats(): Promise<SessionInfo[]> {
    if (!this.db) return []

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readonly')
        const objectStore = transaction.objectStore(this.storeName)
        const request = objectStore.getAll()

        request.onsuccess = () => {
          const allLogs: LogEntry[] = request.result
          const sessionMap = new Map<string, { count: number; first: number; last: number }>()

          for (const log of allLogs) {
            const existing = sessionMap.get(log.sessionId)
            if (existing) {
              existing.count++
              if (log.timestamp < existing.first) existing.first = log.timestamp
              if (log.timestamp > existing.last) existing.last = log.timestamp
            } else {
              sessionMap.set(log.sessionId, {
                count: 1,
                first: log.timestamp,
                last: log.timestamp
              })
            }
          }

          const sessions: SessionInfo[] = []
          for (const [sid, stats] of sessionMap) {
            sessions.push({
              sessionId: sid,
              label: this.formatSessionLabel(sid),
              logCount: stats.count,
              firstTime: stats.first,
              lastTime: stats.last,
              isCurrent: sid === this.sessionId
            })
          }

          // 按最近时间倒序，当前会话始终在最前
          sessions.sort((a, b) => {
            if (a.isCurrent) return -1
            if (b.isCurrent) return 1
            return b.lastTime - a.lastTime
          })

          resolve(sessions)
        }

        request.onerror = () => {
          reject(new Error('获取会话统计失败'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 删除指定会话的所有日志
   */
  async deleteSession(sessionId: string): Promise<number> {
    if (!this.db) return 0
    // 不允许删除当前会话
    if (sessionId === this.sessionId) return 0

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readwrite')
        const objectStore = transaction.objectStore(this.storeName)
        const index = objectStore.index('sessionId')
        const request = index.openCursor(sessionId)

        let deletedCount = 0

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result
          if (cursor) {
            cursor.delete()
            deletedCount++
            cursor.continue()
          }
        }

        transaction.oncomplete = () => {
          console.log(`[Logger] ✓ 已删除会话 ${sessionId} 的 ${deletedCount} 条日志`)
          resolve(deletedCount)
        }

        transaction.onerror = () => {
          reject(new Error('删除会话日志失败'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }
}

// 全局单例
export const logger = new Logger()

// 便捷方法
export const log = {
  debug: (module: string, message: string, data?: any) => logger.debug(module, message, data),
  info: (module: string, message: string, data?: any) => logger.info(module, message, data),
  warn: (module: string, message: string, data?: any) => logger.warn(module, message, data),
  error: (module: string, message: string, error?: Error, data?: any) => logger.error(module, message, error, data),
}
