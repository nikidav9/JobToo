import { supabase } from './supabase'
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
  const { data: users } = await supabase
    .from('jm_users')
    .select('id,role,first_name,last_name,phone,metro_station,metro_line_id,is_blocked,created_at,company')
    .order('created_at', { ascending: false })

  const u = users ?? []
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

  const recent = u.slice(0, 20).map((x: any) => ({
    name: `${x.first_name ?? ''} ${x.last_name ?? ''}`.trim(),
    phone: x.phone,
    role: x.role,
    metro: x.metro_station ?? '—',
    company: x.company ?? '—',
    blocked: x.is_blocked,
    date: x.created_at?.slice(0, 10),
  }))

  return {
    kpi: {
      total: u.length,
      workers: workers.length,
      employers: employers.length,
      blocked: u.filter((x: any) => x.is_blocked).length,
      newWeek: u.filter((x: any) => x.created_at > w7).length,
      newMonth: u.filter((x: any) => x.created_at > w30).length,
      workerPct: u.length > 0 ? ((workers.length / u.length) * 100).toFixed(0) : '0',
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

export async function fetchVacancies() {
  const [{ data: tv }, { data: pv }] = await Promise.all([
    supabase.from('jm_vacancies').select('id,status,work_type,work_type_label,created_at,employer_id,salary,workers_needed,workers_found,is_urgent,no_experience_needed,company'),
    supabase.from('jm_perm_vacancies').select('id,status,created_at,employer_id,salary,company,metro_station'),
  ])

  const t = tv ?? []
  const p = pv ?? []

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

  // work type
  const wtMap: Record<string, number> = {}
  for (const v of t) {
    const wt = (v as any).work_type ?? 'other'
    wtMap[wt] = (wtMap[wt] ?? 0) + 1
  }
  const workTypeDist = Object.entries(wtMap)
    .map(([k, v]) => ({ name: WORK_TYPE_LABELS[k] ?? k, temp: v, value: v }))
    .sort((a, b) => b.value - a.value)

  // employer leaderboard
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

  // salary buckets (perm)
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

  const matches = lk.filter((x: any) => x.is_match)
  const confirmed = lk.filter((x: any) => x.worker_confirmed && x.employer_confirmed)
  const completed = lk.filter((x: any) => x.shift_completed)

  const days30 = dayRange(30)
  const matchByDay = groupByDate(
    matches.map((x: any) => ({ created_at: x.matched_at ?? x.created_at })),
    'created_at'
  )
  const likeByDay = groupByDate(lk, 'created_at')

  const daily30 = days30.map(d => ({
    date: toDayLabel(d),
    likes: likeByDay[d] ?? 0,
    matches: matchByDay[d] ?? 0,
  }))

  // match rate by work type
  const wtLikes: Record<string, number> = {}
  const wtMatches: Record<string, number> = {}
  for (const l of lk) {
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
    { name: 'Просмотрено', value: lk.length, fill: PALETTE.blue },
    { name: 'Лайки рабочих', value: lk.filter((x: any) => x.worker_liked).length, fill: PALETTE.cyan },
    { name: 'Совпадения', value: matches.length, fill: PALETTE.purple },
    { name: 'Подтверждено', value: confirmed.length, fill: PALETTE.orange },
    { name: 'Завершено', value: completed.length, fill: PALETTE.green },
  ]

  return {
    kpi: {
      totalLikes: lk.length,
      totalMatches: matches.length,
      matchRate: lk.length > 0 ? ((matches.length / lk.length) * 100).toFixed(1) : '0',
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

  // msgs per chat distribution
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

  // rating distribution
  const rMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of rt) rMap[Math.round(Number((r as any).rating))]++
  const ratingDist = [1, 2, 3, 4, 5].map(v => ({
    name: '★'.repeat(v),
    value: rMap[v] ?? 0,
    workers: workerRatings.filter((r: any) => Math.round(Number(r.rating)) === v).length,
    employers: employerRatings.filter((r: any) => Math.round(Number(r.rating)) === v).length,
  }))

  // rating over time (30d)
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

  // complaints
  const workerComplaints = cp.filter((x: any) => x.complaint_type === 'worker')
  const employerComplaints = cp.filter((x: any) => x.complaint_type === 'employer')

  const cpByDay = groupByDate(cp, 'created_at')
  const complaintTrend = days30.map(d => ({
    date: toDayLabel(d),
    count: cpByDay[d] ?? 0,
  }))

  // applications
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

// ─── chats ───────────────────────────────────────────────────────────────────

export async function fetchChats() {
  const [{ data: chats }, { data: messages }, { data: users }] = await Promise.all([
    supabase
      .from('jm_chats')
      .select('id,worker_id,employer_id,vac_title,company_name,unread_worker,unread_employer,created_at')
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

    return {
      id: c.id,
      vacTitle: c.vac_title ?? 'Вакансия',
      companyName: c.company_name || (employer?.company ?? ''),
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
