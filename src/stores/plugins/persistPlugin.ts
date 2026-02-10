import type { PiniaPluginContext } from 'pinia'

/**
 * 持久化配置
 */
export interface PersistConfig {
  /** 存储键名前缀 */
  prefix?: string
  /** 需要持久化的字段 (默认全部) */
  paths?: string[]
  /** 排除的字段 */
  exclude?: string[]
}

/** Store 持久化配置映射 */
const storeConfigs: Record<string, PersistConfig | boolean> = {
  schedule: {
    paths: ['schedules', 'currentDate']
  },
  task: {
    paths: ['tasks']
  },
  config: {
    paths: ['skillList', 'scenarioList', 'llmProvider', 'llmApiKey', 'llmApiUrl', 'llmModel']
  },
  // message store 不持久化 (会话消息不需要保存)
  message: false
}

/**
 * Pinia 持久化插件
 */
export function createPersistPlugin(globalPrefix: string = 'agent3') {
  return ({ store }: PiniaPluginContext) => {
    const storeId = store.$id
    const config = storeConfigs[storeId]
    
    // 如果配置为 false，跳过持久化
    if (config === false) {
      return
    }

    const persistConfig: PersistConfig = typeof config === 'object' ? config : {}
    const storageKey = `${globalPrefix}_${storeId}`

    // 从 localStorage 恢复数据
    try {
      const savedData = localStorage.getItem(storageKey)
      if (savedData) {
        const parsed = JSON.parse(savedData)
        
        // 如果指定了 paths，只恢复指定字段
        if (persistConfig.paths) {
          const partial: Record<string, unknown> = {}
          for (const path of persistConfig.paths) {
            if (path in parsed) {
              partial[path] = parsed[path]
            }
          }
          store.$patch(partial as any)
        } else {
          store.$patch(parsed)
        }
        
        console.log(`[Persist] Restored: ${storeId}`)
      }
    } catch (error) {
      console.warn(`[Persist] Failed to restore ${storeId}:`, error)
    }

    // 订阅状态变化，保存到 localStorage
    store.$subscribe(
      (_, state) => {
        try {
          let dataToSave: Record<string, unknown>

          if (persistConfig.paths) {
            // 只保存指定字段
            dataToSave = {}
            for (const path of persistConfig.paths) {
              if (path in state) {
                dataToSave[path] = (state as Record<string, unknown>)[path]
              }
            }
          } else if (persistConfig.exclude) {
            // 排除指定字段
            dataToSave = { ...state }
            for (const path of persistConfig.exclude) {
              delete dataToSave[path]
            }
          } else {
            dataToSave = { ...state }
          }

          localStorage.setItem(storageKey, JSON.stringify(dataToSave))
        } catch (error) {
          console.warn(`[Persist] Failed to save ${storeId}:`, error)
        }
      },
      { detached: true }
    )
  }
}

/**
 * 清除所有持久化数据
 */
export function clearAllPersistedData(prefix: string = 'agent3') {
  const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix))
  keys.forEach(key => localStorage.removeItem(key))
  console.log(`[Persist] Cleared ${keys.length} items`)
}

/**
 * 获取持久化数据大小 (KB)
 */
export function getPersistedDataSize(prefix: string = 'agent3'): number {
  let totalSize = 0
  Object.keys(localStorage)
    .filter(key => key.startsWith(prefix))
    .forEach(key => {
      const item = localStorage.getItem(key)
      if (item) {
        totalSize += item.length * 2 // UTF-16 编码
      }
    })
  return Math.round(totalSize / 1024 * 100) / 100
}
