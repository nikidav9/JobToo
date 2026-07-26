import { NextResponse } from 'next/server'

/**
 * Пересылка вебхука телеграм-бота на jobtoo.ru.
 *
 * Зачем такой крюк. Телеграм перестал дозваниваться до jobtoo.ru напрямую:
 * getWebhookInfo показывал «Connection timed out» и растущую очередь
 * необработанных сообщений, а бот молчал на любые /start. При этом сам
 * обработчик исправен — с других адресов он отвечает за пару секунд. Значит
 * дело в сетевом пути между серверами Телеграма и хостингом, а его нам не
 * починить.
 *
 * Vercel Телеграму доступен, поэтому вебхук указывает сюда, а отсюда
 * обновление уходит на jobtoo.ru обычным запросом.
 *
 * Проверка подлинности — заголовок X-Telegram-Bot-Api-Secret-Token, который
 * Телеграм шлёт сам, если задать secret_token при setWebhook. Без него любой
 * желающий мог бы прислать поддельное обновление и, например, привязать чужой
 * телеграм к аккаунту.
 */

const TARGET = 'https://jobtoo.ru/api/tg.php'

export async function POST(req: Request) {
  const expected =
    process.env.EXPO_PUBLIC_APP_SECRET ||
    process.env.NEXT_PUBLIC_APP_SECRET ||
    'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6'

  if (req.headers.get('x-telegram-bot-api-secret-token') !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const body = await req.text()

  try {
    await fetch(TARGET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Обработчик успевает за пару секунд; если завис — не держим Телеграм,
      // он всё равно пришлёт это обновление повторно.
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    // Телеграму отвечаем «принято» в любом случае: иначе он начнёт слать это
    // же обновление по кругу и забьёт очередь, как было до пересылки.
  }

  return NextResponse.json({ ok: true })
}

// Чтобы можно было глазами проверить, что маршрут вообще выложен
export async function GET() {
  return NextResponse.json({ ok: true, route: 'telegram webhook relay' })
}
