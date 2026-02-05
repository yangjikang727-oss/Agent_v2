import { marked } from 'marked'

/**
 * 渲染 Markdown 为 HTML
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  return marked.parse(text) as string
}

/**
 * 转义 HTML 特殊字符
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"]/g, m => map[m] || m)
}

/**
 * 将换行符转换为 <br>
 */
export function nl2br(text: string): string {
  return text.replace(/\n/g, '<br>')
}
