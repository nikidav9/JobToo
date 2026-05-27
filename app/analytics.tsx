import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { getSupabaseClient } from '@/template';
import { useApp } from '@/hooks/useApp';

const ADMIN_PHONE = '89933431523';
const sb = () => getSupabaseClient();

const WORK_TYPE_LABELS: Record<string, string> = {
  stocker: 'Кладовщик',
  cook: 'Повар',
  shift_supervisor: 'Менеджер',
  picker: 'Комплектовщик',
};

const CHART_COLORS = [
  '#FF6B1A', '#2563EB', '#16A34A', '#7C3AED',
  '#D97706', '#DC2626', '#0891B2', '#059669',
];

// ─── helpers ────────────────────────────────────────────────────────────────

function last30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function toDateKey(iso: string) {
  return iso.slice(0, 10);
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function monthLabel(dateKey: string): string {
  const [, , dd] = dateKey.split('-');
  return dd;
}

// ─── custom chart helpers ───────────────────────────────────────────────────

function everyNth<T>(arr: T[], n: number): T[] {
  return arr.filter((_, i) => i % n === 0 || i === arr.length - 1);
}

// ─── interfaces ──────────────────────────────────────────────────────────────

interface DayCount {
  date: string;
  count: number;
}

interface KV {
  key: string;
  count: number;
}

interface AnalyticsData {
  totalWorkers: number;
  totalEmployers: number;
  newUsersWeek: number;
  totalTempVac: number;
  totalPermVac: number;
  openTempVac: number;
  openPermVac: number;
  totalMatches: number;
  newMatchesWeek: number;
  totalChats: number;
  totalRatings: number;
  avgRating: number;
  totalComplaints: number;
  totalApplications: number;
  userGrowthDays: DayCount[];
  workerGrowthDays: DayCount[];
  employerGrowthDays: DayCount[];
  vacGrowthDays: DayCount[];
  matchGrowthDays: DayCount[];
  workTypeDist: KV[];
  metroTop: KV[];
  ratingDist: KV[];
  appStatusDist: KV[];
}

// ─── data fetching ───────────────────────────────────────────────────────────

async function fetchAnalytics(): Promise<AnalyticsData> {
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff30Iso = cutoff30.toISOString();

  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);
  const cutoff7Iso = cutoff7.toISOString();

  const [
    { data: users },
    { data: tempVacs },
    { data: permVacs },
    { data: likes },
    { data: chats },
    { data: ratings },
    { data: complaints },
    { data: applications },
    { data: recentUsers },
    { data: recentTempVacs },
    { data: recentMatches },
  ] = await Promise.all([
    sb().from('jm_users').select('id,role,created_at'),
    sb().from('jm_vacancies').select('id,status,work_type,created_at'),
    sb().from('jm_perm_vacancies').select('id,status,created_at'),
    sb().from('jm_likes').select('id,is_match,matched_at'),
    sb().from('jm_chats').select('id'),
    sb().from('jm_ratings').select('id,rating'),
    sb().from('jm_complaints').select('id'),
    sb().from('jm_perm_applications').select('id,status'),
    sb().from('jm_users').select('role,created_at').gte('created_at', cutoff30Iso),
    sb().from('jm_vacancies').select('created_at').gte('created_at', cutoff30Iso),
    sb()
      .from('jm_likes')
      .select('matched_at')
      .eq('is_match', true)
      .not('matched_at', 'is', null)
      .gte('matched_at', cutoff30Iso),
  ]);

  const allUsers = users ?? [];
  const allTempVacs = tempVacs ?? [];
  const allPermVacs = permVacs ?? [];
  const allLikes = likes ?? [];
  const allRatings = ratings ?? [];

  const workers = allUsers.filter((u: any) => u.role === 'worker');
  const employers = allUsers.filter((u: any) => u.role === 'employer');

  const newUsersWeek = allUsers.filter(
    (u: any) => new Date(u.created_at) >= new Date(cutoff7Iso)
  ).length;

  const matches = allLikes.filter((l: any) => l.is_match);
  const newMatchesWeek = matches.filter(
    (l: any) => l.matched_at && new Date(l.matched_at) >= new Date(cutoff7Iso)
  ).length;

  const avgRating =
    allRatings.length > 0
      ? allRatings.reduce((s: number, r: any) => s + Number(r.rating), 0) / allRatings.length
      : 0;

  // 30-day growth arrays
  const days = last30Days();

  function buildDayCounts(items: any[], dateField: string): DayCount[] {
    const map: Record<string, number> = {};
    for (const item of items) {
      const key = toDateKey(item[dateField] ?? '');
      if (key) map[key] = (map[key] ?? 0) + 1;
    }
    return days.map(d => ({ date: d, count: map[d] ?? 0 }));
  }

  const recentUsersArr = recentUsers ?? [];
  const recentTempVacsArr = recentTempVacs ?? [];
  const recentMatchesArr = recentMatches ?? [];

  const userGrowthDays = buildDayCounts(recentUsersArr, 'created_at');
  const workerGrowthDays = buildDayCounts(
    recentUsersArr.filter((u: any) => u.role === 'worker'),
    'created_at'
  );
  const employerGrowthDays = buildDayCounts(
    recentUsersArr.filter((u: any) => u.role === 'employer'),
    'created_at'
  );
  const vacGrowthDays = buildDayCounts(recentTempVacsArr, 'created_at');
  const matchGrowthDays = buildDayCounts(recentMatchesArr, 'matched_at');

  // work type distribution
  const wtMap: Record<string, number> = {};
  for (const v of allTempVacs) {
    const wt = (v as any).work_type ?? 'other';
    wtMap[wt] = (wtMap[wt] ?? 0) + 1;
  }
  const workTypeDist: KV[] = Object.entries(wtMap)
    .map(([key, count]) => ({ key: WORK_TYPE_LABELS[key] ?? key, count }))
    .sort((a, b) => b.count - a.count);

  // metro top (from users — need separate query)
  const { data: metroUsers } = await sb()
    .from('jm_users')
    .select('metro_station')
    .not('metro_station', 'is', null);

  const metroMap: Record<string, number> = {};
  for (const u of metroUsers ?? []) {
    const s = (u as any).metro_station;
    if (s) metroMap[s] = (metroMap[s] ?? 0) + 1;
  }
  const metroTop: KV[] = Object.entries(metroMap)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // rating distribution
  const ratingMap: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const r of allRatings) {
    const v = String(Math.round(Number((r as any).rating)));
    if (ratingMap[v] !== undefined) ratingMap[v]++;
  }
  const ratingDist: KV[] = Object.entries(ratingMap).map(([key, count]) => ({
    key: '★'.repeat(Number(key)),
    count,
  }));

  // application status
  const appMap: Record<string, number> = {};
  for (const a of applications ?? []) {
    const s = (a as any).status ?? 'unknown';
    appMap[s] = (appMap[s] ?? 0) + 1;
  }
  const appStatusLabels: Record<string, string> = {
    pending: 'Ожидает',
    approved: 'Одобрено',
    rejected: 'Отклонено',
  };
  const appStatusDist: KV[] = Object.entries(appMap).map(([key, count]) => ({
    key: appStatusLabels[key] ?? key,
    count,
  }));

  return {
    totalWorkers: workers.length,
    totalEmployers: employers.length,
    newUsersWeek,
    totalTempVac: allTempVacs.length,
    totalPermVac: allPermVacs.length,
    openTempVac: allTempVacs.filter((v: any) => v.status === 'open').length,
    openPermVac: allPermVacs.filter((v: any) => v.status === 'open').length,
    totalMatches: matches.length,
    newMatchesWeek,
    totalChats: (chats ?? []).length,
    totalRatings: allRatings.length,
    avgRating,
    totalComplaints: (complaints ?? []).length,
    totalApplications: (applications ?? []).length,
    userGrowthDays,
    workerGrowthDays,
    employerGrowthDays,
    vacGrowthDays,
    matchGrowthDays,
    workTypeDist,
    metroTop,
    ratingDist,
    appStatusDist,
  };
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color = Colors.primary,
  wide = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  wide?: boolean;
}) {
  return (
    <View style={[s.kpiCard, wide && s.kpiWide, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Text style={[s.kpiValue, { color }]}>{fmtNum(Number(value))}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionTitle({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionIcon}>{icon}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function ChartCard({
  title,
  children,
  half = false,
}: {
  title: string;
  children: React.ReactNode;
  half?: boolean;
}) {
  return (
    <View style={[s.chartCard, half && s.chartHalf]}>
      <Text style={s.chartTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MiniBarChart({ data, labels, color }: { data: number[]; labels: string[]; color: string }) {
  const max = Math.max(...data, 1);
  return (
    <View style={s.miniBarWrap}>
      {data.map((v, i) => (
        <View key={i} style={s.miniBarCol}>
          <View
            style={[
              s.miniBarFill,
              {
                height: Math.max(4, (v / max) * 80),
                backgroundColor: color,
                opacity: v === 0 ? 0.2 : 1,
              },
            ]}
          />
          <Text style={s.miniBarLabel}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  );
}

function HorizBarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <View style={s.horizRow}>
      <Text style={s.horizLabel} numberOfLines={1}>{label}</Text>
      <View style={s.horizTrack}>
        <View style={[s.horizFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={s.horizCount}>{value}</Text>
    </View>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

const CHART_CFG = {
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 107, 26, ${opacity})`,
  labelColor: () => Colors.textSecondary,
  propsForDots: { r: '3', strokeWidth: '1', stroke: Colors.primary },
  propsForBackgroundLines: { stroke: Colors.divider },
};

const W = Math.min(Dimensions.get('window').width, 1100);
const CARD_W = (W - 48 - 12) / 2; // two-column chart width

export default function AnalyticsScreen() {
  const router = useRouter();
  const { currentUser } = useApp();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const isAdmin = currentUser?.phone === ADMIN_PHONE;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await fetchAnalytics();
      setData(d);
      setLastUpdated(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.backTxt}>← Назад</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Аналитика</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.center}>
          <Text style={{ fontSize: 48 }}>🔒</Text>
          <Text style={s.accessDenied}>Доступ запрещён</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !data) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.backTxt}>← Назад</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Аналитика</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingTxt}>Загружаем данные…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── chart datasets ──────────────────────────────────────────────────────

  const days30 = data.userGrowthDays.map(d => d.date);
  // show every 5th label to avoid crowding
  const dayLabels = days30.map((d, i) => (i % 5 === 0 || i === 29 ? monthLabel(d) : ''));

  const userLineData = {
    labels: dayLabels,
    datasets: [
      {
        data: data.workerGrowthDays.map(d => d.count),
        color: (op = 1) => `rgba(255,107,26,${op})`,
        strokeWidth: 2,
      },
      {
        data: data.employerGrowthDays.map(d => d.count),
        color: (op = 1) => `rgba(37,99,235,${op})`,
        strokeWidth: 2,
      },
    ],
    legend: ['Работники', 'Работодатели'],
  };

  const vacLineData = {
    labels: dayLabels,
    datasets: [
      {
        data: data.vacGrowthDays.map(d => d.count),
        color: (op = 1) => `rgba(22,163,74,${op})`,
        strokeWidth: 2,
      },
    ],
    legend: ['Вакансии'],
  };

  const matchLineData = {
    labels: dayLabels,
    datasets: [
      {
        data: data.matchGrowthDays.map(d => d.count),
        color: (op = 1) => `rgba(124,58,237,${op})`,
        strokeWidth: 2,
      },
    ],
    legend: ['Совпадения'],
  };

  const workTypePieData = data.workTypeDist.slice(0, 4).map((d, i) => ({
    name: d.key,
    population: d.count || 0,
    color: CHART_COLORS[i],
    legendFontColor: Colors.textSecondary,
    legendFontSize: 12,
  }));

  const metroMax = data.metroTop[0]?.count ?? 1;
  const ratingMax = Math.max(...data.ratingDist.map(d => d.count), 1);

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      {/* header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.backTxt}>← Назад</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>📊 Аналитика</Text>
          {lastUpdated ? (
            <Text style={s.headerSub}>обновлено в {lastUpdated}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={() => load()}>
          <Text style={s.refreshTxt}>↺ Обновить</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── KPI: пользователи ── */}
        <SectionTitle title="Пользователи" icon="👥" />
        <View style={s.kpiRow}>
          <KpiCard
            label="Всего пользователей"
            value={data.totalWorkers + data.totalEmployers}
            sub={`+${data.newUsersWeek} за 7 дней`}
            color={Colors.primary}
          />
          <KpiCard label="Работники" value={data.totalWorkers} color={Colors.primary} />
          <KpiCard label="Работодатели" value={data.totalEmployers} color={Colors.blue} />
          <KpiCard label="Жалоб" value={data.totalComplaints} color={Colors.red} />
        </View>

        {/* ── KPI: вакансии и матчи ── */}
        <SectionTitle title="Вакансии и подборки" icon="💼" />
        <View style={s.kpiRow}>
          <KpiCard
            label="Врем. вакансий"
            value={data.totalTempVac}
            sub={`${data.openTempVac} открыто`}
            color={Colors.green}
          />
          <KpiCard
            label="Пост. вакансий"
            value={data.totalPermVac}
            sub={`${data.openPermVac} открыто`}
            color={Colors.green}
          />
          <KpiCard
            label="Совпадений"
            value={data.totalMatches}
            sub={`+${data.newMatchesWeek} за 7 дней`}
            color={Colors.purple}
          />
          <KpiCard label="Чатов" value={data.totalChats} color={Colors.blue} />
        </View>

        {/* ── KPI: рейтинги и заявки ── */}
        <View style={s.kpiRow}>
          <KpiCard label="Оценок" value={data.totalRatings} color={Colors.primary} />
          <KpiCard
            label="Средний рейтинг"
            value={data.avgRating.toFixed(2)}
            color={data.avgRating >= 4 ? Colors.green : Colors.primary}
          />
          <KpiCard label="Заявок на пост." value={data.totalApplications} color={Colors.blue} />
          <View style={[s.kpiCard, { opacity: 0 }]} />
        </View>

        {/* ── рост пользователей ── */}
        <SectionTitle title="Рост пользователей (30 дней)" icon="📈" />
        <View style={s.chartsRow}>
          <ChartCard title="Новые пользователи по дням" half>
            <LineChart
              data={userLineData}
              width={CARD_W - 32}
              height={180}
              chartConfig={{
                ...CHART_CFG,
                color: (op = 1) => `rgba(255,107,26,${op})`,
              }}
              bezier
              withDots={false}
              withInnerLines
              withOuterLines={false}
              style={{ borderRadius: Radius.sm }}
            />
          </ChartCard>

          <ChartCard title="Новые вакансии по дням" half>
            <LineChart
              data={vacLineData}
              width={CARD_W - 32}
              height={180}
              chartConfig={{
                ...CHART_CFG,
                color: (op = 1) => `rgba(22,163,74,${op})`,
              }}
              bezier
              withDots={false}
              withInnerLines
              withOuterLines={false}
              style={{ borderRadius: Radius.sm }}
            />
          </ChartCard>
        </View>

        {/* ── совпадения ── */}
        <SectionTitle title="Активность совпадений (30 дней)" icon="🤝" />
        <View style={s.chartsRow}>
          <ChartCard title="Совпадения по дням" half>
            <LineChart
              data={matchLineData}
              width={CARD_W - 32}
              height={180}
              chartConfig={{
                ...CHART_CFG,
                color: (op = 1) => `rgba(124,58,237,${op})`,
              }}
              bezier
              withDots={false}
              withInnerLines
              withOuterLines={false}
              style={{ borderRadius: Radius.sm }}
            />
          </ChartCard>

          {/* Типы работ */}
          <ChartCard title="Распределение по типам работ" half>
            {workTypePieData.length > 0 ? (
              <PieChart
                data={workTypePieData}
                width={CARD_W - 32}
                height={180}
                chartConfig={CHART_CFG}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="8"
                hasLegend
              />
            ) : (
              <View style={s.emptyChart}>
                <Text style={s.emptyChartTxt}>Нет данных</Text>
              </View>
            )}
          </ChartCard>
        </View>

        {/* ── топ метро ── */}
        <SectionTitle title="Топ станций метро" icon="🚇" />
        <View style={s.fullCard}>
          {data.metroTop.length > 0 ? (
            data.metroTop.map((m, i) => (
              <HorizBarRow
                key={m.key}
                label={m.key}
                value={m.count}
                max={metroMax}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))
          ) : (
            <Text style={s.emptyChartTxt}>Нет данных о метро</Text>
          )}
        </View>

        {/* ── рейтинги + заявки ── */}
        <SectionTitle title="Оценки и заявки" icon="⭐" />
        <View style={s.chartsRow}>
          <ChartCard title="Распределение оценок" half>
            {data.ratingDist.some(d => d.count > 0) ? (
              <>
                {data.ratingDist.map((r, i) => (
                  <HorizBarRow
                    key={r.key}
                    label={r.key}
                    value={r.count}
                    max={ratingMax}
                    color={Colors.primary}
                  />
                ))}
              </>
            ) : (
              <View style={s.emptyChart}>
                <Text style={s.emptyChartTxt}>Нет оценок</Text>
              </View>
            )}
          </ChartCard>

          <ChartCard title="Заявки на постоянные вакансии" half>
            {data.appStatusDist.length > 0 ? (
              <>
                {data.appStatusDist.map((a, i) => (
                  <HorizBarRow
                    key={a.key}
                    label={a.key}
                    value={a.count}
                    max={Math.max(...data.appStatusDist.map(d => d.count), 1)}
                    color={CHART_COLORS[i + 2]}
                  />
                ))}
              </>
            ) : (
              <View style={s.emptyChart}>
                <Text style={s.emptyChartTxt}>Нет заявок</Text>
              </View>
            )}
          </ChartCard>
        </View>

        {/* ── mini bar: last 30 days matches ── */}
        <SectionTitle title="Динамика совпадений (бар)" icon="📊" />
        <View style={s.fullCard}>
          <MiniBarChart
            data={data.matchGrowthDays.map(d => d.count)}
            labels={data.matchGrowthDays.map((d, i) => (i % 5 === 0 ? monthLabel(d.date) : ''))}
            color={Colors.purple}
          />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.outerBg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 1100, alignSelf: 'center', width: '100%' },

  // header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    ...Shadow.card,
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  backTxt: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  refreshBtn: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  refreshTxt: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  // states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  accessDenied: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  loadingTxt: { fontSize: 14, color: Colors.textSecondary, marginTop: 8 },

  // sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },

  // kpi cards
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 14,
    ...Shadow.card,
  },
  kpiWide: { minWidth: 200 },
  kpiValue: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  kpiLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, fontWeight: '500' },
  kpiSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // chart cards
  chartsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  chartCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 16,
    ...Shadow.card,
    flex: 1,
    minWidth: 280,
  },
  chartHalf: { flex: 1 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },

  fullCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 16,
    ...Shadow.card,
    marginBottom: 4,
  },

  // empty
  emptyChart: { height: 120, alignItems: 'center', justifyContent: 'center' },
  emptyChartTxt: { color: Colors.textMuted, fontSize: 13 },

  // horiz bar
  horizRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  horizLabel: { width: 100, fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  horizTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.divider,
    borderRadius: 4,
    overflow: 'hidden',
  },
  horizFill: { height: 8, borderRadius: 4 },
  horizCount: { width: 32, fontSize: 12, color: Colors.textPrimary, fontWeight: '600', textAlign: 'right' },

  // mini bar
  miniBarWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 3,
  },
  miniBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  miniBarFill: { width: '100%', borderRadius: 2, minHeight: 4 },
  miniBarLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 3 },
});
