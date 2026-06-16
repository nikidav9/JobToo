import { supabase } from './supabase'

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
