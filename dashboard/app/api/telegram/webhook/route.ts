import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

async function tg(method: string, body: object) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function POST(req: Request) {
  try {
    const update = await req.json()
    const message = update.message || update.edited_message
    if (!message?.text) return NextResponse.json({ ok: true })

    const chatId = message.chat.id
    const text: string = message.text

    await tg('sendChatAction', { chat_id: chatId, action: 'typing' })

    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: 'Ты умный и полезный ассистент. Отвечай на том языке, на котором задан вопрос. Будь краток и по делу, если не просят подробностей.',
      messages: [{ role: 'user', content: text }],
    })

    const reply = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Не могу ответить на этот запрос.'

    // Telegram limits message length to 4096 chars
    const chunks = reply.match(/[\s\S]{1,4000}/g) ?? [reply]
    for (const chunk of chunks) {
      await tg('sendMessage', { chat_id: chatId, text: chunk })
    }
  } catch (err) {
    console.error('Telegram webhook error:', err)
  }

  return NextResponse.json({ ok: true })
}
