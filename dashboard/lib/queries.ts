import { supabase, supabaseAdmin } from './supabase'
import { subDays, format, eachDayOfInterval, parseISO, startOfDay } from 'date-fns'

// ─── constants ───────────────────────────────────────────────────────────────

export const WORK_TYPE_LABELS: Record<string, string> = {
  stocker: 'Кладовщик',
  cook: 'Повар',
  shift_supervisor: 'Менеджер',
  picker: 'Комплектовщик',
}

export const PALETTE = {
  orange: '#C8501E',
  blue: '#3B5BB5',
  purple: '#5F4BB6',
  green: '#2E7D54',
  red: '#B33C2A',
  amber: '#A87020',
  cyan: '#0E7490',
  pink: '#9D2060',
  gray: '#6B6760',
}

export const CHART_COLORS = Object.values(PALETTE)

// ─── helpers ─────────────────────────────────────────────────────────────────

export function dayRange(days: number) {
  const end = new Date()
  const start = subDays(end, days - 1)
  return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'))
}

export function groupByDate(items: any[], field: string): Record<string, number> {
  const map: Record<string, number> = {}
  for (const item of items) {
    const key = item[field]?.slice(0, 10)
    if (key) map[key] = (map[key] ?? 0) + 1
  }
  return map
}

export function fillDays(map: Record<string, number>, days: string[]): number[] {
  return days.map(d => map[d] ?? 0)
}

export function toDayLabel(dateKey: string): string {
  return dateKey.slice(5) // "MM-DD"
}

export function pct(a: number, b: number): string {
  if (b === 0) return '0%'
  return ((a / b) * 100).toFixed(1) + '%'
}

export function trend(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0
  return Math.round(((current - prev) / prev) * 100)
}

// ─── overview ────────────────────────────────────────────────────────────────

export async function fetchOverview() {
  const [
    { data: users },
    { data: tempVacs },
    { data: permVacs },
    { data: likes },
    { data: chats },
    { data: messages },
    { data: ratings },
  ] = await Promise.all([
    supabase.from('jm_users').select('id,role,created_at,is_blocked'),
    supabase.from('jm_vacancies').select('id,status,work_type,created_at,workers_needed,workers_found'),
    supabase.from('jm_perm_vacancies').select('id,status,created_at'),
    supabase.from('jm_likes').select('id,is_match,matched_at,worker_confirmed,employer_confirmed,shift_completed,created_at'),
    supabase.from('jm_chats').select('id,created_at'),
    supabase.from('jm_messages').select('id,created_at'),
    supabase.from('jm_ratings').select('id,rating'),
  ])

  const u = users ?? []
  const tv = tempVacs ?? []
  const pv = permVacs ?? []
  const lk = likes ?? []
  const ch = chats ?? []
  const ms = messages ?? []
  const rt = ratings ?? []

  const workers = u.filter((x: any) => x.role === 'worker')
  const employers = u.filter((x: any) => x.role === 'employer')
  const matches = lk.filter((x: any) => x.is_match)
  const confirmed = lk.filter((x: any) => x.worker_confirmed && x.employer_confirmed)
  const completed = lk.filter((x: any) => x.shift_completed)

  const now = new Date()
  const w7 = subDays(now, 7).toISOString()
  const w30 = subDays(now, 30).toISOString()

  const newUsersWeek = u.filter((x: any) => x.created_at > w7).length
  const newUsersMonth = u.filter((x: any) => x.created_at > w30).length
  const newVacsMonth = tv.filter((x: any) => x.created_at > w30).length
  const newMatchesMonth = matches.filter((x: any) => (x.matched_at ?? x.created_at) > w30).length

  // prev month for trend
  const w60 = subDays(now, 60).toISOString()
  const prevUsersMonth = u.filter((x: any) => x.created_at > w60 && x.created_at <= w30).length
  const prevMatchesMonth = matches.filter((x: any) => {
    const d = x.matched_at ?? x.created_at
    return d > w60 && d <= w30
  }).length

  // 30-day daily data
  const days30 = dayRange(30)
  const usersByDay = groupByDate(u, 'created_at')
  const workersByDay = groupByDate(workers, 'created_at')
  const employersByDay = groupByDate(employers, 'created_at')
  const vacsByDay = groupByDate(tv, 'created_at')
  const matchesByDay = groupByDate(
    matches.map((x: any) => ({ ...x, created_at: x.matched_at ?? x.created_at })),
    'created_at'
  )

  const dailyUsers = days30.map(d => ({
    date: toDayLabel(d),
    workers: workersByDay[d] ?? 0,
    employers: employersByDay[d] ?? 0,
    total: usersByDay[d] ?? 0,
  }))

  const dailyVacs = days30.map(d => ({
    date: toDayLabel(d),
    vacancies: vacsByDay[d] ?? 0,
    matches: matchesByDay[d] ?? 0,
  }))

  // work type dist
  const wtMap: Record<string, number> = {}
  for (const v of tv) {
    const wt = (v as any).work_type ?? 'other'
    wtMap[wt] = (wtMap[wt] ?? 0) + 1
  }
  const workTypeDist = Object.entries(wtMap)
    .map(([k, v]) => ({ name: WORK_TYPE_LABELS[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value)

  // funnel
  const funnel = [
    { name: 'Пользователи', value: u.length },
    { name: 'Лайки', value: lk.length },
    { name: 'Совпадения', value: matches.length },
    { name: 'Подтверждено', value: confirmed.length },
    { name: 'Смены завершены', value: completed.length },
  ]

  // ratings
  const avgRating = rt.length > 0
    ? rt.reduce((s: number, r: any) => s + Number(r.rating), 0) / rt.length
    : 0

  return {
    kpi: {
      totalUsers: u.length,
      workers: workers.length,
      employers: employers.length,
      blocked: u.filter((x: any) => x.is_blocked).length,
      tempVacancies: tv.length,
      permVacancies: pv.length,
      openTemp: tv.filter((x: any) => x.status === 'open').length,
      openPerm: pv.filter((x: any) => x.status === 'open').length,
      totalLikes: lk.length,
      totalMatches: matches.length,
      matchRate: lk.length > 0 ? ((matches.length / lk.length) * 100).toFixed(1) : '0',
      confirmed: confirmed.length,
      completed: completed.length,
      chats: ch.length,
      messages: ms.length,
      avgMessages: ch.length > 0 ? (ms.length / ch.length).toFixed(1) : '0',
      avgRating: avgRating.toFixed(2),
      newUsersWeek,
      newUsersMonth,
      newVacsMonth,
      newMatchesMonth,
      trendUsers: trend(newUsersMonth, prevUsersMonth),
      trendMatches: trend(newMatchesMonth, prevMatchesMonth),
    },
    dailyUsers,
    dailyVacs,
    workTypeDist,
    funnel,
  }
}

// ─── users ───────────────────────────────────────────────────────────────────

export async function fetchUsers() {
  const [{ data: users }, { data: webPushRows }] = await Promise.all([
    supabase
      .from('jm_users')
      .select('id,role,first_name,last_name,phone,metro_station,metro_line_id,is_blocked,created_at,company,push_token')
      .order('created_at', { ascending: false }),
    supabase
      .from('jm_web_push_subscriptions')
      .select('user_id,updated_at'),
  ])

  const u = users ?? []
  const webPushMap = new Map((webPushRows ?? []).map((r: any) => [r.user_id, r.updated_at as string]))

  const workers = u.filter((x: any) => x.role === 'worker')
  const employers = u.filter((x: any) => x.role === 'employer')

  const days30 = dayRange(30)
  const days90 = dayRange(90)

  const w30 = subDays(new Date(), 30).toISOString()
  const w7 = subDays(new Date(), 7).toISOString()

  // metro top
  const metroMap: Record<string, { workers: number; employers: number }> = {}
  for (const user of u) {
    const s = (user as any).metro_station
    if (!s) continue
    if (!metroMap[s]) metroMap[s] = { workers: 0, employers: 0 }
    if ((user as any).role === 'worker') metroMap[s].workers++
    else metroMap[s].employers++
  }
  const metroTop = Object.entries(metroMap)
    .map(([station, counts]) => ({ station, ...counts, total: counts.workers + counts.employers }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // 90-day growth
  const wByDay = groupByDate(workers, 'created_at')
  const eByDay = groupByDate(employers, 'created_at')
  const growth90 = days90.map(d => ({
    date: toDayLabel(d),
    workers: wByDay[d] ?? 0,
    employers: eByDay[d] ?? 0,
  }))

  // cumulative
  let cumW = workers.filter((x: any) => x.created_at < subDays(new Date(), 90).toISOString()).length
  let cumE = employers.filter((x: any) => x.created_at < subDays(new Date(), 90).toISOString()).length
  const cumulative = growth90.map(d => {
    cumW += d.workers
    cumE += d.employers
    return { date: d.date, workers: cumW, employers: cumE, total: cumW + cumE }
  })

  const recent = u.map((x: any) => ({
    name: `${x.first_name ?? ''} ${x.last_name ?? ''}`.trim(),
    phone: x.phone,
    role: x.role,
    metro: x.metro_station ?? '—',
    company: x.company ?? '—',
    blocked: x.is_blocked,
    date: x.created_at?.slice(0, 10),
    id: x.id,
    hasPushToken: !!x.push_token,
    hasWebPush: webPushMap.has(x.id),
    webPushDate: webPushMap.get(x.id)?.slice(0, 10) ?? null,
    hadPushTokenBefore: !!x.push_token && webPushMap.has(x.id),
  }))

  const withWebPush = webPushMap.size
  const webPushNewWeek = (webPushRows ?? []).filter((r: any) => r.updated_at > w7).length
  const webPushNewMonth = (webPushRows ?? []).filter((r: any) => r.updated_at > w30).length
  const webPushOnlyCount = u.filter((x: any) => !x.push_token && webPushMap.has(x.id)).length

  return {
    kpi: {
      total: u.length,
      workers: workers.length,
      employers: employers.length,
      blocked: u.filter((x: any) => x.is_blocked).length,
      newWeek: u.filter((x: any) => x.created_at > w7).length,
      newMonth: u.filter((x: any) => x.created_at > w30).length,
      workerPct: u.length > 0 ? ((workers.length / u.length) * 100).toFixed(0) : '0',
      withPushToken: u.filter((x: any) => x.push_token).length,
      withoutPushToken: u.filter((x: any) => !x.push_token).length,
      withWebPush,
      webPushNewWeek,
      webPushNewMonth,
      webPushOnlyCount,
    },
    growth90,
    cumulative,
    metroTop,
    recent,
    roleSplit: [
      { name: 'Работники', value: workers.length, fill: PALETTE.orange },
      { name: 'Работодатели', value: employers.length, fill: PALETTE.blue },
    ],
  }
}

// ─── vacancies ───────────────────────────────────────────────────────────────

/** Смены с прошедшей датой должны быть закрыты — дашборд подчищает их при загрузке */
async function autoCloseStaleVacancies() {
  // МСК = UTC+3
  const mskToday = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
  try {
    await supabaseAdmin
      .from('jm_vacancies')
      .update({ status: 'closed' })
      .eq('status', 'open')
      .lt('date', mskToday)
  } catch { /* не блокируем аналитику */ }
}

export async function fetchVacancies() {
  await autoCloseStaleVacancies()
  const [{ data: tv }, { data: pv }, { data: apps }, { data: users }, { data: likes }, { data: tvViews }, { data: pvViews }] = await Promise.all([
    supabase.from('jm_vacancies').select('id,status,work_type,work_type_label,created_at,employer_id,salary,workers_needed,workers_found,is_urgent,no_experience_needed,company,date,address,metro_station,time_start,time_end'),
    supabase.from('jm_perm_vacancies').select('id,title,status,created_at,employer_id,salary,company,metro_station,address,description,schedule,work_type'),
    supabase.from('jm_perm_applications').select('id,vacancy_id,worker_id,status,created_at').order('created_at', { ascending: false }),
    supabase.from('jm_users').select('id,first_name,last_name,phone'),
    supabase.from('jm_likes').select('id,vacancy_id,worker_id,is_match,worker_liked,employer_liked,worker_skipped,created_at').order('created_at', { ascending: false }),
    supabase.from('jm_vacancy_views').select('vacancy_id,viewed_at'),
    supabase.from('jm_perm_vacancy_views').select('vacancy_id,viewed_at'),
  ])

  const t = tv ?? []
  const p = pv ?? []
  const ap = apps ?? []
  const lk = likes ?? []

  const userMap: Record<string, { name: string; phone: string }> = {}
  for (const u of users ?? []) {
    const name = [(u as any).first_name, (u as any).last_name].filter(Boolean).join(' ') || (u as any).phone || '—'
    userMap[(u as any).id] = { name, phone: (u as any).phone ?? '—' }
  }

  type AppInfo = { id: string; workerId: string; name: string; phone: string; status: string; date: string }

  const appsByVac: Record<string, AppInfo[]> = {}
  const appByVac: Record<string, { total: number; pending: number; approved: number; rejected: number }> = {}

  for (const a of ap) {
    const vid = (a as any).vacancy_id
    const wid = (a as any).worker_id
    if (!vid) continue
    if (!appByVac[vid]) appByVac[vid] = { total: 0, pending: 0, approved: 0, rejected: 0 }
    if (!appsByVac[vid]) appsByVac[vid] = []
    appByVac[vid].total++
    const st = (a as any).status ?? 'pending'
    if (st === 'approved') appByVac[vid].approved++
    else if (st === 'rejected') appByVac[vid].rejected++
    else appByVac[vid].pending++
    const worker = userMap[wid]
    appsByVac[vid].push({ id: (a as any).id, workerId: wid, name: worker?.name ?? '—', phone: worker?.phone ?? '—', status: st, date: (a as any).created_at?.slice(0, 10) ?? '' })
  }

  const permVacancyCards = p.map((v: any) => ({
    id: v.id,
    title: v.title ?? 'Без названия',
    company: v.company ?? '—',
    metro: v.metro_station ?? null,
    address: v.address ?? null,
    salary: v.salary ? Number(v.salary).toLocaleString('ru-RU') + ' ₽' : null,
    salaryRaw: v.salary ? Number(v.salary) : null,
    status: v.status ?? 'open',
    schedule: v.schedule ?? null,
    createdAt: v.created_at?.slice(0, 10) ?? null,
    apps: appByVac[v.id] ?? { total: 0, pending: 0, approved: 0, rejected: 0 },
    applicants: appsByVac[v.id] ?? [],
  })).sort((a: any, b: any) => b.apps.total - a.apps.total)

  const likesByVac: Record<string, AppInfo[]> = {}
  const likeCountByVac: Record<string, { total: number; matched: number; pending: number; rejected: number }> = {}

  for (const l of lk) {
    const vid = (l as any).vacancy_id
    const wid = (l as any).worker_id
    if (!vid || !(l as any).worker_liked) continue
    if (!likesByVac[vid]) likesByVac[vid] = []
    if (!likeCountByVac[vid]) likeCountByVac[vid] = { total: 0, matched: 0, pending: 0, rejected: 0 }
    likeCountByVac[vid].total++
    let st: string
    if ((l as any).is_match) { st = 'matched'; likeCountByVac[vid].matched++ }
    else if ((l as any).employer_liked === false) { st = 'rejected'; likeCountByVac[vid].rejected++ }
    else { st = 'pending'; likeCountByVac[vid].pending++ }
    const worker = userMap[wid]
    likesByVac[vid].push({ id: (l as any).id, workerId: wid, name: worker?.name ?? '—', phone: worker?.phone ?? '—', status: st, date: (l as any).created_at?.slice(0, 10) ?? '' })
  }

  const tempVacancyCards = t.map((v: any) => ({
    id: v.id,
    title: v.work_type_label ?? WORK_TYPE_LABELS[v.work_type ?? ''] ?? 'Вакансия',
    company: v.company ?? '—',
    salary: v.salary ? Number(v.salary).toLocaleString('ru-RU') + ' ₽' : null,
    status: v.status ?? 'open',
    isUrgent: !!v.is_urgent,
    workersNeeded: v.workers_needed ?? null,
    workersFound: v.workers_found ?? 0,
    shiftDate: v.date ?? null,
    timeStart: v.time_start ?? null,
    timeEnd: v.time_end ?? null,
    address: v.address ?? null,
    metro: v.metro_station ?? null,
    createdAt: v.created_at?.slice(0, 10) ?? null,
    apps: likeCountByVac[v.id] ?? { total: 0, matched: 0, pending: 0, rejected: 0 },
    applicants: likesByVac[v.id] ?? [],
  })).sort((a: any, b: any) => b.apps.total - a.apps.total)

  const w30 = subDays(new Date(), 30).toISOString()
  const days30 = dayRange(30)
  const days90 = dayRange(90)

  const tByDay = groupByDate(t, 'created_at')
  const pByDay = groupByDate(p, 'created_at')

  const daily90 = days90.map(d => ({
    date: toDayLabel(d),
    temp: tByDay[d] ?? 0,
    perm: pByDay[d] ?? 0,
  }))

  const wtMap: Record<string, number> = {}
  for (const v of t) {
    const wt = (v as any).work_type ?? 'other'
    wtMap[wt] = (wtMap[wt] ?? 0) + 1
  }
  const workTypeDist = Object.entries(wtMap)
    .map(([k, v]) => ({ name: WORK_TYPE_LABELS[k] ?? k, temp: v, value: v }))
    .sort((a, b) => b.value - a.value)

  const empMap: Record<string, { name: string; temp: number; perm: number }> = {}
  for (const v of t) {
    const eid = (v as any).employer_id
    const company = (v as any).company ?? eid
    if (!eid) continue
    if (!empMap[eid]) empMap[eid] = { name: company, temp: 0, perm: 0 }
    empMap[eid].temp++
    empMap[eid].name = company
  }
  for (const v of p) {
    const eid = (v as any).employer_id
    const company = (v as any).company ?? eid
    if (!eid) continue
    if (!empMap[eid]) empMap[eid] = { name: company, temp: 0, perm: 0 }
    empMap[eid].perm++
    empMap[eid].name = company
  }
  const topEmployers = Object.values(empMap)
    .map(e => ({ ...e, total: e.temp + e.perm }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const salaryBuckets: Record<string, number> = {
    '< 30k': 0, '30–50k': 0, '50–80k': 0, '80–120k': 0, '> 120k': 0,
  }
  for (const v of p) {
    const s = Number((v as any).salary ?? 0)
    if (s < 30000) salaryBuckets['< 30k']++
    else if (s < 50000) salaryBuckets['30–50k']++
    else if (s < 80000) salaryBuckets['50–80k']++
    else if (s < 120000) salaryBuckets['80–120k']++
    else salaryBuckets['> 120k']++
  }
  const salaryDist = Object.entries(salaryBuckets).map(([name, value]) => ({ name, value }))

  // ── Динамика просмотров (уникальные просмотры с меткой времени) ──
  const tViews = (tvViews ?? []) as any[]
  const pViews = (pvViews ?? []) as any[]
  const days30v = dayRange(30)
  const tViewsByDay = groupByDate(tViews.map(v => ({ created_at: v.viewed_at })), 'created_at')
  const pViewsByDay = groupByDate(pViews.map(v => ({ created_at: v.viewed_at })), 'created_at')
  const viewsDaily30 = days30v.map(d => ({
    date: toDayLabel(d),
    temp: tViewsByDay[d] ?? 0,
    perm: pViewsByDay[d] ?? 0,
  }))
  const w7v = subDays(new Date(), 7).toISOString()
  const viewsKpi = {
    tempTotal: tViews.length,
    permTotal: pViews.length,
    temp7: tViews.filter(v => (v.viewed_at ?? '') > w7v).length,
    perm7: pViews.filter(v => (v.viewed_at ?? '') > w7v).length,
  }

  return {
    kpi: {
      totalTemp: t.length,
      totalPerm: p.length,
      openTemp: t.filter((x: any) => x.status === 'open').length,
      openPerm: p.filter((x: any) => x.status === 'open').length,
      closedTemp: t.filter((x: any) => x.status === 'closed').length,
      closedPerm: p.filter((x: any) => x.status === 'closed').length,
      urgentTemp: t.filter((x: any) => x.is_urgent).length,
      newMonth: t.filter((x: any) => x.created_at > w30).length + p.filter((x: any) => x.created_at > w30).length,
    },
    viewsDaily30,
    viewsKpi,
    daily90,
    workTypeDist,
    topEmployers,
    salaryDist,
    tempStatus: [
      { name: 'Открыто', value: t.filter((x: any) => x.status === 'open').length, fill: PALETTE.green },
      { name: 'Закрыто', value: t.filter((x: any) => x.status === 'closed').length, fill: PALETTE.gray },
    ],
    permStatus: [
      { name: 'Открыто', value: p.filter((x: any) => x.status === 'open').length, fill: PALETTE.green },
      { name: 'Закрыто', value: p.filter((x: any) => x.status === 'closed').length, fill: PALETTE.gray },
    ],
    permVacancyCards,
    tempVacancyCards,
  }
}

// ─── matching ────────────────────────────────────────────────────────────────

export async function fetchMatching() {
  const [{ data: likes }, { data: tv }] = await Promise.all([
    supabase.from('jm_likes').select('id,is_match,matched_at,worker_confirmed,employer_confirmed,shift_completed,worker_liked,employer_liked,worker_skipped,created_at,vacancy_id'),
    supabase.from('jm_vacancies').select('id,work_type'),
  ])

  const lk = likes ?? []
  const vacMap: Record<string, string> = {}
  for (const v of tv ?? []) vacMap[(v as any).id] = WORK_TYPE_LABELS[(v as any).work_type ?? ''] ?? (v as any).work_type ?? '?'

  // В jm_likes лежат и отклики (worker_liked), и скипы (worker_skipped) —
  // для метрик мэтчей считаем только реальные отклики
  const realLikes = lk.filter((x: any) => x.worker_liked)
  const matches = lk.filter((x: any) => x.is_match)
  const confirmed = lk.filter((x: any) => x.worker_confirmed && x.employer_confirmed)
  const completed = lk.filter((x: any) => x.shift_completed)

  const days30 = dayRange(30)
  const matchByDay = groupByDate(
    matches.map((x: any) => ({ created_at: x.matched_at ?? x.created_at })),
    'created_at'
  )
  const likeByDay = groupByDate(realLikes, 'created_at')

  const daily30 = days30.map(d => ({
    date: toDayLabel(d),
    likes: likeByDay[d] ?? 0,
    matches: matchByDay[d] ?? 0,
  }))

  const wtLikes: Record<string, number> = {}
  const wtMatches: Record<string, number> = {}
  for (const l of realLikes) {
    const wt = vacMap[(l as any).vacancy_id] ?? 'Другое'
    wtLikes[wt] = (wtLikes[wt] ?? 0) + 1
    if ((l as any).is_match) wtMatches[wt] = (wtMatches[wt] ?? 0) + 1
  }
  const matchByWorkType = Object.keys(wtLikes).map(wt => ({
    name: wt,
    likes: wtLikes[wt],
    matches: wtMatches[wt] ?? 0,
    rate: wtLikes[wt] > 0 ? Math.round(((wtMatches[wt] ?? 0) / wtLikes[wt]) * 100) : 0,
  })).sort((a, b) => b.likes - a.likes)

  const funnel = [
    { name: 'Показы', value: lk.length, fill: PALETTE.blue },
    { name: 'Отклики', value: realLikes.length, fill: PALETTE.cyan },
    { name: 'Мэтчи', value: matches.length, fill: PALETTE.purple },
    { name: 'Подтверждено', value: confirmed.length, fill: PALETTE.orange },
    { name: 'Завершено', value: completed.length, fill: PALETTE.green },
  ]

  return {
    kpi: {
      totalLikes: realLikes.length,
      totalMatches: matches.length,
      matchRate: realLikes.length > 0 ? ((matches.length / realLikes.length) * 100).toFixed(1) : '0',
      confirmed: confirmed.length,
      confirmRate: matches.length > 0 ? ((confirmed.length / matches.length) * 100).toFixed(1) : '0',
      completed: completed.length,
      completionRate: confirmed.length > 0 ? ((completed.length / confirmed.length) * 100).toFixed(1) : '0',
      skipped: lk.filter((x: any) => x.worker_skipped).length,
    },
    daily30,
    funnel,
    matchByWorkType,
  }
}

// ─── engagement ──────────────────────────────────────────────────────────────

export async function fetchEngagement() {
  const [{ data: chats }, { data: messages }] = await Promise.all([
    supabase.from('jm_chats').select('id,created_at,unread_worker,unread_employer'),
    supabase.from('jm_messages').select('id,created_at,chat_id,sender_id'),
  ])

  const ch = chats ?? []
  const ms = messages ?? []

  const days30 = dayRange(30)
  const days90 = dayRange(90)

  const chatByDay = groupByDate(ch, 'created_at')
  const msgByDay = groupByDate(ms, 'created_at')

  const daily90 = days90.map(d => ({
    date: toDayLabel(d),
    chats: chatByDay[d] ?? 0,
    messages: msgByDay[d] ?? 0,
  }))

  const chatMsgCount: Record<string, number> = {}
  for (const m of ms) {
    const cid = (m as any).chat_id
    if (cid) chatMsgCount[cid] = (chatMsgCount[cid] ?? 0) + 1
  }
  const msgCounts = Object.values(chatMsgCount)
  const buckets = { '1': 0, '2–5': 0, '6–10': 0, '11–20': 0, '20+': 0 }
  for (const c of msgCounts) {
    if (c === 1) buckets['1']++
    else if (c <= 5) buckets['2–5']++
    else if (c <= 10) buckets['6–10']++
    else if (c <= 20) buckets['11–20']++
    else buckets['20+']++
  }
  const msgDist = Object.entries(buckets).map(([name, value]) => ({ name, value }))

  const unreadWorker = ch.filter((x: any) => (x.unread_worker ?? 0) > 0).length
  const unreadEmployer = ch.filter((x: any) => (x.unread_employer ?? 0) > 0).length

  return {
    kpi: {
      totalChats: ch.length,
      totalMessages: ms.length,
      avgMsgPerChat: ch.length > 0 ? (ms.length / ch.length).toFixed(1) : '0',
      unreadWorker,
      unreadEmployer,
      activeChats: ch.filter((x: any) => x.created_at > subDays(new Date(), 7).toISOString()).length,
    },
    daily90,
    msgDist,
  }
}

// ─── quality ─────────────────────────────────────────────────────────────────

export async function fetchQuality() {
  const [{ data: ratings }, { data: complaints }, { data: applications }] = await Promise.all([
    supabase.from('jm_ratings').select('id,rating,role,created_at,review_text').order('created_at', { ascending: false }),
    supabase.from('jm_complaints').select('id,complaint_type,description,created_at,reporter_phone,target_phone,reporter_company,target_company').order('created_at', { ascending: false }),
    supabase.from('jm_perm_applications').select('id,status,created_at').order('created_at', { ascending: false }),
  ])

  const rt = ratings ?? []
  const cp = complaints ?? []
  const ap = applications ?? []

  const avgRating = rt.length > 0
    ? rt.reduce((s: number, r: any) => s + Number(r.rating), 0) / rt.length
    : 0

  const workerRatings = rt.filter((x: any) => x.role === 'worker')
  const employerRatings = rt.filter((x: any) => x.role === 'employer')

  const avgWorkerRating = workerRatings.length > 0
    ? workerRatings.reduce((s: number, r: any) => s + Number(r.rating), 0) / workerRatings.length
    : 0
  const avgEmployerRating = employerRatings.length > 0
    ? employerRatings.reduce((s: number, r: any) => s + Number(r.rating), 0) / employerRatings.length
    : 0

  const rMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of rt) rMap[Math.round(Number((r as any).rating))]++
  const ratingDist = [1, 2, 3, 4, 5].map(v => ({
    name: '★'.repeat(v),
    value: rMap[v] ?? 0,
    workers: workerRatings.filter((r: any) => Math.round(Number(r.rating)) === v).length,
    employers: employerRatings.filter((r: any) => Math.round(Number(r.rating)) === v).length,
  }))

  const days30 = dayRange(30)
  const rtByDay: Record<string, number[]> = {}
  for (const r of rt) {
    const d = (r as any).created_at?.slice(0, 10)
    if (d) {
      if (!rtByDay[d]) rtByDay[d] = []
      rtByDay[d].push(Number((r as any).rating))
    }
  }
  const ratingTrend = days30.map(d => ({
    date: toDayLabel(d),
    avg: rtByDay[d] ? rtByDay[d].reduce((s, v) => s + v, 0) / rtByDay[d].length : null,
    count: rtByDay[d]?.length ?? 0,
  }))

  const workerComplaints = cp.filter((x: any) => x.complaint_type === 'worker')
  const employerComplaints = cp.filter((x: any) => x.complaint_type === 'employer')

  const cpByDay = groupByDate(cp, 'created_at')
  const complaintTrend = days30.map(d => ({
    date: toDayLabel(d),
    count: cpByDay[d] ?? 0,
  }))

  const appStatus = [
    { name: 'Ожидает', value: ap.filter((x: any) => x.status === 'pending').length, fill: PALETTE.amber },
    { name: 'Одобрено', value: ap.filter((x: any) => x.status === 'approved').length, fill: PALETTE.green },
    { name: 'Отклонено', value: ap.filter((x: any) => x.status === 'rejected').length, fill: PALETTE.red },
  ]

  const recentComplaints = cp.slice(0, 15).map((x: any) => ({
    type: x.complaint_type,
    reporter: x.reporter_phone,
    target: x.target_phone,
    company: x.reporter_company ?? x.target_company ?? '—',
    desc: x.description ?? '—',
    date: x.created_at?.slice(0, 10),
  }))

  return {
    kpi: {
      avgRating: avgRating.toFixed(2),
      avgWorkerRating: avgWorkerRating.toFixed(2),
      avgEmployerRating: avgEmployerRating.toFixed(2),
      totalRatings: rt.length,
      totalComplaints: cp.length,
      workerComplaints: workerComplaints.length,
      employerComplaints: employerComplaints.length,
      totalApplications: ap.length,
      pendingApplications: ap.filter((x: any) => x.status === 'pending').length,
    },
    ratingDist,
    ratingTrend,
    complaintTrend,
    appStatus,
    complaintSplit: [
      { name: 'На работников', value: workerComplaints.length, fill: PALETTE.orange },
      { name: 'На работодателей', value: employerComplaints.length, fill: PALETTE.blue },
    ],
    recentComplaints,
  }
}

// ─── reviews ─────────────────────────────────────────────────────────────────

export async function fetchReviews() {
  const [{ data: ratings }, { data: users }, { data: tv }, { data: pv }] = await Promise.all([
    supabase.from('jm_ratings').select('id,from_user_id,to_user_id,vacancy_id,rating,role,review_text,created_at').order('created_at', { ascending: false }),
    supabase.from('jm_users').select('id,first_name,last_name,phone,role,company'),
    supabase.from('jm_vacancies').select('id,work_type_label,work_type,company,status,address,metro_station'),
    supabase.from('jm_perm_vacancies').select('id,title,company,status,address,metro_station'),
  ])

  const rt = ratings ?? []
  const us = users ?? []
  const tempMap: Record<string, any> = {}
  const permMap: Record<string, any> = {}
  for (const v of tv ?? []) tempMap[v.id] = { ...v, vacType: 'temp' }
  for (const v of pv ?? []) permMap[v.id] = { ...v, vacType: 'perm' }

  const userMap: Record<string, any> = {}
  for (const u of us) userMap[u.id] = u

  function userName(u: any) {
    if (!u) return '—'
    const fn = (u.first_name ?? '').trim()
    const ln = (u.last_name ?? '').trim()
    if (fn || ln) return [fn, ln].filter(Boolean).join(' ')
    return u.phone ?? '—'
  }

  const WORK_LABELS: Record<string, string> = {
    stocker: 'Кладовщик', cook: 'Повар', shift_supervisor: 'Менеджер', picker: 'Комплектовщик',
  }

  const list = rt.map((r: any) => {
    const from = userMap[r.from_user_id]
    const to = userMap[r.to_user_id]
    const tempVac = tempMap[r.vacancy_id]
    const permVac = permMap[r.vacancy_id]
    const vac = tempVac ?? permVac ?? null
    return {
      id: r.id,
      rating: Number(r.rating),
      role: r.role as 'worker' | 'employer',
      reviewText: r.review_text ?? null,
      createdAt: r.created_at?.slice(0, 10) ?? '',
      fromName: userName(from),
      fromRole: from?.role ?? r.role,
      toName: userName(to),
      toRole: to?.role ?? (r.role === 'employer' ? 'worker' : 'employer'),
      vacTitle: vac ? (vac.title ?? vac.work_type_label ?? WORK_LABELS[vac.work_type ?? ''] ?? 'Вакансия') : '—',
      vacCompany: vac?.company ?? '—',
      vacStatus: vac?.status ?? null,
      vacType: vac?.vacType ?? null,
      vacAddress: vac?.address ?? null,
      vacMetro: vac?.metro_station ?? null,
    }
  })

  const avgRating = list.length > 0
    ? (list.reduce((s: number, r: any) => s + r.rating, 0) / list.length).toFixed(2)
    : '—'

  const withText = list.filter((r: any) => r.reviewText).length

  return { list, avgRating, total: list.length, withText }
}

// ─── user profile ────────────────────────────────────────────────────────────

export async function fetchUserProfile(userId: string) {
  const [
    { data: user },
    { data: chats },
    { data: ratingsReceived },
    { data: ratingsSent },
    { data: likes },
    { data: vacancies },
    { data: permVacancies },
    { data: permApps },
    { data: webPushSub },
  ] = await Promise.all([
    supabase.from('jm_users').select('*').eq('id', userId).maybeSingle(),
    supabase.from('jm_chats').select('id,vac_title,company_name,created_at,worker_id,employer_id,vacancy_id')
      .or(`worker_id.eq.${userId},employer_id.eq.${userId}`)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('jm_ratings').select('id,rating,review_text,role,created_at,from_user_id')
      .eq('to_user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('jm_ratings').select('id,rating,review_text,role,created_at,to_user_id')
      .eq('from_user_id', userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('jm_likes').select('id,vacancy_id,is_match,worker_liked,employer_liked,created_at')
      .eq('worker_id', userId).order('created_at', { ascending: false }).limit(30),
    supabase.from('jm_vacancies').select('id,work_type_label,work_type,status,created_at,company,address')
      .eq('employer_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('jm_perm_vacancies').select('id,title,status,created_at,company,address')
      .eq('employer_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('jm_perm_applications').select('id,vacancy_id,status,created_at')
      .eq('worker_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('jm_web_push_subscriptions').select('updated_at').eq('user_id', userId).maybeSingle(),
  ])

  const avgRating = ratingsReceived && ratingsReceived.length > 0
    ? (ratingsReceived.reduce((s: number, r: any) => s + Number(r.rating), 0) / ratingsReceived.length).toFixed(1)
    : null

  return {
    user: user ?? null,
    chats: chats ?? [],
    ratingsReceived: ratingsReceived ?? [],
    ratingsSent: ratingsSent ?? [],
    likes: likes ?? [],
    vacancies: vacancies ?? [],
    permVacancies: permVacancies ?? [],
    permApps: permApps ?? [],
    avgRating,
    totalLikes: (likes ?? []).length,
    totalMatches: (likes ?? []).filter((l: any) => l.is_match).length,
    hasWebPush: !!webPushSub,
    webPushDate: (webPushSub as any)?.updated_at?.slice(0, 10) ?? null,
  }
}

// ─── cohorts ─────────────────────────────────────────────────────────────────

export async function fetchCohorts() {
  const [{ data: users }, { data: likes }, { data: messages }] = await Promise.all([
    supabase.from('jm_users').select('id,created_at,role'),
    supabase.from('jm_likes').select('worker_id,created_at'),
    supabase.from('jm_messages').select('sender_id,created_at'),
  ])

  const u = users ?? []

  function weekStart(date: Date): number {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay())
    return d.getTime()
  }

  const activityWeeks: Record<string, Set<number>> = {}
  for (const l of likes ?? []) {
    if (!l.worker_id || !l.created_at) continue
    if (!activityWeeks[l.worker_id]) activityWeeks[l.worker_id] = new Set()
    activityWeeks[l.worker_id].add(weekStart(new Date(l.created_at)))
  }
  for (const m of messages ?? []) {
    const sid = (m as any).sender_id
    if (!sid || !(m as any).created_at || sid === 'system') continue
    if (!activityWeeks[sid]) activityWeeks[sid] = new Set()
    activityWeeks[sid].add(weekStart(new Date((m as any).created_at)))
  }

  const now = new Date()
  const weeks: number[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    weeks.push(weekStart(d))
  }

  const cohortUsers: Record<number, string[]> = {}
  for (const user of u) {
    if (!user.created_at) continue
    const wk = weekStart(new Date(user.created_at))
    if (!cohortUsers[wk]) cohortUsers[wk] = []
    cohortUsers[wk].push(user.id)
  }

  const table = weeks.map((wk, wi) => {
    const members = cohortUsers[wk] ?? []
    const size = members.length
    const label = format(new Date(wk), 'dd.MM')

    const cols: (number | null)[] = []
    for (let delta = 0; delta <= 4; delta++) {
      const targetWk = weeks[wi + delta]
      if (targetWk === undefined) { cols.push(null); continue }
      if (delta === 0) { cols.push(100); continue }
      if (size === 0) { cols.push(0); continue }
      const active = members.filter(id => activityWeeks[id]?.has(targetWk)).length
      cols.push(Math.round(active / size * 100))
    }

    const activated = size > 0
      ? members.filter(id => activityWeeks[id]?.has(wk) || activityWeeks[id]?.has(weeks[wi + 1] ?? 0)).length
      : 0

    return { label, size, cols, activationRate: size > 0 ? Math.round(activated / size * 100) : 0 }
  })

  const weeklyBar = weeks.map((wk, i) => ({
    label: format(new Date(wk), 'dd.MM'),
    workers: u.filter(u => u.role === 'worker' && weekStart(new Date(u.created_at)) === wk).length,
    employers: u.filter(u => u.role === 'employer' && weekStart(new Date(u.created_at)) === wk).length,
  }))

  return { table, weeklyBar }
}

// ─── funnel ──────────────────────────────────────────────────────────────────

export async function fetchFunnel() {
  const [
    { data: users },
    { data: likes },
    { data: permApps },
  ] = await Promise.all([
    supabase.from('jm_users').select('id,role,created_at'),
    supabase.from('jm_likes').select('id,worker_id,is_match,worker_liked,worker_confirmed,employer_confirmed,shift_completed,created_at'),
    supabase.from('jm_perm_applications').select('id,worker_id,status,created_at'),
  ])

  const u = users ?? []
  const lk = likes ?? []
  const ap = permApps ?? []

  const workers = u.filter((x: any) => x.role === 'worker')

  const likedLk = lk.filter((l: any) => l.worker_liked)
  const matchedLk = lk.filter((l: any) => l.is_match)
  const confirmedLk = lk.filter((l: any) => l.worker_confirmed && l.employer_confirmed)
  const completedLk = lk.filter((l: any) => l.shift_completed)

  const workersWhoLiked = new Set(likedLk.map((l: any) => l.worker_id)).size
  const workersWithMatch = new Set(matchedLk.map((l: any) => l.worker_id)).size
  const workersWithShiftSet = new Set(completedLk.map((l: any) => l.worker_id))

  const workerRegMap: Record<string, string> = {}
  for (const usr of workers) workerRegMap[(usr as any).id] = (usr as any).created_at
  const firstLike: Record<string, string> = {}
  for (const l of likedLk) {
    const wid = (l as any).worker_id
    if (!firstLike[wid] || (l as any).created_at < firstLike[wid]) firstLike[wid] = (l as any).created_at
  }
  let activated7d = 0
  for (const wid of Object.keys(firstLike)) {
    const reg = workerRegMap[wid]
    if (!reg) continue
    if (new Date(firstLike[wid]).getTime() - new Date(reg).getTime() <= 7 * 86400_000) activated7d++
  }

  const shiftsByWorker: Record<string, number> = {}
  for (const l of completedLk) {
    const wid = (l as any).worker_id
    shiftsByWorker[wid] = (shiftsByWorker[wid] ?? 0) + 1
  }
  const shiftCounts = Object.values(shiftsByWorker)
  const workersWithShift = shiftCounts.length
  const avgShiftsPerWorker = workersWithShift > 0
    ? (shiftCounts.reduce((a, b) => a + b, 0) / workersWithShift).toFixed(1) : '0'
  const returningWorkers = shiftCounts.filter(c => c > 1).length

  const likesByWorker: Record<string, number> = {}
  for (const l of likedLk) {
    const wid = (l as any).worker_id
    likesByWorker[wid] = (likesByWorker[wid] ?? 0) + 1
  }
  const likeCounts = Object.values(likesByWorker)
  const activityBuckets = [
    { name: '0 лайков', value: Math.max(0, workers.length - Object.keys(likesByWorker).length) },
    { name: '1', value: likeCounts.filter(c => c === 1).length },
    { name: '2–5', value: likeCounts.filter(c => c >= 2 && c <= 5).length },
    { name: '6–10', value: likeCounts.filter(c => c >= 6 && c <= 10).length },
    { name: '11+', value: likeCounts.filter(c => c > 10).length },
  ]

  const shiftBuckets = [
    { name: '1 смена', value: shiftCounts.filter(c => c === 1).length },
    { name: '2–3', value: shiftCounts.filter(c => c >= 2 && c <= 3).length },
    { name: '4–7', value: shiftCounts.filter(c => c >= 4 && c <= 7).length },
    { name: '8+', value: shiftCounts.filter(c => c >= 8).length },
  ]

  const days30 = dayRange(30)
  const likeByDay = groupByDate(likedLk, 'created_at')
  const matchByDay = groupByDate(matchedLk, 'created_at')
  const completedByDay = groupByDate(completedLk, 'created_at')
  const daily30 = days30.map(d => ({
    date: toDayLabel(d),
    likes: likeByDay[d] ?? 0,
    matches: matchByDay[d] ?? 0,
    completed: completedByDay[d] ?? 0,
  }))

  const mainFunnel = [
    { name: 'Зарегистрировались', value: workers.length, fill: PALETTE.blue },
    { name: 'Лайкнули (уник.)', value: workersWhoLiked, fill: PALETTE.cyan },
    { name: 'Получили матч', value: workersWithMatch, fill: PALETTE.purple },
    { name: 'Завершили смену', value: workersWithShiftSet.size, fill: PALETTE.green },
  ]

  const eventFunnel = [
    { name: 'Лайки воркеров', value: likedLk.length, fill: PALETTE.blue },
    { name: 'Совпадения', value: matchedLk.length, fill: PALETTE.purple },
    { name: 'Подтверждено', value: confirmedLk.length, fill: PALETTE.orange },
    { name: 'Смены завершены', value: completedLk.length, fill: PALETTE.green },
  ]

  const permFunnel = [
    { name: 'Подано заявок', value: ap.length, fill: PALETTE.blue },
    { name: 'Одобрено', value: ap.filter((a: any) => a.status === 'approved').length, fill: PALETTE.green },
    { name: 'Отклонено', value: ap.filter((a: any) => a.status === 'rejected').length, fill: PALETTE.red },
  ]

  return {
    kpi: {
      workers: workers.length,
      activatedWorkers: workersWhoLiked,
      activationRate: workers.length > 0 ? ((workersWhoLiked / workers.length) * 100).toFixed(1) : '0',
      activation7d: workers.length > 0 ? ((activated7d / workers.length) * 100).toFixed(1) : '0',
      totalLikes: likedLk.length,
      totalMatches: matchedLk.length,
      matchRate: likedLk.length > 0 ? ((matchedLk.length / likedLk.length) * 100).toFixed(1) : '0',
      completedCount: completedLk.length,
      completionRate: matchedLk.length > 0 ? ((completedLk.length / matchedLk.length) * 100).toFixed(1) : '0',
      avgShiftsPerWorker,
      returningWorkers,
      returningRate: workersWithShift > 0 ? ((returningWorkers / workersWithShift) * 100).toFixed(1) : '0',
      permApplications: ap.length,
      permApproved: ap.filter((a: any) => a.status === 'approved').length,
    },
    mainFunnel,
    eventFunnel,
    daily30,
    activityBuckets,
    shiftBuckets,
    permFunnel,
  }
}

// ─── chats ───────────────────────────────────────────────────────────────────

export async function fetchChats() {
  const [{ data: chats }, { data: messages }, { data: users }] = await Promise.all([
    supabase
      .from('jm_chats')
      .select('id,worker_id,employer_id,vac_title,company_name,unread_worker,unread_employer,created_at,vacancy_id')
      .order('created_at', { ascending: false }),
    supabase
      .from('jm_messages')
      .select('id,chat_id,sender_id,text,created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('jm_users')
      .select('id,first_name,last_name,phone,role,company'),
  ])

  const ch = chats ?? []
  const ms = messages ?? []
  const us = users ?? []

  const vacIds = Array.from(new Set(ch.map((c: any) => c.vacancy_id).filter(Boolean))) as string[]
  const [{ data: tempVacs }, { data: permVacs }] = vacIds.length > 0
    ? await Promise.all([
        supabase.from('jm_vacancies').select('id,date,address,metro_station,time_start,time_end').in('id', vacIds),
        supabase.from('jm_perm_vacancies').select('id,address,metro_station').in('id', vacIds),
      ])
    : [{ data: [] }, { data: [] }]

  const tempVacMap: Record<string, any> = {}
  for (const v of tempVacs ?? []) tempVacMap[(v as any).id] = { ...v, vacType: 'temp' }
  const permVacMap: Record<string, any> = {}
  for (const v of permVacs ?? []) permVacMap[(v as any).id] = { ...v, vacType: 'perm' }

  const userMap: Record<string, any> = {}
  for (const u of us) userMap[(u as any).id] = u

  function displayName(u: any) {
    if (!u) return 'Неизвестно'
    const fn = (u.first_name ?? '').trim()
    const ln = (u.last_name ?? '').trim()
    if (fn || ln) return [fn, ln].filter(Boolean).join(' ')
    return u.phone ?? '—'
  }

  function initials(u: any) {
    if (!u) return '?'
    const fn = (u.first_name ?? '').trim()
    const ln = (u.last_name ?? '').trim()
    if (fn && ln) return (fn[0] + ln[0]).toUpperCase()
    if (fn) return fn.slice(0, 2).toUpperCase()
    return '??'
  }

  const chatList = ch.map((c: any) => {
    const worker = userMap[c.worker_id]
    const employer = userMap[c.employer_id]
    const chatMsgs = ms.filter((m: any) => m.chat_id === c.id)
    const last = chatMsgs[chatMsgs.length - 1]

    const vacId = c.vacancy_id
    const tempVac = vacId ? tempVacMap[vacId] : null
    const permVac = vacId ? permVacMap[vacId] : null
    const vacType: 'temp' | 'perm' | null = tempVac ? 'temp' : permVac ? 'perm' : null
    const vacDetails = tempVac ?? permVac ?? null

    return {
      id: c.id,
      vacTitle: c.vac_title ?? 'Вакансия',
      companyName: c.company_name || (employer?.company ?? ''),
      vacType,
      vacAddress: vacDetails?.address ?? null,
      vacMetro: vacDetails?.metro_station ?? null,
      vacDate: tempVac?.date ?? null,
      vacTimeStart: tempVac?.time_start ?? null,
      vacTimeEnd: tempVac?.time_end ?? null,
      workerId: c.worker_id,
      employerId: c.employer_id,
      workerName: displayName(worker),
      workerInitials: initials(worker),
      employerName: displayName(employer),
      employerInitials: initials(employer),
      unreadWorker: c.unread_worker ?? 0,
      unreadEmployer: c.unread_employer ?? 0,
      createdAt: c.created_at,
      messageCount: chatMsgs.length,
      lastMessage: last ? {
        text: last.text ?? '',
        senderId: last.sender_id,
        createdAt: last.created_at,
      } : null,
      messages: chatMsgs.map((m: any) => ({
        id: m.id,
        senderId: m.sender_id,
        text: m.text ?? '',
        createdAt: m.created_at,
        senderName: m.sender_id === 'system' ? 'Система'
          : m.sender_id === c.worker_id ? displayName(worker)
          : m.sender_id === c.employer_id ? displayName(employer)
          : 'Неизвестно',
        side: m.sender_id === 'system' ? 'system'
          : m.sender_id === c.worker_id ? 'worker'
          : 'employer',
      })),
    }
  })

  return chatList
}

// ─── geo ─────────────────────────────────────────────────────────────────────

export async function fetchGeo() {
  const [{ data: users }, { data: vacancies }, { data: permVacancies }] = await Promise.all([
    supabase.from('jm_users').select('id,role,metro_station'),
    supabase.from('jm_vacancies').select('id,metro_station,status'),
    supabase.from('jm_perm_vacancies').select('id,metro_station,status'),
  ])

  const u = users ?? []
  const tv = vacancies ?? []
  const pv = permVacancies ?? []

  const userMetroMap: Record<string, { workers: number; employers: number }> = {}
  for (const user of u) {
    const s = (user as any).metro_station
    if (!s) continue
    if (!userMetroMap[s]) userMetroMap[s] = { workers: 0, employers: 0 }
    if ((user as any).role === 'worker') userMetroMap[s].workers++
    else userMetroMap[s].employers++
  }

  const userMetroTop = Object.entries(userMetroMap)
    .map(([station, counts]) => ({ station, ...counts, total: counts.workers + counts.employers }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)

  const vacMetroMap: Record<string, number> = {}
  for (const v of [...tv, ...pv]) {
    const s = (v as any).metro_station
    if (!s) continue
    vacMetroMap[s] = (vacMetroMap[s] ?? 0) + 1
  }

  const vacMetroTop = Object.entries(vacMetroMap)
    .map(([station, value]) => ({ station, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15)

  const withMetro = u.filter((x: any) => x.metro_station).length
  const withoutMetro = u.filter((x: any) => !x.metro_station).length
  const vacsWithMetro = [...tv, ...pv].filter((x: any) => x.metro_station).length

  return {
    kpi: {
      totalUsers: u.length,
      withMetro,
      withoutMetro,
      metroFill: u.length > 0 ? ((withMetro / u.length) * 100).toFixed(0) : '0',
      uniqueStations: Object.keys(userMetroMap).length,
      totalVacancies: tv.length + pv.length,
      vacsWithMetro,
    },
    userMetroTop,
    vacMetroTop,
  }
}

// ─── exchange (биржа) ────────────────────────────────────────────────────────

export async function fetchExchange() {
  const [
    { data: bulletins },
    { data: slots },
    { data: chats },
    { data: slotChats },
  ] = await Promise.all([
    supabaseAdmin.from('jm_bulletins').select('id,work_type,date,time_start,time_end,metro,status,views,employer_id,company,created_at'),
    supabaseAdmin.from('jm_worker_slots').select('id,work_type,date,time_start,time_end,metro,status,worker_id,created_at'),
    supabaseAdmin.from('jm_chats').select('id,bulletin_id,worker_slot_id,created_at').not('bulletin_id', 'is', null),
    supabaseAdmin.from('jm_chats').select('id,bulletin_id,worker_slot_id,created_at').not('worker_slot_id', 'is', null),
  ])

  const bl = bulletins ?? []
  const sl = slots ?? []
  const ch = chats ?? []
  const sch = slotChats ?? []

  const now = new Date()
  const w30 = subDays(now, 30).toISOString()
  const w60 = subDays(now, 60).toISOString()
  const w7 = subDays(now, 7).toISOString()

  const openBulletins = bl.filter((x: any) => x.status === 'open')
  const closedBulletins = bl.filter((x: any) => x.status === 'closed')
  const openSlots = sl.filter((x: any) => x.status === 'open')
  const closedSlots = sl.filter((x: any) => x.status === 'closed')

  const newBulletinsMonth = bl.filter((x: any) => x.created_at > w30).length
  const prevBulletinsMonth = bl.filter((x: any) => x.created_at > w60 && x.created_at <= w30).length
  const newChatsMonth = ch.filter((x: any) => x.created_at > w30).length
  const prevChatsMonth = ch.filter((x: any) => x.created_at > w60 && x.created_at <= w30).length
  const newSlotsMonth = sl.filter((x: any) => x.created_at > w30).length
  const prevSlotsMonth = sl.filter((x: any) => x.created_at > w60 && x.created_at <= w30).length

  const totalViews = bl.reduce((s: number, x: any) => s + (x.views ?? 0), 0)
  const avgViews = bl.length > 0 ? Math.round(totalViews / bl.length) : 0
  const avgResponses = bl.length > 0 ? (ch.length / bl.length).toFixed(1) : '0'

  // per-bulletin response counts
  const respByBulletin: Record<string, number> = {}
  for (const c of ch) {
    const bid = (c as any).bulletin_id
    if (bid) respByBulletin[bid] = (respByBulletin[bid] ?? 0) + 1
  }
  const zeroResponseBulletins = bl.filter((b: any) => !(b.id in respByBulletin)).length
  const zeroResponsePct = bl.length > 0 ? Math.round((zeroResponseBulletins / bl.length) * 100) : 0

  // view-to-response conversion
  const conversionPct = totalViews > 0 ? ((ch.length / totalViews) * 100).toFixed(1) : '0'

  // daily 30-day activity
  const days30 = dayRange(30)
  const blByDay = groupByDate(bl, 'created_at')
  const chByDay = groupByDate(ch, 'created_at')
  const slByDay = groupByDate(sl, 'created_at')
  const daily30 = days30.map(d => ({
    date: toDayLabel(d),
    bulletins: blByDay[d] ?? 0,
    responses: chByDay[d] ?? 0,
    slots: slByDay[d] ?? 0,
  }))

  // work type distribution for bulletins
  const wtMap: Record<string, number> = {}
  for (const b of bl) {
    const wt = (b as any).work_type ?? 'other'
    wtMap[wt] = (wtMap[wt] ?? 0) + 1
  }
  const workTypeDist = Object.entries(wtMap)
    .map(([key, value]) => ({ name: WORK_TYPE_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value)

  // work type distribution for worker slots
  const slWtMap: Record<string, number> = {}
  for (const s of sl) {
    const wt = (s as any).work_type ?? 'other'
    slWtMap[wt] = (slWtMap[wt] ?? 0) + 1
  }
  const slotWorkTypeDist = Object.entries(slWtMap)
    .map(([key, value]) => ({ name: WORK_TYPE_LABELS[key] ?? key, value }))
    .sort((a, b) => b.value - a.value)

  // metro distribution for bulletins
  const metroMap: Record<string, number> = {}
  for (const b of bl) {
    const m = (b as any).metro
    if (m) metroMap[m] = (metroMap[m] ?? 0) + 1
  }
  const metroTop = Object.entries(metroMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // metro distribution for worker slots
  const slMetroMap: Record<string, number> = {}
  for (const s of sl) {
    const m = (s as any).metro
    if (m) slMetroMap[m] = (slMetroMap[m] ?? 0) + 1
  }
  const slotMetroTop = Object.entries(slMetroMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // hour distribution (time_start → hour)
  const hourMap: Record<number, number> = {}
  for (const b of bl) {
    const ts: string = (b as any).time_start ?? ''
    const hour = ts ? parseInt(ts.slice(0, 2), 10) : -1
    if (hour >= 0 && hour <= 23) hourMap[hour] = (hourMap[hour] ?? 0) + 1
  }
  const hourDist = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    value: hourMap[h] ?? 0,
  })).filter(x => x.value > 0)

  // day of week distribution
  const DAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const dowMap: Record<number, number> = {}
  for (const b of bl) {
    const d: string = (b as any).date ?? ''
    if (d) {
      const dow = new Date(d).getDay()
      dowMap[dow] = (dowMap[dow] ?? 0) + 1
    }
  }
  const weekdayDist = [1, 2, 3, 4, 5, 6, 0].map(d => ({
    name: DAYS_RU[d],
    value: dowMap[d] ?? 0,
  }))

  // funnel: views → responses → (unique responders)
  const uniqueResponders = new Set(ch.map((c: any) => c.worker_slot_id)).size
  const funnelData = [
    { name: 'Просмотров', value: totalViews },
    { name: 'Откликов', value: ch.length },
    { name: 'Уникальных', value: uniqueResponders },
  ]

  // top employers (with views and slots)
  const empSlotMap: Record<string, number> = {}
  for (const s of sl) {
    const wid = (s as any).worker_id
    if (wid) empSlotMap[wid] = (empSlotMap[wid] ?? 0) + 1
  }
  const empMap: Record<string, { name: string; bulletins: number; responses: number; views: number }> = {}
  for (const b of bl) {
    const eid = (b as any).employer_id
    const company = (b as any).company ?? 'Unknown'
    if (!empMap[eid]) empMap[eid] = { name: company, bulletins: 0, responses: 0, views: 0 }
    empMap[eid].bulletins++
    empMap[eid].views += (b as any).views ?? 0
    empMap[eid].responses += respByBulletin[(b as any).id] ?? 0
  }
  const topEmployers = Object.values(empMap)
    .sort((a, b) => b.bulletins - a.bulletins)
    .slice(0, 10)

  // weekly comparison: this week vs last week
  const w14 = subDays(now, 14).toISOString()
  const blThisWeek = bl.filter((x: any) => x.created_at > w7).length
  const blLastWeek = bl.filter((x: any) => x.created_at > w14 && x.created_at <= w7).length
  const chThisWeek = ch.filter((x: any) => x.created_at > w7).length
  const chLastWeek = ch.filter((x: any) => x.created_at > w14 && x.created_at <= w7).length
  const slThisWeek = sl.filter((x: any) => x.created_at > w7).length
  const slLastWeek = sl.filter((x: any) => x.created_at > w14 && x.created_at <= w7).length
  const weekComparison = [
    { name: 'Объявления', thisWeek: blThisWeek, lastWeek: blLastWeek },
    { name: 'Отклики', thisWeek: chThisWeek, lastWeek: chLastWeek },
    { name: 'Слоты', thisWeek: slThisWeek, lastWeek: slLastWeek },
  ]

  // bulletin cards with response counts
  const bulletinCards = bl
    .map((b: any) => ({
      id: b.id,
      company: b.company ?? '',
      workType: WORK_TYPE_LABELS[b.work_type] ?? b.work_type ?? '',
      date: b.date ?? '',
      timeStart: b.time_start ?? '',
      timeEnd: b.time_end ?? '',
      metro: b.metro ?? '',
      status: b.status,
      views: b.views ?? 0,
      responses: respByBulletin[b.id] ?? 0,
      createdAt: b.created_at ? format(parseISO(b.created_at), 'dd.MM.yy') : '',
    }))
    .sort((a: any, b: any) => b.responses - a.responses)

  return {
    kpi: {
      totalBulletins: bl.length,
      openBulletins: openBulletins.length,
      closedBulletins: closedBulletins.length,
      totalSlots: sl.length,
      openSlots: openSlots.length,
      closedSlots: closedSlots.length,
      totalChats: ch.length,
      totalViews,
      avgViews,
      avgResponses,
      conversionPct,
      zeroResponseBulletins,
      zeroResponsePct,
      newBulletinsMonth,
      newChatsMonth,
      newSlotsMonth,
      bulletinsTrend: trend(newBulletinsMonth, prevBulletinsMonth),
      chatsTrend: trend(newChatsMonth, prevChatsMonth),
      slotsTrend: trend(newSlotsMonth, prevSlotsMonth),
    },
    daily30,
    workTypeDist,
    slotWorkTypeDist,
    metroTop,
    slotMetroTop,
    hourDist,
    weekdayDist,
    funnelData,
    weekComparison,
    topEmployers,
    bulletinCards,
  }
}

// ─── executive summary (Сводка для презентаций) ──────────────────────────────

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export async function fetchExecutiveSummary() {
  const [
    { data: users }, { data: tv }, { data: pv }, { data: likes },
    { data: apps }, { data: chats }, { data: messages }, { data: ratings },
    { data: websubs },
  ] = await Promise.all([
    supabase.from('jm_users').select('id,role,created_at,push_token,telegram_id'),
    supabase.from('jm_vacancies').select('id,employer_id,status,created_at,workers_needed,workers_found'),
    supabase.from('jm_perm_vacancies').select('id,employer_id,status,created_at'),
    supabase.from('jm_likes').select('id,vacancy_id,worker_id,worker_liked,is_match,shift_completed,created_at'),
    supabase.from('jm_perm_applications').select('id,vacancy_id,worker_id,created_at'),
    supabase.from('jm_chats').select('id,created_at'),
    supabase.from('jm_messages').select('id,chat_id,sender_id,created_at'),
    supabase.from('jm_ratings').select('id,rating'),
    supabaseAdmin.from('jm_web_push_subscriptions').select('user_id'),
  ])

  const u = users ?? []
  const t = tv ?? []
  const p = pv ?? []
  const lk = (likes ?? []) as any[]
  const ap = (apps ?? []) as any[]
  const ch = chats ?? []
  const ms = (messages ?? []) as any[]
  const rt = (ratings ?? []) as any[]
  const ws = (websubs ?? []) as any[]

  const now = Date.now()
  const d7 = new Date(now - 7 * 864e5).toISOString()
  const d30 = new Date(now - 30 * 864e5).toISOString()
  const d60 = new Date(now - 60 * 864e5).toISOString()

  const workers = u.filter((x: any) => x.role === 'worker')
  const employers = u.filter((x: any) => x.role === 'employer')
  const realLikes = lk.filter(x => x.worker_liked)

  // ── Рост ──
  const newUsers30 = u.filter((x: any) => x.created_at > d30).length
  const prevUsers30 = u.filter((x: any) => x.created_at > d60 && x.created_at <= d30).length
  const userGrowthMoM = prevUsers30 > 0 ? Math.round(((newUsers30 - prevUsers30) / prevUsers30) * 100) : 100

  // ── Активные (MAU/WAU): любой, кто совершил действие ──
  function actorsSince(since: string): Set<string> {
    const s = new Set<string>()
    for (const x of realLikes) if (x.created_at > since && x.worker_id) s.add(x.worker_id)
    for (const x of ap) if (x.created_at > since && x.worker_id) s.add(x.worker_id)
    for (const x of ms) if (x.created_at > since && x.sender_id) s.add(x.sender_id)
    for (const x of t as any[]) if (x.created_at > since && x.employer_id) s.add(x.employer_id)
    for (const x of p as any[]) if (x.created_at > since && x.employer_id) s.add(x.employer_id)
    return s
  }
  const mau = actorsSince(d30).size
  const wau = actorsSince(d7).size

  // ── Предложение ──
  const shifts30 = (t as any[]).filter(x => x.created_at > d30).length
  const perm30 = (p as any[]).filter(x => x.created_at > d30).length
  const activeDirectors30 = new Set([
    ...(t as any[]).filter(x => x.created_at > d30).map(x => x.employer_id),
    ...(p as any[]).filter(x => x.created_at > d30).map(x => x.employer_id),
  ].filter(Boolean)).size

  // ── Ликвидность ──
  const respByVac: Record<string, number> = {}
  for (const x of realLikes) if (x.vacancy_id) respByVac[x.vacancy_id] = (respByVac[x.vacancy_id] ?? 0) + 1
  const appsByVac: Record<string, number> = {}
  for (const x of ap) if (x.vacancy_id) appsByVac[x.vacancy_id] = (appsByVac[x.vacancy_id] ?? 0) + 1

  const shiftsWithResponse = (t as any[]).filter(x => respByVac[x.id]).length
  const permWithResponse = (p as any[]).filter(x => appsByVac[x.id]).length
  const supplyWithResponsePct = (t.length + p.length) > 0
    ? Math.round(((shiftsWithResponse + permWithResponse) / (t.length + p.length)) * 100) : 0

  const closedShifts = (t as any[]).filter(x => x.status === 'closed')
  const needed = closedShifts.reduce((s, x) => s + (x.workers_needed ?? 0), 0)
  const found = closedShifts.reduce((s, x) => s + (x.workers_found ?? 0), 0)
  const fillRatePct = needed > 0 ? Math.round((found / needed) * 100) : 0

  // Медиана времени до первого отклика (часы)
  const vacCreated: Record<string, string> = {}
  for (const x of t as any[]) vacCreated[x.id] = x.created_at
  for (const x of p as any[]) vacCreated[x.id] = x.created_at
  const firstResp: Record<string, string> = {}
  for (const x of [...realLikes, ...ap]) {
    if (!x.vacancy_id || !vacCreated[x.vacancy_id]) continue
    if (!firstResp[x.vacancy_id] || x.created_at < firstResp[x.vacancy_id]) firstResp[x.vacancy_id] = x.created_at
  }
  const respHours = Object.keys(firstResp).map(id =>
    (new Date(firstResp[id]).getTime() - new Date(vacCreated[id]).getTime()) / 3600e3
  ).filter(h => h >= 0)
  const medianResponseH = Math.round(median(respHours) * 10) / 10
  const respWithin24hPct = respHours.length > 0
    ? Math.round((respHours.filter(h => h <= 24).length / respHours.length) * 100) : 0

  // ── Возвращаемость ──
  const respCountByWorker: Record<string, number> = {}
  for (const x of [...realLikes, ...ap]) if (x.worker_id) respCountByWorker[x.worker_id] = (respCountByWorker[x.worker_id] ?? 0) + 1
  const workersActed = Object.keys(respCountByWorker).length
  const repeatWorkersPct = workersActed > 0
    ? Math.round((Object.values(respCountByWorker).filter(n => n >= 2).length / workersActed) * 100) : 0

  const postsByDirector: Record<string, number> = {}
  for (const x of [...(t as any[]), ...(p as any[])]) if (x.employer_id) postsByDirector[x.employer_id] = (postsByDirector[x.employer_id] ?? 0) + 1
  const directorsActed = Object.keys(postsByDirector).length
  const repeatDirectorsPct = directorsActed > 0
    ? Math.round((Object.values(postsByDirector).filter(n => n >= 2).length / directorsActed) * 100) : 0

  // ── Вовлечённость и охват ──
  const matches = lk.filter(x => x.is_match).length
  const avgMsgsPerChat = ch.length > 0 ? Math.round((ms.length / ch.length) * 10) / 10 : 0
  const avgRating = rt.length > 0 ? Math.round((rt.reduce((s, x) => s + (x.rating ?? 0), 0) / rt.length) * 10) / 10 : 0
  const webSubIds = new Set(ws.map(x => x.user_id))
  const reachable = u.filter((x: any) => x.push_token || x.telegram_id || webSubIds.has(x.id)).length
  const reachPct = u.length > 0 ? Math.round((reachable / u.length) * 100) : 0
  const tgLinked = u.filter((x: any) => x.telegram_id).length
  const tgLinkedWorkers = workers.filter((x: any) => x.telegram_id).length

  // ── Графики ──
  // Кумулятивный рост пользователей, 90 дней
  const days90 = dayRange(90)
  const byDay = groupByDate(u, 'created_at')
  const before = u.filter((x: any) => (x.created_at ?? '').slice(0, 10) < days90[0]).length
  let running = before
  const cumulativeUsers = days90.map(d => {
    running += byDay[d] ?? 0
    return { date: toDayLabel(d), users: running }
  })

  // Недельная динамика, 12 недель: пользователи / предложение / отклики
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const end = now - (11 - i) * 7 * 864e5
    const start = end - 7 * 864e5
    const inWeek = (iso?: string) => {
      if (!iso) return false
      const ts = new Date(iso).getTime()
      return ts > start && ts <= end
    }
    return {
      week: format(new Date(start), 'dd.MM'),
      users: u.filter((x: any) => inWeek(x.created_at)).length,
      supply: (t as any[]).filter(x => inWeek(x.created_at)).length + (p as any[]).filter(x => inWeek(x.created_at)).length,
      responses: realLikes.filter(x => inWeek(x.created_at)).length + ap.filter(x => inWeek(x.created_at)).length,
    }
  })

  return {
    kpi: {
      totalUsers: u.length, workers: workers.length, employers: employers.length,
      newUsers30, userGrowthMoM, mau, wau,
      totalResponses: realLikes.length + ap.length,
      responses30: realLikes.filter(x => x.created_at > d30).length + ap.filter(x => x.created_at > d30).length,
      shifts30, perm30, activeDirectors30,
      supplyWithResponsePct, fillRatePct, medianResponseH, respWithin24hPct,
      repeatWorkersPct, repeatDirectorsPct,
      matches, completed: lk.filter(x => x.shift_completed).length,
      chats: ch.length, avgMsgsPerChat, avgRating, ratingsCount: rt.length, reachPct,
      tgLinked, tgLinkedWorkers,
    },
    cumulativeUsers,
    weekly,
  }
}
