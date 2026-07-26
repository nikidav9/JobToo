/**
 * Как показать сообщение одной строкой.
 *
 * Повторяет services/messagePreview.ts из приложения. Общего кода у них нет
 * намеренно: дашборд — отдельное приложение со своей сборкой, и тянуть его
 * файлы из соседней папки значит ломать сборку ради десяти строк.
 *
 * Фото и голосовые лежат в той же текстовой колонке, что и обычные
 * сообщения: служебная метка плюс ссылка. Показывать её как есть нельзя —
 * вместо «Голосовое сообщение» видно «[voice]https://bbiqmkeysalwd…».
 */

const IMG_PREFIX = '[img]'
const VOICE_PREFIX = '[voice]'

export const isImageMessage = (t: string) => t.startsWith(IMG_PREFIX)
export const isVoiceMessage = (t: string) => t.startsWith(VOICE_PREFIX)

export function messagePreview(text: string | null | undefined): string {
  if (!text) return ''
  if (isVoiceMessage(text)) return '🎤 Голосовое сообщение'
  if (isImageMessage(text)) return '📷 Фото'
  return text
}
