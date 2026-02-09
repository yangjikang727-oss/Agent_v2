import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import type { Ref } from 'vue'
import { getCurrentTimePosition } from '../utils/dateUtils'

/**
 * 时间轴管理
 */
export function useTimeline(containerRef: Ref<HTMLElement | null>) {
  const currentTimeTop = ref(0)
  let timer: number | null = null

  // 更新当前时间线位置
  function updateCurrentTimeLine() {
    currentTimeTop.value = getCurrentTimePosition()
  }

  // 滚动到指定时间
  function scrollToTime(time: string | 'now') {
    nextTick(() => {
      if (!containerRef.value) return

      let targetTop: number
      if (time === 'now') {
        targetTop = Math.max(0, currentTimeTop.value - 150)
      } else {
        const hour = parseInt(time.split(':')[0] ?? '0')
        targetTop = (hour - 7) * 80 - 50
      }

      containerRef.value.scrollTo({
        top: targetTop,
        behavior: 'smooth'
      })
    })
  }

  // 生命周期
  onMounted(() => {
    updateCurrentTimeLine()
    timer = window.setInterval(updateCurrentTimeLine, 60000)
  })

  onUnmounted(() => {
    if (timer) {
      clearInterval(timer)
    }
  })

  return {
    currentTimeTop,
    updateCurrentTimeLine,
    scrollToTime
  }
}
