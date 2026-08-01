/**
 * Проверка, что запрос пришёл от вошедшего в дашборд.
 *
 * Раньше эти маршруты закрывались заголовком `x-app-secret` со значением
 * EXPO_PUBLIC_APP_SECRET. Секрет этот публичен по своей природе — он лежит в
 * бандле сайта, — то есть сброс чужого пароля мог сделать кто угодно, зная
 * лишь id пользователя. Пропуск, который открыто раздаётся, пропуском не
 * является.
 *
 * Теперь спрашиваем токен дашборда — тот же, что admin.php выдаёт в обмен на
 * логин с паролем и подписывает ключом, выведенным из пароля. Проверяем его не
 * сами, а у admin.php: подпись зависит от сервисного ключа, и держать его
 * копию во втором месте — значит завести ещё один секрет, который однажды
 * разъедется с первым.
 */

const ADMIN_API =
  process.env.ADMIN_API_URL || 'https://jobtoo.ru/api/admin.php'

export async function isAdmin(req: Request): Promise<boolean> {
  const token = req.headers.get('x-admin-token')
  if (!token) return false
  try {
    // Самый дешёвый запрос, какой пропускает admin.php: одна строка, одно поле.
    const res = await fetch(
      `${ADMIN_API}?path=${encodeURIComponent('/rest/v1/jm_users?select=id&limit=1')}`,
      { headers: { 'X-Admin-Token': token }, cache: 'no-store' }
    )
    return res.ok
  } catch {
    return false
  }
}
