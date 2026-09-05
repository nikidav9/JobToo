import { NextResponse } from 'next/server'

/**
 * Доступность сайта — для раздела «Доступность» в дашборде.
 *
 * Источник данных уже есть на сервере: health-sample.sh раз в минуту пишет
 * строку NDJSON с состоянием (окно 30 суток). Сам файл nginx наружу не отдаёт
 * (на всех vhost return 404: телеметрия внутренняя), поэтому берём его через
 * admin.php?action=health — за тем же токеном дашборда, что и остальную
 * админку, и по тому же «чистому» адресу (sslip, мимо TSPU-фильтра, с
 * таймаутом). Здесь мы историю только разбираем и превращаем в сводку.
 */

// Тот же адрес, что и в requireAdmin: проверенный путь дашборда к admin.php.
const ADMIN_API =
  process.env.ADMIN_API_URL || 'https://jobtoo.ru/api/admin.php'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

type Rec = {
  время?: string
  эпоха?: number
  nginx?: string
  сайт?: string
  мс?: number
  api?: string
  rest?: string
  storage?: string
  realtime?: string
  ipv6?: string
  память?: string
  подкачка?: string
  нагрузка?: string
  событие?: string
}

// «Работает» = локальный TLS-vhost отдаёт 200, php-путь жив и nginx активен.
// api штатно отвечает 400/401/405 без токена — это «жив», а не авария; провал
// только 000 или 5xx. Ровно та же логика, что в самом health-sample.sh.
function up(r: Rec): boolean {
  if (r.nginx && r.nginx !== 'active') return false
  if (r.сайт !== '200') return false
  const a = r.api ?? ''
  if (a === '000' || /^5/.test(a)) return false
  return true
}

function pct(numer: number, denom: number): number | null {
  if (denom <= 0) return null
  return Math.round((numer / denom) * 10000) / 100
}

function memPct(mem?: string): number | null {
  // «1234/3900» → доля использованного, в процентах.
  if (!mem || mem.indexOf('/') < 0) return null
  const [u, t] = mem.split('/').map(Number)
  if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return null
  return Math.round((u / t) * 1000) / 10
}

function hhmm(iso?: string): string {
  if (!iso) return ''
  const m = iso.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : ''
}

function dayTime(iso?: string): string {
  if (!iso) return ''
  const m = iso.match(/(\d{2})-(\d{2})T(\d{2}:\d{2})/)
  return m ? `${m[2]}.${m[1]} ${m[3]}` : ''
}

export async function GET(req: Request) {
  const token = req.headers.get('x-admin-token') ?? ''
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 8000)
  let text = ''
  try {
    const res = await fetch(`${ADMIN_API}?action=health`, {
      cache: 'no-store',
      signal: ac.signal,
      headers: { 'X-Admin-Token': token, Accept: 'application/x-ndjson, text/plain' },
    })
    if (res.status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `История здоровья недоступна (${res.status})` },
        { status: 502, headers: CORS },
      )
    }
    text = await res.text()
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.name === 'AbortError' ? 'Сервер не ответил вовремя' : 'Не удалось прочитать историю здоровья' },
      { status: 502, headers: CORS },
    )
  } finally {
    clearTimeout(timer)
  }

  const recs: Rec[] = []
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try { recs.push(JSON.parse(s)) } catch { /* битую строку пропускаем */ }
  }

  if (recs.length === 0) {
    return NextResponse.json(
      { empty: true, note: 'История ещё не накопилась — сэмплер пишет раз в минуту.' },
      { headers: CORS },
    )
  }

  // Окна: файл — шаг в минуту. 1440 = сутки, 10080 = 7 дней, всё = ~30 дней.
  const last = <T,>(arr: T[], n: number) => arr.slice(Math.max(0, arr.length - n))
  const upCount = (arr: Rec[]) => arr.reduce((n, r) => n + (up(r) ? 1 : 0), 0)

  const d1 = last(recs, 1440)
  const d7 = last(recs, 10080)
  const uptime = {
    d1: pct(upCount(d1), d1.length),
    d7: pct(upCount(d7), d7.length),
    d30: pct(upCount(recs), recs.length),
    samplesD1: d1.length,
    samplesD7: d7.length,
    samplesD30: recs.length,
  }

  // Ряд для графика: последние сутки, прорежённые до ~180 точек, чтобы ответ
  // был лёгким. Берём время ответа (мс) и флаг доступности.
  const step = Math.max(1, Math.ceil(d1.length / 180))
  const series: { t: string; ms: number; up: number; mem: number | null }[] = []
  for (let i = 0; i < d1.length; i += step) {
    const r = d1[i]
    series.push({
      t: hhmm(r.время),
      ms: Number(r.мс) || 0,
      up: up(r) ? 1 : 0,
      mem: memPct(r.память),
    })
  }

  // Инциденты: подряд идущие минуты, когда путь не обслуживался. Схлопываем в
  // отрезки и подписываем причиной из поля «событие».
  const incidents: { from: string; to: string; minutes: number; detail: string }[] = []
  let run: Rec[] | null = null
  const flush = () => {
    if (!run || run.length === 0) return
    const causes = Array.from(
      new Set(run.map(r => (r.событие || '').trim()).filter(Boolean)),
    ).slice(0, 4)
    // Если событий не записано — показываем сами коды, чтобы отрезок не был немым.
    const detail = causes.length
      ? causes.join('; ')
      : Array.from(new Set(run.map(r => `сайт=${r.сайт} api=${r.api}`))).slice(0, 2).join('; ')
    incidents.push({
      from: dayTime(run[0].время),
      to: dayTime(run[run.length - 1].время),
      minutes: run.length,
      detail,
    })
    run = null
  }
  for (const r of recs) {
    if (!up(r)) { (run ??= []).push(r) } else { flush() }
  }
  flush()
  incidents.reverse() // свежие сверху

  const nowRec = recs[recs.length - 1]
  const now = {
    time: dayTime(nowRec.время),
    up: up(nowRec),
    nginx: nowRec.nginx ?? '?',
    site: nowRec.сайт ?? '?',
    api: nowRec.api ?? '?',
    rest: nowRec.rest ?? '?',
    storage: nowRec.storage ?? '?',
    realtime: nowRec.realtime ?? '?',
    ipv6: nowRec.ipv6 ?? '?',
    ms: Number(nowRec.мс) || 0,
    mem: nowRec.память ?? '?',
    memPct: memPct(nowRec.память),
    swap: nowRec.подкачка ?? '?',
    load: nowRec.нагрузка ?? '?',
    event: (nowRec.событие || '').trim(),
  }

  return NextResponse.json(
    { now, uptime, series, incidents: incidents.slice(0, 30), incidentsTotal: incidents.length },
    { headers: CORS },
  )
}
