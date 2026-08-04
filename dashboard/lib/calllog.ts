/**
 * Отметки «позвонил» на странице обзвона.
 *
 * Лежат в браузере, как и отметки о проверке пользователей: заводить ради
 * галочки колонку в базе — значит менять схему и раздавать её приложению,
 * которому эта галочка не нужна. Обзвон ведёт один человек с одного
 * компьютера, и этого достаточно.
 */

const KEY = 'crm_called_employers'

export type CallMark = { at: string; note: string }

export function getCallMarks(): Record<string, CallMark> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setCallMark(userId: string, mark: CallMark | null) {
  const all = getCallMarks()
  if (mark) all[userId] = mark
  else delete all[userId]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {}
}
