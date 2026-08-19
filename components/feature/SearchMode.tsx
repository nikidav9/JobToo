import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, Linking, Platform,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { rs, rf } from '@/constants/scale';
import { useApp } from '@/hooks/useApp';
import { ExternalVacancy, PermVacancy, Vacancy } from '@/constants/types';
import { dbGetExternalVacancies, dbRecordExternalClick } from '@/services/db';
import { MetroMap, MapListItem } from '@/components/feature/MetroMap';
import { payShort } from '@/services/pay';
import { normalizeCompany } from '@/services/storage';

/**
 * «Поиск» — единое окно: наши смены, наша постоянная работа и вакансии из
 * чужих источников в одном списке.
 *
 * Зачем отдельно от ленты. Лента — это колода на выбранный день: карточку
 * смахивают вправо, и это отклик. Чужая вакансия так не умеет — откликнуться
 * на неё можно только у источника, — и подмешать её в колоду значит дать
 * человеку жест, за которым ничего нет. Постоянная работа в колоду тоже не
 * ложится: у неё нет даты.
 *
 * Поэтому здесь список, а не колода, и у каждой карточки честно написано,
 * откуда она. Надпись обязательна: агрегатор, который выдаёт чужие
 * объявления за свои, — это не агрегатор.
 */

type Origin = 'jobtoo' | 'external';
type Kind = 'shift' | 'permanent';
type KindFilter = 'all' | Kind;

type SearchItem = {
  key: string;
  origin: Origin;
  kind: Kind;
  title: string;
  company: string;
  station?: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** Готовая надпись об оплате, вместе с оговоркой про сдельную. */
  pay?: string;
  /** Сырое число — только для фильтра «от», сравнивать между видами нельзя. */
  salary: number;
  /** Дата и время смены либо график постоянной работы. */
  meta?: string;
  sourceName?: string;
  url?: string;
  extId?: string;
  sourceId?: string;
  vacancy?: Vacancy;
  perm?: PermVacancy;
};

// Пороги оплаты у смены и у постоянной работы несопоставимы: три тысячи за
// смену и три тысячи в месяц — разные вселенные. Поэтому свой набор на
// каждый вид, а в режиме «Все» фильтр по оплате не показываем вовсе: любой
// единый порог там врал бы про одну из половин.
const SHIFT_SALARY_CHIPS = [
  { label: 'Любая', value: 0 },
  { label: 'от 2 000', value: 2000 },
  { label: 'от 3 000', value: 3000 },
  { label: 'от 4 000', value: 4000 },
  { label: 'от 5 000', value: 5000 },
];
const PERM_SALARY_CHIPS = [
  { label: 'Любая', value: 0 },
  { label: 'от 30 000', value: 30000 },
  { label: 'от 50 000', value: 50000 },
  { label: 'от 80 000', value: 80000 },
  { label: 'от 100 000', value: 100000 },
];

function ruDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const мес = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${мес[d.getMonth()]}`;
}

/** Оплата у чужой вакансии: там своя единица, и молчать о ней нельзя. */
function extPay(v: ExternalVacancy): string | undefined {
  if (!v.salary || v.salary <= 0) return undefined;
  const n = v.salary.toLocaleString('ru-RU');
  const за =
    v.payPeriod === 'hour'  ? ' / час' :
    v.payPeriod === 'month' ? ' / мес' :
    v.payPeriod === 'shift' ? ' / смена' : '';
  return `${n} ₽${за}`;
}

export function SearchMode() {
  const router = useRouter();
  const {
    currentUser, vacancies, permVacancies, refreshVacancies, refreshPermVacancies,
    showToast,
  } = useApp();
  const tabBarHeight = useBottomTabBarHeight();

  const [external, setExternal] = useState<ExternalVacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [minSalary, setMinSalary] = useState(0);
  const [station, setStation] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  const loadExternal = useCallback(async () => {
    try {
      setExternal(await dbGetExternalVacancies());
    } catch {
      // Молчим: свои вакансии в списке останутся, а показывать ошибку
      // из-за чужого фида, к которому человек не имеет отношения, незачем.
    }
  }, []);

  useEffect(() => { loadExternal().finally(() => setLoading(false)); }, [loadExternal]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadExternal(),
      refreshVacancies?.().catch(() => {}),
      refreshPermVacancies?.().catch(() => {}),
    ]);
    setRefreshing(false);
  };

  // Смена филрта по виду сбрасывает порог оплаты: он задан в единицах
  // прежнего вида, и «от 50 000» в сменах не нашло бы ничего вообще.
  const changeKind = (k: KindFilter) => { setKind(k); setMinSalary(0); };

  const items: SearchItem[] = useMemo(() => {
    const out: SearchItem[] = [];

    for (const v of (vacancies ?? []) as Vacancy[]) {
      if (v.status !== 'open') continue;
      out.push({
        key: 'v:' + v.id,
        origin: 'jobtoo',
        kind: 'shift',
        title: v.title,
        company: normalizeCompany(v.company),
        station: v.metroStation,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        pay: payShort(v.salary, v.workType),
        salary: v.salary ?? 0,
        meta: [ruDate(v.date), v.timeStart && v.timeEnd ? `${v.timeStart}–${v.timeEnd}` : null]
          .filter(Boolean).join(', ') || undefined,
        vacancy: v,
      });
    }

    for (const p of (permVacancies ?? []) as PermVacancy[]) {
      if (p.status !== 'open') continue;
      out.push({
        key: 'p:' + p.id,
        origin: 'jobtoo',
        kind: 'permanent',
        title: p.title,
        company: normalizeCompany(p.company),
        station: p.metroStation,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        pay: p.salary > 0 ? `${p.salary.toLocaleString('ru-RU')} ₽ / мес` : undefined,
        salary: p.salary ?? 0,
        meta: p.schedule,
        perm: p,
      });
    }

    for (const e of external) {
      out.push({
        key: 'e:' + e.id,
        origin: 'external',
        kind: e.kind,
        title: e.title,
        company: e.company ? normalizeCompany(e.company) : (e.sourceName ?? 'Компания'),
        station: e.metroStation,
        address: e.address,
        lat: e.lat,
        lng: e.lng,
        pay: extPay(e),
        salary: e.salary ?? 0,
        meta: e.kind === 'shift'
          ? [ruDate(e.date), e.timeStart && e.timeEnd ? `${e.timeStart}–${e.timeEnd}` : null]
              .filter(Boolean).join(', ') || undefined
          : e.schedule,
        sourceName: e.sourceName,
        url: e.url,
        extId: e.id,
        sourceId: e.sourceId,
      });
    }

    return out;
  }, [vacancies, permVacancies, external]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i => {
      if (kind !== 'all' && i.kind !== kind) return false;
      if (station && i.station !== station) return false;
      if (minSalary > 0 && i.salary < minSalary) return false;
      if (q && !(i.title.toLowerCase().includes(q) || i.company.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, query, kind, station, minSalary]);

  const mapItems: MapListItem[] = useMemo(
    () => shown
      .filter(i => !!i.station || !!i.address)
      .map(i => ({
        id: i.key,
        station: i.station ?? '',
        title: i.title,
        company: i.company,
        pay: i.pay,
        meta: i.meta,
        address: i.address,
        lat: i.lat,
        lng: i.lng,
      })),
    [shown],
  );

  const openExternal = async (i: SearchItem) => {
    if (!i.url) return;
    if (i.extId && i.sourceId) {
      dbRecordExternalClick(i.extId, i.sourceId, currentUser?.id);
    }
    try {
      await Linking.openURL(i.url);
    } catch {
      showToast?.('Не удалось открыть вакансию', 'error');
    }
  };

  const open = (i: SearchItem) => {
    if (i.origin === 'external') { openExternal(i); return; }
    if (i.perm) {
      router.push({ pathname: '/perm-vacancy-detail', params: { vacancyId: i.perm.id } });
      return;
    }
    // Своя смена: откликаться на неё положено в ленте — там колода, история
    // и отмена последнего движения. Ведём туда, а не заводим второй способ
    // откликнуться, который пришлось бы поддерживать наравне с первым.
    showToast?.('Эта смена есть в ленте — откликнуться можно там', 'success');
  };

  const salaryChips = kind === 'shift' ? SHIFT_SALARY_CHIPS
    : kind === 'permanent' ? PERM_SALARY_CHIPS
    : null;

  const renderItem = ({ item }: { item: SearchItem }) => {
    const свой = item.origin === 'jobtoo';
    return (
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => open(item)}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={2}>{item.title}</Text>
            <Text style={s.company} numberOfLines={1}>{item.company}</Text>
          </View>
          <View style={[s.badge, свой ? s.badgeOwn : s.badgeExt]}>
            <Text style={[s.badgeTxt, свой ? s.badgeTxtOwn : s.badgeTxtExt]} numberOfLines={1}>
              {свой ? 'JobToo' : (item.sourceName ?? 'Партнёр')}
            </Text>
          </View>
        </View>

        <View style={s.rows}>
          {item.station ? (
            <View style={s.row}>
              <Ionicons name="subway-outline" size={rf(13)} color={Colors.textMuted} />
              <Text style={s.rowTxt} numberOfLines={1}>{item.station}</Text>
            </View>
          ) : null}
          {item.meta ? (
            <View style={s.row}>
              <Ionicons name={item.kind === 'shift' ? 'calendar-outline' : 'time-outline'}
                size={rf(13)} color={Colors.textMuted} />
              <Text style={s.rowTxt} numberOfLines={1}>{item.meta}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.cardBottom}>
          <Text style={s.pay}>{item.pay ?? 'Оплата не указана'}</Text>
          {свой ? (
            <View style={s.kindTag}>
              <Text style={s.kindTagTxt}>{item.kind === 'shift' ? 'Смена' : 'Работа'}</Text>
            </View>
          ) : (
            // «У источника», а не «Откликнуться»: отклик произойдёт на той
            // стороне, и обещать здесь кнопку отклика — обманывать.
            <View style={s.extBtn}>
              <Text style={s.extBtnTxt}>Открыть у источника</Text>
              <Ionicons name="open-outline" size={rf(13)} color={Colors.primary} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={rf(16)} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Профессия или компания"
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={rf(16)} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[s.mapBtn, station ? s.mapBtnActive : null]}
          onPress={() => (station ? setStation(null) : setMapOpen(true))}
          activeOpacity={0.8}
        >
          <Ionicons
            name={station ? 'close' : 'map-outline'}
            size={rf(16)}
            color={station ? '#FFFFFF' : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {station ? (
        <View style={s.stationRow}>
          <Ionicons name="subway-outline" size={rf(13)} color={Colors.primary} />
          <Text style={s.stationTxt}>{station}</Text>
        </View>
      ) : null}

      <FlatList
        data={shown}
        keyExtractor={i => i.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingBottom: tabBarHeight + rs(24) }}
        ListHeaderComponent={
          <View>
            <View style={s.chipRow}>
              {([['all', 'Все'], ['shift', 'Смены'], ['permanent', 'Работа']] as [KindFilter, string][])
                .map(([k, label]) => (
                  <TouchableOpacity
                    key={k}
                    style={[s.chip, kind === k && s.chipActive]}
                    onPress={() => changeKind(k)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipTxt, kind === k && s.chipTxtActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
            </View>

            {salaryChips ? (
              <View style={s.chipRow}>
                {salaryChips.map(c => (
                  <TouchableOpacity
                    key={c.value}
                    style={[s.chip, minSalary === c.value && s.chipActive]}
                    onPress={() => setMinSalary(c.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipTxt, minSalary === c.value && s.chipTxtActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={s.count}>
              {loading ? 'Ищем…' : `Найдено: ${shown.length}`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: rs(40) }} color={Colors.primary} />
          ) : (
            <View style={s.empty}>
              <Ionicons name="search-outline" size={rf(40)} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>Ничего не нашлось</Text>
              <Text style={s.emptySub}>Попробуйте убрать фильтры или поискать другими словами</Text>
            </View>
          )
        }
      />

      <MetroMap
        visible={mapOpen}
        title="Где искать"
        items={mapItems}
        onSelect={st => { setStation(st); setMapOpen(false); }}
        onClose={() => setMapOpen(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8),
    paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(6),
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(6),
    borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: rs(10),
    paddingHorizontal: rs(12), height: rs(42), backgroundColor: Colors.card,
  },
  searchInput: {
    flex: 1, fontSize: rf(14), color: Colors.textPrimary,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
  },
  mapBtn: {
    width: rs(42), height: rs(42), borderRadius: rs(10),
    borderWidth: 1.5, borderColor: Colors.inputBorder, backgroundColor: Colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  mapBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stationRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(4),
    paddingHorizontal: rs(16), paddingBottom: rs(4),
  },
  stationTxt: { fontSize: rf(12.5), color: Colors.primary, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6), paddingTop: rs(6) },
  chip: {
    paddingHorizontal: rs(12), paddingVertical: rs(7), borderRadius: rs(100),
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.divider,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontSize: rf(12.5), fontWeight: '600', color: Colors.textMuted },
  chipTxtActive: { color: '#FFFFFF' },
  count: { fontSize: rf(12.5), color: Colors.textMuted, marginTop: rs(12), marginBottom: rs(6) },

  card: {
    backgroundColor: Colors.card, borderRadius: rs(14), padding: rs(14),
    marginBottom: rs(10), borderWidth: 1, borderColor: Colors.divider,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
  title: { fontSize: rf(15.5), fontWeight: '700', color: Colors.textPrimary },
  company: { fontSize: rf(13), color: Colors.textSecondary, marginTop: rs(2) },
  // Метка источника. Нужна на каждой карточке без исключений: по ней человек
  // понимает, откликнется ли он здесь или уйдёт на чужой сайт.
  badge: {
    paddingHorizontal: rs(8), paddingVertical: rs(4), borderRadius: rs(100),
    maxWidth: rs(120),
  },
  badgeOwn: { backgroundColor: Colors.primaryLight },
  badgeExt: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.divider },
  badgeTxt: { fontSize: rf(11), fontWeight: '700' },
  badgeTxtOwn: { color: Colors.primary },
  badgeTxtExt: { color: Colors.textMuted },

  rows: { marginTop: rs(10), gap: rs(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  rowTxt: { fontSize: rf(12.5), color: Colors.textSecondary, flex: 1 },

  cardBottom: {
    marginTop: rs(12), flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: rs(8),
  },
  pay: { fontSize: rf(15), fontWeight: '800', color: Colors.textPrimary },
  kindTag: {
    paddingHorizontal: rs(10), paddingVertical: rs(5),
    borderRadius: rs(100), backgroundColor: Colors.surface,
  },
  kindTagTxt: { fontSize: rf(11.5), fontWeight: '600', color: Colors.textMuted },
  extBtn: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  extBtnTxt: { fontSize: rf(12.5), fontWeight: '700', color: Colors.primary },

  empty: { alignItems: 'center', paddingTop: rs(56), paddingHorizontal: rs(32) },
  emptyTitle: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary, marginTop: rs(10) },
  emptySub: {
    fontSize: rf(13), color: Colors.textMuted, textAlign: 'center',
    marginTop: rs(4), lineHeight: rf(19),
  },
});
