import { ref, onUnmounted } from 'vue'

// Web Speech API 类型声明
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

type SpeechRecognitionType = new () => SpeechRecognition

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionType
    webkitSpeechRecognition: SpeechRecognitionType
  }
}

/**
 * 语音输入管理 (Web Speech API)
 */
export function useSpeech() {
  const isRecording = ref(false)
  const transcript = ref('')
  const isSupported = ref(false)
  const errorMessage = ref('')

  let recognition: SpeechRecognition | null = null
  let onCompleteCallback: ((text: string) => void) | null = null

  // 检查浏览器支持
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
  isSupported.value = !!SpeechRecognitionAPI

  // 初始化语音识别
  function initRecognition() {
    if (!SpeechRecognitionAPI) {
      errorMessage.value = '当前浏览器不支持语音识别，请使用 Chrome 或 Edge'
      return null
    }

    const rec = new SpeechRecognitionAPI()
    rec.continuous = false        // 单次识别
    rec.interimResults = true     // 显示中间结果
    rec.lang = 'zh-CN'            // 中文识别

    // 识别结果
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      // 优先使用最终结果，否则显示中间结果
      transcript.value = finalTranscript || interimTranscript
    }

    // 识别结束
    rec.onend = () => {
      isRecording.value = false
      if (onCompleteCallback && transcript.value.trim()) {
        onCompleteCallback(transcript.value.trim())
      }
      onCompleteCallback = null
    }

    // 识别错误
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      isRecording.value = false
      
      const errorMessages: Record<string, string> = {
        'no-speech': '未检测到语音，请重试',
        'audio-capture': '无法访问麦克风，请检查权限',
        'not-allowed': '麦克风权限被拒绝',
        'network': '网络错误，请检查网络连接',
        'aborted': '识别已取消',
        'service-not-allowed': '语音服务不可用'
      }
      
      errorMessage.value = errorMessages[event.error] || `识别错误: ${event.error}`
      console.warn('语音识别错误:', event.error, event.message)
    }

    rec.onstart = () => {
      errorMessage.value = ''
    }

    return rec
  }

  // 开始录音
  function startRecording(onComplete?: (text: string) => void) {
    if (!isSupported.value) {
      errorMessage.value = '当前浏览器不支持语音识别'
      return
    }

    if (isRecording.value) {
      stopRecording()
      return
    }

    transcript.value = ''
    errorMessage.value = ''
    onCompleteCallback = onComplete || null

    recognition = initRecognition()
    if (recognition) {
      try {
        recognition.start()
        isRecording.value = true
      } catch (e) {
        errorMessage.value = '启动语音识别失败'
        console.error('启动语音识别失败:', e)
      }
    }
  }

  // 停止录音
  function stopRecording() {
    if (recognition && isRecording.value) {
      recognition.stop()
    }
    isRecording.value = false
  }

  // 切换录音状态
  function toggleRecording(onComplete?: (text: string) => void) {
    if (isRecording.value) {
      stopRecording()
    } else {
      startRecording(onComplete)
    }
  }

  // 清理
  onUnmounted(() => {
    if (recognition) {
      recognition.abort()
      recognition = null
    }
  })

  return {
    isRecording,
    transcript,
    isSupported,
    errorMessage,
    startRecording,
    stopRecording,
    toggleRecording
  }
}
