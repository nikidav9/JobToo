import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, PanResponder, Dimensions, RefreshControl, Modal, FlatList,
  TextInput, ActivityIndicator, Share, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { ExternalVacancy, Like, User, Vacancy, PermVacancy } from '@/constants/types';
import {
  formatDate,
  getInitials,
  getTodayDates,
  nameColorFromString,
} from '@/services/storage';
import { companyInitials, isLavkaCompany, normalizeCompany } from '@/services/company';
import { scoreVacancyForWorker } from '@/services/matching';
import { METRO_LINES } from '@/constants/metro';
import {
  dbUpsertLike,
  dbCheckAndCreateMatch,
  dbRemoveLike,
  dbUpdateVacancy,
  dbCreateChat,
  dbInsertMessage,
  dbIncrementUnread,
  dbApplyPermVacancy,
  dbClosePermVacancy,
  dbDeleteVacancy,
  dbDeletePermVacancy,
  dbGetUserById,
  dbGetLikesByVacancy,
  dbRecordVacancyView,
  dbRecordPermVacancyView,
  dbGetVacancyViewers,
  dbGetPermVacancyViewers,
  dbAddPermSaved,
  dbRemovePermSaved,
  dbGetExternalVacancies,
  dbRecordExternalClick,
} from '@/services/db';
import { notifyEmployerGotMatch, notifyWorkerGotMatch,
  notifyEmployerNewMessage } from '@/services/notifications';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '@/components/ui/Chip';
import { VacancyDetailModal } from '@/components/feature/VacancyDetailModal';
import { LavkaLogo } from '@/components/ui/LavkaLogo';
import { TabHeader } from '@/components/ui/TabHeader';
import { SheetHandle, useSwipeToDismiss } from '@/components/ui/Sheet';
import { MetroMap, MapListItem } from '@/components/feature/MetroMap';
import { PermApplicationsSheet } from '@/components/feature/PermApplicationsSheet';
import { setOnboardingTarget, setOnboardingFlag, registerOnboardingMeasurer } from '@/lib/onboardingTargets';
import { registerWebPush, isWebPushRegistered, getWebPushDebug } from '@/lib/webPush';

import { rs, rf } from '@/constants/scale';
import { ApplySheet } from '@/components/feature/ApplySheet';
import { getChatSuggestions } from '@/constants/chatSuggestions';
import { payShort } from '@/services/pay';
import { vacancyInfoLines, permVacancyInfoLines } from '@/services/vacancyCard';

function CompanyMark({ company, size = 44 }: { company?: string | null; size?: number }) {
  const name = normalizeCompany(company);
  if (isLavkaCompany(name)) return <LavkaLogo size={size} />;
  return (
    <View
      accessibilityLabel={`Логотип компании ${name}`}
      style={[
        styles.companyFallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: nameColorFromString(name) },
      ]}
    >
      <Text style={styles.companyFallbackText}>{companyInitials(name)}</Text>
    </View>
  );
}

// ─── Web push permission banner (iOS PWA requires user gesture) ───────────────
type WPState = 'ask' | 'retry' | 'denied' | 'hidden';

function getWPState(): WPState {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'hidden';
  if (!('Notification' in window)) return 'hidden';
  const perm = (window as any).Notification.permission as NotificationPermission;
  if (perm === 'denied') return 'denied';
  if (perm === 'granted' && isWebPushRegistered()) return 'hidden';
  if (perm === 'granted') return 'retry';
  return 'ask';
}

function WebPushBanner({ userId }: { userId: string }) {
  const [state, setState] = useState<WPState>(() => getWPState());
  const [debugMsg, setDebugMsg] = useState<string>('');
  const [loading, setLoading] = useState(false);

  if (state === 'hidden') return null;

  if (state === 'denied') {
    return (
      <TouchableOpacity style={[wpStyles.banner, wpStyles.bannerDenied]} activeOpacity={1}>
        <Ionicons name="settings-outline" size={rf(18)} color="#92400E" />
        <Text style={[wpStyles.text, wpStyles.textDenied]}>Разрешите уведомления: Настройки → Safari → Уведомления</Text>
      </TouchableOpacity>
    );
  }

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    setDebugMsg('...');
    const ok = await registerWebPush(userId);
    setLoading(false);
    if (ok) {
      setState('hidden');
    } else {
      const msg = getWebPushDebug();
      setDebugMsg(msg);
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      if (perm === 'denied') setState('denied');
    }
  };

  return (
    <TouchableOpacity style={wpStyles.banner} onPress={handlePress} activeOpacity={0.85} disabled={loading}>
      {loading
        ? <ActivityIndicator size="small" color="#4338CA" />
        : <Ionicons name="notifications-outline" size={rf(18)} color="#4338CA" />}
      <View style={{ flex: 1 }}>
        <Text style={wpStyles.text}>
          {state === 'retry' ? 'Завершить настройку уведомлений' : 'Включить push-уведомления'}
        </Text>
        {debugMsg ? <Text style={wpStyles.debugText}>{debugMsg}</Text> : null}
      </View>
      {!loading && <Text style={wpStyles.arrow}>›</Text>}
    </TouchableOpacity>
  );
}

const wpStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8),
    marginHorizontal: rs(16), marginBottom: rs(8),
    backgroundColor: '#EEF2FF', borderRadius: rs(12),
    paddingHorizontal: rs(14), paddingVertical: rs(10),
  },
  bannerDenied: { backgroundColor: '#FEF3C7' },
  text: { fontSize: rf(14), fontWeight: '600', color: '#4338CA' },
  textDenied: { color: '#92400E', fontWeight: '500', fontSize: rf(12) },
  debugText: { fontSize: rf(11), color: '#6B7280', marginTop: rs(2) },
  arrow: { fontSize: rf(18), color: '#4338CA' },
});

const { width: SW } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 0.3;

// Flat list of all metro stations with their line metadata
const ALL_STATIONS = METRO_LINES.flatMap(l =>
  l.stations.map(s => ({ station: s, lineId: l.id, lineColor: l.color, lineName: l.name }))
).sort((a, b) => a.station.localeCompare(b.station, 'ru'));

function MetroStationPicker({
  visible,
  selectedStation,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedStation: string | null;
  onSelect: (station: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_STATIONS;
    return ALL_STATIONS.filter(s => s.station.toLowerCase().includes(q));
  }, [query]);

  if (!visible) return null;

  return (
    <View style={styles.filterOverlay}>
      <View style={[styles.filterSheet, { maxHeight: '85%' }]}>
        <View style={styles.filterSheetHeader}>
          <Text style={styles.filterSheetTitle}>Станция метро</Text>
          <TouchableOpacity onPress={() => { setQuery(''); onClose(); }}>
            <Text style={styles.filterClose}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={metroPickerSt.searchRow}>
          <Ionicons name="search" size={rf(16)} color={Colors.textMuted} />
          <TextInput
            style={metroPickerSt.searchInput}
            placeholder="Введите название станции..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={metroPickerSt.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {selectedStation ? (
          <TouchableOpacity
            style={styles.clearFilterRow}
            onPress={() => { setQuery(''); onSelect(null); onClose(); }}
          >
            <Text style={styles.clearFilterTxt}>✕ Сбросить фильтр</Text>
          </TouchableOpacity>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(item, i) => `${item.lineId}-${i}`}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.lineRow, selectedStation === item.station ? styles.lineRowActive : null]}
              onPress={() => { setQuery(''); onSelect(item.station); onClose(); }}
              activeOpacity={0.8}
            >
              <View style={[styles.lineDot, { backgroundColor: item.lineColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.lineName, selectedStation === item.station ? { color: Colors.primary, fontWeight: '700' } : null]}>
                  {item.station}
                </Text>
                <Text style={metroPickerSt.lineSubtitle}>{item.lineName}</Text>
              </View>
              {selectedStation === item.station ? <Text style={{ color: Colors.primary }}>✓</Text> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={metroPickerSt.empty}>
              <Text style={metroPickerSt.emptyTxt}>Станция не найдена</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const metroPickerSt = StyleSheet.create({
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8),
    marginHorizontal: rs(16), marginVertical: rs(10),
    backgroundColor: Colors.surface, borderRadius: rs(12),
    paddingHorizontal: rs(12), paddingVertical: rs(10),
    borderWidth: 1, borderColor: Colors.inputBorder,
  },
  searchInput: { flex: 1, fontSize: rf(15), color: Colors.textPrimary },
  searchClear: { fontSize: rf(14), color: Colors.textMuted, paddingLeft: rs(4) },
  lineSubtitle: { fontSize: rf(11), color: Colors.textMuted, marginTop: rs(1) },
  empty: { padding: rs(24), alignItems: 'center' },
  emptyTxt: { fontSize: rf(14), color: Colors.textMuted },
});

// ─────────────────────────────────────────────────
// Mode switcher
// ─────────────────────────────────────────────────
type AppMode = 'shift' | 'perm';

// Отдельного «Поиска» больше нет: внешняя постоянная работа показывается
// вместе со своей во вкладке «Работа», а смены остаются в свайп-ленте.
const MODE_LABELS: Record<AppMode, { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  shift:  { label: 'Смены',  icon: 'flash' },
  perm:   { label: 'Работа', icon: 'briefcase' },
};

function ModeSwitcher({ mode, onChange, modes = ['shift', 'perm'] }: {
  mode: AppMode;
  onChange: (m: AppMode) => void;
  modes?: AppMode[];
}) {
  const ref = useRef<View>(null);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setOnboardingTarget('switcher', { x, y, w, h });
    });
  }, []);
  useEffect(() => registerOnboardingMeasurer('switcher', measure), [measure]);
  return (
    <View ref={ref} onLayout={measure} style={ms.container}>
      {modes.map(m => {
        const { label, icon } = MODE_LABELS[m];
        const active = mode === m;
        return (
          <TouchableOpacity
            key={m}
            style={[ms.btn, active && ms.btnActive]}
            onPress={() => onChange(m)}
            activeOpacity={0.8}
          >
            <Ionicons name={icon} size={14} color={active ? '#fff' : Colors.textMuted} style={ms.btnIcon} />
            <Text style={[ms.btnTxt, active && ms.btnTxtActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const ms = StyleSheet.create({
  container: {
    flexDirection: 'row', gap: rs(3),
    backgroundColor: Colors.surface,
    borderRadius: rs(100), padding: rs(3),
    borderWidth: 1, borderColor: Colors.divider,
  },
  // Значок вынесен из потока: пока он стоял слева от текста, центрировалась
  // вся пара целиком, и надпись уезжала вправо на половину его ширины с
  // отступом — на 9 пикселей. Теперь по центру стоит именно текст.
  btn: { flex: 1, borderRadius: rs(100), paddingVertical: rs(8), alignItems: 'center', justifyContent: 'center' },
  btnIcon: { position: 'absolute', left: rs(12) },
  btnActive: { backgroundColor: Colors.primary },
  btnTxt: { fontSize: rf(12), fontWeight: '600', color: Colors.textMuted },
  btnTxtActive: { color: '#FFFFFF', fontWeight: '700' },
});

// ─────────────────────────────────────────────────
// Vacancy Viewers Modal
// ─────────────────────────────────────────────────
function VacancyViewersModal({ vacancyId, kind = 'shift', onClose }: { vacancyId: string; kind?: 'shift' | 'perm'; onClose: () => void }) {
  const router = useRouter();
  const { currentUser, vacancies, permVacancies, users, chats, showToast, refreshChats } = useApp();
  const [loading, setLoading] = useState(true);
  const [viewers, setViewers] = useState<User[]>([]);
  const [chatLoading, setChatLoading] = useState<string | null>(null);
  const viewersSwipe = useSwipeToDismiss(onClose);

  const vacancy = kind === 'perm'
    ? permVacancies.find(v => v.id === vacancyId)
    : vacancies.find(v => v.id === vacancyId);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const ids = await (kind === 'perm' ? dbGetPermVacancyViewers(vacancyId) : dbGetVacancyViewers(vacancyId));
        // Список пользователей уже загружен в контекст, поэтому берём оттуда.
        // Раньше на каждого шёл отдельный запрос: на 58 просмотревших это
        // 58 обращений к серверу, и шторка висела с крутилкой полминуты.
        const known = new Map<string, User>(users.map((u: User) => [u.id, u]));
        const missing = ids.filter((id: string) => !known.has(id));
        const fetched = missing.length
          ? (await Promise.all(missing.map(id => dbGetUserById(id)))).filter(Boolean) as User[]
          : [];
        fetched.forEach((u: User) => known.set(u.id, u));
        setViewers(ids.map((id: string) => known.get(id)).filter(Boolean) as User[]);
      } catch {
        showToast('Ошибка загрузки', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [vacancyId]);

  const openChat = async (worker: User) => {
    if (!currentUser) return;
    setChatLoading(worker.id);
    try {
      // Чат теперь один на пару людей — ищем по собеседнику, а не по вакансии
      const existing = chats.find(c => c.employerId === currentUser.id && c.workerId === worker.id);
      if (existing) {
        onClose();
        router.push({ pathname: '/chat-room', params: { chatId: existing.id } });
        return;
      }
      const vacTitle = vacancy?.title ?? (kind === 'perm' ? 'Вакансия' : 'Смена');
      const companyName = vacancy?.company ?? currentUser.company ?? '';
      const greeting = `Здравствуйте, ${worker.firstName}! Вы смотрели вакансию «${vacTitle}». Хотелось бы предложить вам эту работу.`;
      const chatId = await dbCreateChat(worker.id, currentUser.id, vacancyId, vacTitle, companyName, greeting, 1, 0);
      refreshChats().catch(() => {});
      onClose();
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch {
      showToast('Ошибка при открытии чата', 'error');
    } finally {
      setChatLoading(null);
    }
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={wS.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[wS.sheet, viewersSwipe.animStyle]}>
          <View {...viewersSwipe.panHandlers}>
            <SheetHandle />
            <View style={wS.sheetHeader}>
              <SheetTitleIcon name="eye-outline" color={Colors.textSecondary} bg={Colors.divider} />
              <Text style={wS.sheetTitle}>Просмотрели вакансию</Text>
            </View>
          </View>
        {loading ? (
          // Чуть выше середины: ровно по центру пустой шторки крутилка
          // выглядит потерянной.
          <View style={wS.loaderWrap}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : viewers.length === 0 ? (
          <View style={wS.empty}>
            <EmptyIcon name="eye-off-outline" />
            <Text style={wS.emptyTxt}>Ещё никто не просмотрел</Text>
          </View>
        ) : (
          <FlatList
            data={viewers}
            keyExtractor={w => w.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item: w }) => {
              const color = nameColorFromString(w.id);
              const initials = getInitials(`${w.firstName} ${w.lastName}`);
              return (
                <View style={[wS.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                  <View style={[wS.avatar, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={wS.avatarTxt}>{initials}</Text>
                  </View>
                  <View style={wS.cardInfo}>
                    <Text style={wS.cardName}>{w.firstName} {w.lastName}</Text>
                    {w.metroStation ? <MetaBit name="subway-outline" text={w.metroStation} /> : null}
                  </View>
                  <TouchableOpacity
                    style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => openChat(w)}
                    disabled={chatLoading === w.id}
                    activeOpacity={0.8}
                  >
                    {chatLoading === w.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────
// Worker List Modal (for employer vacancy stats)
// ─────────────────────────────────────────────────
function WorkerListModal({
  vacancyId,
  type,
  onClose,
}: {
  vacancyId: string;
  type: 'applicants' | 'hired' | 'rejected';
  onClose: () => void;
}) {
  const router = useRouter();
  const { currentUser, users, vacancies, chats, showToast, refreshLikes, refreshChats, optimisticUpdateLike } = useApp();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const listSwipe = useSwipeToDismiss(onClose);
  const [localLikes, setLocalLikes] = useState<Like[]>([]);
  const [localWorkers, setLocalWorkers] = useState<User[]>([]);

  const vacancy = vacancies.find(v => v.id === vacancyId);

  // Fetch likes for this vacancy + all referenced workers in parallel
  useEffect(() => {
    const init = async () => {
      setDataLoading(true);
      try {
        const vacLikes = await dbGetLikesByVacancy(vacancyId);
        setLocalLikes(vacLikes);

        const workerIds = [...new Set(vacLikes.map(l => l.workerId))];
        if (workerIds.length > 0) {
          // Как и у просмотревших: сначала из памяти, запросы только за теми,
          // кого там нет.
          const known = new Map<string, User>(users.map((u: User) => [u.id, u]));
          const missing = workerIds.filter((id: string) => !known.has(id));
          const fetched = missing.length
            ? (await Promise.all(missing.map(id => dbGetUserById(id)))).filter(Boolean) as User[]
            : [];
          fetched.forEach((u: User) => known.set(u.id, u));
          setLocalWorkers(workerIds.map((id: string) => known.get(id)).filter(Boolean) as User[]);
        }
      } catch (e) {
        console.warn('[WorkerListModal] init error', e);
      } finally {
        setDataLoading(false);
      }
    };
    init();
  }, [vacancyId]);

  const titleMap: Record<typeof type, { title: string; icon: IconName; color: string; bg: string; empty: IconName; emptyTxt: string }> = {
    applicants: { title: 'Отклики',     icon: 'people-outline',           color: Colors.primary, bg: Colors.primaryLight, empty: 'people-outline',      emptyTxt: 'Нет новых откликов' },
    hired:      { title: 'Набрано',     icon: 'checkmark-circle-outline', color: Colors.green,   bg: Colors.greenLight,   empty: 'person-add-outline',  emptyTxt: 'Никого не набрано' },
    rejected:   { title: 'Отклонённые', icon: 'close-circle-outline',     color: Colors.red,     bg: Colors.redLight,     empty: 'close-circle-outline', emptyTxt: 'Нет отклонённых' },
  };
  const head = titleMap[type];

  // Use fresh localLikes (from DB) for display — not stale context likes
  let filteredLikes: Like[] = [];
  if (type === 'applicants') {
    filteredLikes = localLikes.filter(l => l.workerLiked && !l.isMatch && l.employerLiked !== false);
  } else if (type === 'hired') {
    filteredLikes = localLikes.filter(l => l.isMatch);
  } else {
    filteredLikes = localLikes.filter(
      l => l.employerLiked === false || (l.workerLiked === false && l.workerSkipped === true)
    );
  }

  // Look up from locally fetched workers first, then context users as fallback
  const getWorker = (id: string) =>
    localWorkers.find(u => u.id === id) ?? users.find(u => u.id === id);

  // Чат один на пару людей, поэтому ищем по собеседнику, а не по вакансии
  const getChatId = (workerId: string) =>
    chats.find(c => c.employerId === currentUser?.id && c.workerId === workerId)?.id ?? null;

  // Open or create a chat with a worker (no match decision required)
  const openOrCreateChat = async (like: Like) => {
    if (!currentUser) return;
    const vacTitle = vacancy?.title ?? 'Смена';
    const companyName = vacancy?.company ?? currentUser.company ?? '';
    setActionLoading(like.workerId);
    try {
      const existingChatId = getChatId(like.workerId);
      if (existingChatId) {
        onClose();
        router.push({ pathname: '/chat-room', params: { chatId: existingChatId } });
        return;
      }
      const worker = getWorker(like.workerId);
      const greeting = worker
        ? `Здравствуйте, ${worker.firstName}! Я рассматриваю вашу кандидатуру на «${vacTitle}».`
        : `Здравствуйте! Я рассматриваю вашу кандидатуру на вакансию.`;
      const chatId = await dbCreateChat(
        like.workerId,
        currentUser.id,
        vacancyId,
        vacTitle,
        companyName,
        greeting,
        1,
        0,
      );
      refreshChats().catch(() => {});
      onClose();
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch {
      showToast('Ошибка при открытии чата', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const onAccept = async (like: Like) => {
    if (!currentUser) return;
    const vacTitle = vacancy?.title ?? 'Смена';
    setActionLoading(like.workerId);
    try {
      await dbUpsertLike(vacancyId, like.workerId, currentUser.id, { employerLiked: true });
      const result = await dbCheckAndCreateMatch(vacancyId, like.workerId);
      if (result.matched) {
        optimisticUpdateLike({ ...like, isMatch: true, employerLiked: true });
      }
      refreshLikes().catch(() => {});
      notifyWorkerGotMatch(like.workerId, vacancy?.company ?? '', vacTitle).catch(() => {});
      showToast('Мэтч! Чат открыт', 'success');
      onClose();
      if (result.chatId) {
        router.push({ pathname: '/chat-room', params: { chatId: result.chatId } });
      } else {
        router.push({ pathname: '/(tabs)/chats' });
      }
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openChat = async (like: Like) => {
    if (!currentUser) return;
    const chatId = getChatId(like.workerId);
    if (chatId) {
      onClose();
      router.push({ pathname: '/chat-room', params: { chatId } });
      return;
    }
    setActionLoading(like.workerId);
    try {
      const vacTitle = vacancy?.title ?? 'Смена';
      const companyName = vacancy?.company ?? currentUser.company ?? '';
      const newChatId = await dbCreateChat(
        like.workerId,
        currentUser.id,
        vacancyId,
        vacTitle,
        companyName,
        undefined,
        0,
        0,
      );
      refreshChats().catch(() => {});
      onClose();
      router.push({ pathname: '/chat-room', params: { chatId: newChatId } });
    } catch {
      showToast('Ошибка при открытии чата', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const onDiscussRejected = async (like: Like) => {
    if (!currentUser) return;
    setActionLoading(like.workerId);
    try {
      const worker = getWorker(like.workerId);
      const vacTitle = vacancy?.title ?? 'Смена';
      const companyName = vacancy?.company ?? currentUser.company ?? '';

      const existingChatId = getChatId(like.workerId);
      if (existingChatId) {
        onClose();
        router.push({ pathname: '/chat-room', params: { chatId: existingChatId } });
        return;
      }

      const chatId = await dbCreateChat(
        like.workerId,
        currentUser.id,
        vacancyId,
        vacTitle,
        companyName,
        '',
        0,
        0,
      );

      const rejectedByWorker = like.workerLiked === false && like.workerSkipped === true;
      const text = rejectedByWorker
        ? (worker
          ? `Здравствуйте, ${worker.firstName}! Вы отказались от вакансии «${vacTitle}». Хотелось бы узнать причину — может, сможем найти решение?`
          : `Здравствуйте! Вы отказались от вакансии «${vacTitle}». Хотелось бы узнать причину — может, сможем найти решение?`)
        : (worker
          ? `Здравствуйте, ${worker.firstName}! Хотелось бы обсудить вашу заявку на вакансию «${vacTitle}».`
          : `Здравствуйте! Хотелось бы обсудить вашу заявку на вакансию «${vacTitle}».`);
      await dbInsertMessage(chatId, currentUser.id, text);
      dbIncrementUnread(chatId, 'worker').catch(() => {});
      refreshChats().catch(() => {});

      showToast('Сообщение отправлено. Открываем чат...', 'success');
      onClose();
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch (error) {
      console.error('[WorkerListModal] onDiscussRejected', error);
      showToast('Ошибка при отправке сообщения', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={wS.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[wS.sheet, listSwipe.animStyle]}>
          <View {...listSwipe.panHandlers}>
            <SheetHandle />
            <View style={wS.sheetHeader}>
              <SheetTitleIcon name={head.icon} color={head.color} bg={head.bg} />
              <Text style={wS.sheetTitle}>{head.title}</Text>
            </View>
          </View>
          {vacancy ? (
            <View style={wS.vacSubtitleRow}>
              <MetaBit name="briefcase-outline" text={vacancy.title} />
              <MetaBit name="calendar-outline" text={formatDate(vacancy.date)} />
            </View>
          ) : null}

          {dataLoading ? (
            <View style={wS.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[wS.emptyTxt, { marginTop: 12 }]}>Загрузка данных...</Text>
            </View>
          ) : filteredLikes.length === 0 ? (
            <View style={wS.empty}>
              <EmptyIcon name={head.empty} />
              <Text style={wS.emptyTxt}>{head.emptyTxt}</Text>
            </View>
          ) : (
            <FlatList
              data={filteredLikes}
              keyExtractor={l => l.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
              renderItem={({ item: like }) => {
                const worker = getWorker(like.workerId);
                const workerColor = nameColorFromString(like.workerId);
                const workerDisplayName = worker
                  ? `${worker.firstName} ${worker.lastName}`.trim() || 'Работник'
                  : 'Работник';
                const initials = worker ? getInitials(workerDisplayName) : '?';
                const isLoading = actionLoading === like.workerId;
                const rejectedByWorker = like.workerLiked === false && like.workerSkipped === true;
                return (
                  <View style={wS.card}>
                    <TouchableOpacity
                      style={wS.cardTop}
                      onPress={() => {
                        if (!worker) return;
                        router.push({ pathname: '/user-profile', params: { userId: worker.id } });
                      }}
                      activeOpacity={0.8}
                    >
                      {worker?.avatarUrl ? (
                        <Image source={{ uri: worker.avatarUrl }} style={wS.avatar} contentFit="cover" transition={150} />
                      ) : (
                        <View style={[wS.avatar, { backgroundColor: workerColor, alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={wS.avatarTxt}>{initials}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={wS.name}>{workerDisplayName}</Text>
                        {worker ? (
                          <View style={wS.metaRow}>
                            {like.isMatch
                              ? <MetaBit name="call-outline" text={worker.phone} />
                              : <MetaBit name="subway-outline" text={worker.metroStation ?? '—'} />}
                            {(worker.avgRating ?? 0) > 0
                              ? <MetaBit name="star" text={(worker.avgRating ?? 0).toFixed(1)} color={Colors.amber} />
                              : null}
                          </View>
                        ) : (
                          <Text style={wS.meta}>Загрузка...</Text>
                        )}
                        {type === 'rejected' ? (
                          <View style={wS.reasonRow}>
                            <Ionicons name="arrow-undo-outline" size={rf(11)} color={Colors.red} />
                            <Text style={wS.rejectionReason}>
                              {rejectedByWorker ? 'Сам отказался' : 'Вы отклонили'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {worker ? (
                        <View style={wS.profileLink}>
                          <Text style={wS.profileArrow}>Профиль</Text>
                          <Ionicons name="chevron-forward" size={rf(13)} color={Colors.primary} />
                        </View>
                      ) : null}
                    </TouchableOpacity>

                    <View style={wS.btnRow}>
                      {type === 'hired' ? (
                        <TouchableOpacity
                          style={[wS.chatBtn, isLoading && { opacity: 0.5 }]}
                          disabled={isLoading}
                          onPress={() => openChat(like)}
                        >
                          <Text style={wS.chatBtnTxt}>Написать</Text>
                        </TouchableOpacity>
                      ) : type === 'rejected' ? (
                        <TouchableOpacity
                          style={[wS.chatBtn, { flex: 1 }, isLoading && { opacity: 0.5 }]}
                          disabled={isLoading}
                          onPress={() => onDiscussRejected(like)}
                        >
                          <Text style={wS.chatBtnTxt}>Написать</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[wS.chatBtn, isLoading && { opacity: 0.5 }]}
                            disabled={isLoading}
                            onPress={() => openOrCreateChat(like)}
                          >
                            <Text style={wS.chatBtnTxt}>Написать</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[wS.acceptBtn, isLoading && { opacity: 0.5 }]}
                            disabled={isLoading}
                            onPress={() => onAccept(like)}
                          >
                            <Ionicons name="checkmark" size={rf(14)} color="#fff" />
                            <Text style={wS.acceptBtnTxt}>Подходит</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Шторки откликов раньше подписывались смайликами: 👥 в заголовке, 👀 и 🙅
// в пустом состоянии, 📞 и 🚇 в строке под именем. Смайлик рисует не наш
// шрифт, а система: на каждом телефоне он свой, у половины — жёлтая рожица
// вместо смысла. Одинаковые иконки читаются одинаково везде.
function SheetTitleIcon({ name, color, bg }: { name: IconName; color: string; bg: string }) {
  return (
    <View style={[wS.titleIcon, { backgroundColor: bg }]}>
      <Ionicons name={name} size={rf(16)} color={color} />
    </View>
  );
}

function EmptyIcon({ name }: { name: IconName }) {
  return (
    <View style={wS.emptyIcon}>
      <Ionicons name={name} size={rf(26)} color={Colors.textMuted} />
    </View>
  );
}

// Строка «иконка + текст» для мелких подписей: метро, телефон, рейтинг, дата.
function MetaBit({ name, text, color }: { name: IconName; text: string; color?: string }) {
  return (
    <View style={wS.metaBit}>
      <Ionicons name={name} size={rf(12)} color={color ?? Colors.textMuted} />
      <Text style={[wS.metaTxt, color ? { color } : null]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const wS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: rs(10), paddingHorizontal: rs(20), paddingTop: rs(16), paddingBottom: rs(8) },
  sheetTitle: { fontSize: rf(18), fontWeight: '700', color: Colors.textPrimary },
  titleIcon: { width: rs(30), height: rs(30), borderRadius: rs(15), alignItems: 'center', justifyContent: 'center' },
  vacSubtitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(10), flexWrap: 'wrap',
    paddingHorizontal: rs(20), paddingBottom: rs(12),
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  metaBit: { flexDirection: 'row', alignItems: 'center', gap: rs(4), flexShrink: 1 },
  metaTxt: { fontSize: rf(12), color: Colors.textMuted, flexShrink: 1 },
  empty: { alignItems: 'center', padding: rs(48), gap: rs(10) },
  emptyIcon: {
    width: rs(56), height: rs(56), borderRadius: rs(28),
    backgroundColor: Colors.divider, alignItems: 'center', justifyContent: 'center',
  },
  // Крутилка чуть выше середины: строго по центру пустой шторки она выглядит
  // потерянной, а взгляд при открытии идёт по верхней трети.
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: rs(90) },
  emptyTxt: { fontSize: rf(14), color: Colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: rs(14), gap: rs(10) },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: rs(12) },
  avatar: { width: rs(44), height: rs(44), borderRadius: rs(22) },
  avatarTxt: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
  name: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: rf(12), color: Colors.textMuted, marginTop: rs(2) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10), marginTop: rs(3) },
  profileLink: { flexDirection: 'row', alignItems: 'center', gap: rs(1) },
  profileArrow: { fontSize: rf(12), color: Colors.primary, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: rs(8) },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4), marginTop: rs(3) },
  rejectionReason: { fontSize: rf(11), color: Colors.red, fontStyle: 'italic' },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: rs(5), backgroundColor: Colors.primary, borderRadius: rs(100), paddingVertical: rs(9), paddingHorizontal: rs(14), justifyContent: 'center' },
  acceptBtnTxt: { fontSize: rf(13), color: '#fff', fontWeight: '700' },
  chatBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: rs(10), paddingVertical: rs(9), alignItems: 'center' },
  chatBtnTxt: { fontSize: rf(13), color: '#fff', fontWeight: '600' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
});

// ─────────────────────────────────────────────────
// Worker swipe feed (Подработка)
// ─────────────────────────────────────────────────
function WorkerFeed() {
  const router = useRouter();
  const {
    currentUser, users, vacancies, likes, chats,
    refreshAll, refreshLikes, refreshChats,
    showToast, vacanciesLoading, vacancyStatsMap,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const [dates, setDates] = useState(() => getTodayDates());
  const [selectedDate, setSelectedDate] = useState(() => getTodayDates()[0]);
  const [cards, setCards] = useState<Vacancy[]>([]);
  const [history, setHistory] = useState<Record<string, Vacancy[]>>({});
  const [swiping, setSwiping] = useState(false);
  const [detailVacancy, setDetailVacancy] = useState<Vacancy | null>(null);
  const [detailEmployer, setDetailEmployer] = useState<User | null>(null);
  const [filterStation, setFilterStation] = useState<string | null>(null);
  const [filterPicker, setFilterPicker] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  // Смены для карты: метки ставятся по адресу, поэтому кроме станции
  // передаём адрес и координаты — по ним карта и группирует точки.
  const mapItems: MapListItem[] = useMemo(() => {
    if (!currentUser) return [];
    return (vacancies as Vacancy[])
      .filter((v: Vacancy) =>
        v.status === 'open' &&
        v.date === selectedDate &&
        (!!v.metroStation || !!v.address) &&
        currentUser.workTypes?.includes(v.workType))
      .map((v: Vacancy) => ({
        id: v.id,
        station: v.metroStation,
        title: v.title,
        company: v.company,
        pay: payShort(v.salary, v.workType),
        meta: `${v.timeStart}–${v.timeEnd}`,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
      }));
  }, [vacancies, selectedDate, currentUser]);

  const pan = useRef(new Animated.ValueXY()).current;
  const cardAreaRef = useRef<View>(null);
  const pendingLikeIds = useRef<Set<string>>(new Set());
  const swipingRef = useRef(false);
  const messagingRef = useRef(false);
  // Карточка, по которой человек сейчас пишет отклик (null — окно закрыто)
  const [applyFor, setApplyFor] = useState<Vacancy | null>(null);

  const wantOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const skipOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const rotate = pan.x.interpolate({ inputRange: [-SW / 2, 0, SW / 2], outputRange: ['-8deg', '0deg', '8deg'], extrapolate: 'clamp' });

  useEffect(() => {
    const sync = () => {
      const fresh = getTodayDates();
      setDates(fresh);
      setSelectedDate(prev => {
        if (!fresh.includes(prev)) {
          return fresh[0];
        }
        return prev;
      });
    };
    sync();
    const interval = setInterval(sync, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Свои отклики — по ним видно, у кого человек уже работал.
  const myLikes = useMemo(
    () => (likes as Like[]).filter((l: Like) => l.workerId === currentUser?.id),
    [likes, currentUser?.id],
  );

  useEffect(() => {
    if (!currentUser) return;
    const filtered = vacancies
      .filter(v => {
        if (v.status !== 'open') return false;
        if (v.date !== selectedDate) return false;
        if (!currentUser.workTypes?.includes(v.workType)) return false;
        if (pendingLikeIds.current.has(v.id)) return false;
        const liked = likes.find(l => l.vacancyId === v.id && l.workerId === currentUser.id);
        if (liked) return false;
        if (filterStation && v.metroStation !== filterStation) return false;
        return true;
      })
      .sort((a, b) => {
        // Подбор, а не только метро: подтверждённый навык, срочность,
        // знакомый работодатель и его рейтинг тоже двигают карточку вверх.
        // Работодателя ищем среди уже загруженных — недостающий просто не
        // добавит слагаемого, лишний запрос ради сортировки не нужен.
        const ctx = (v: Vacancy) => ({
          employer: users.find((u: User) => u.id === v.employerId) ?? null,
          myLikes: myLikes,
        });
        return scoreVacancyForWorker(b, currentUser, ctx(b))
             - scoreVacancyForWorker(a, currentUser, ctx(a));
      });
    setCards(filtered);
    if (!swipingRef.current) {
      pan.flattenOffset();
      pan.setValue({ x: 0, y: 0 });
    }
  }, [selectedDate, vacancies, likes, myLikes, users, currentUser, filterStation]);

  const currentCard = cards[0];
  const currentEmployer = currentCard ? users.find(u => u.id === currentCard.employerId) : null;
  // Онбордингу: есть ли реальная карточка (иначе он покажет демо-карточку)
  useEffect(() => { setOnboardingFlag('hasShiftCard', !!currentCard); }, [currentCard]);
  const dateHistory = history[selectedDate] ?? [];
  const vacancyStats = currentCard
    ? (vacancyStatsMap[currentCard.id] ?? { applicants: 0, rejected: 0, views: 0 })
    : { applicants: 0, rejected: 0, views: 0 };

  useEffect(() => {
    if (!currentCard?.id || !currentUser?.id) return;
    const t = setTimeout(() => {
      dbRecordVacancyView(currentCard.id, currentUser.id).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [currentCard?.id, currentUser?.id]);

  const animateCard = useCallback((dir: 'left' | 'right', velocity: number, cb: () => void) => {
    const targetX = dir === 'right' ? SW * 1.5 : -SW * 1.5;
    const duration = Math.max(180, Math.min(300, 250 / (Math.abs(velocity) + 0.5)));
    swipingRef.current = true;
    setSwiping(true);
    Animated.parallel([
      Animated.timing(pan.x, { toValue: targetX, duration, useNativeDriver: false }),
      Animated.timing(pan.y, { toValue: dir === 'right' ? -40 : 40, duration, useNativeDriver: false }),
    ]).start(() => {
      pan.setValue({ x: 0, y: 0 });
      swipingRef.current = false;
      setSwiping(false);
      cb();
    });
  }, [pan]);

  const snapBack = useCallback(() => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      tension: 250,
      friction: 22,
      useNativeDriver: false,
    }).start();
  }, [pan]);

  const doSkip = useCallback((vx = 0.5) => {
    if (!currentCard || !currentUser || swiping) return;
    const card = currentCard;
    const date = selectedDate;
    const user = currentUser;
    pendingLikeIds.current.add(card.id);
    animateCard('left', vx, () => {
      setHistory(h => ({ ...h, [date]: [card, ...(h[date] ?? []).slice(0, 9)] }));
      setCards(prev => prev.slice(1));
      dbUpsertLike(card.id, user.id, card.employerId, { workerLiked: false, workerSkipped: true })
        .then(() => refreshLikes(user))
        .catch(() => { pendingLikeIds.current.delete(card.id); });
    });
  }, [currentCard, currentUser, swiping, selectedDate, animateCard, refreshLikes]);

  const doWant = useCallback((vx = 0.5) => {
    if (!currentCard || !currentUser || swiping) return;
    const card = currentCard;
    const date = selectedDate;
    const user = currentUser;
    pendingLikeIds.current.add(card.id);
    animateCard('right', vx, () => {
      setHistory(h => ({ ...h, [date]: [card, ...(h[date] ?? []).slice(0, 9)] }));
      setCards(prev => prev.slice(1));
      (async () => {
        try {
          await dbUpsertLike(card.id, user.id, card.employerId, { workerLiked: true, workerSkipped: false });
          const result = await dbCheckAndCreateMatch(card.id, user.id);
          refreshLikes(user).catch(() => {});
          if (result.matched) {
            notifyEmployerGotMatch(card.employerId, `${user.firstName} ${user.lastName}`, card.title).catch(() => {});
            router.push({ pathname: '/match', params: { vacancyId: card.id, chatId: result.chatId } });
          } else {
            // Уведомление директору шлёт сервер при записи отклика — см. dbUpsertLike.
            showToast('Отклик отправлен. Ждём решения работодателя', 'success');
          }
        } catch {
          // Restore card to front of deck on failure
          pendingLikeIds.current.delete(card.id);
          setCards(prev => [card, ...prev.filter(v => v.id !== card.id)]);
          showToast('Ошибка при отправке отклика — попробуй ещё раз', 'error');
        }
      })();
    });
  }, [currentCard, currentUser, swiping, selectedDate, animateCard, refreshLikes, router, showToast]);

  const doUndo = useCallback(() => {
    if (!dateHistory.length || !currentUser || swiping) return;
    const last = dateHistory[0];
    const user = currentUser;
    pendingLikeIds.current.delete(last.id);
    setHistory(h => ({ ...h, [selectedDate]: (h[selectedDate] ?? []).slice(1) }));
    setCards(prev => [last, ...prev]);
    pan.setValue({ x: -SW, y: 0 });
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, tension: 200, friction: 20, useNativeDriver: false }).start();
    dbRemoveLike(last.id, user.id).then(() => refreshLikes(user)).catch(() => {});
  }, [dateHistory, selectedDate, currentUser, swiping, refreshLikes, pan]);

  // Отклик на смену. Если переписка с этим работодателем уже есть — просто
  // открываем её. Если нет, сначала спрашиваем у человека пару слов о себе:
  // раньше вместо них уходил шаблон от имени системы, и отвечать было нечему.
  const doMessage = useCallback(() => {
    if (!currentCard || !currentUser || messagingRef.current) return;
    const existingChat = chats.find(
      c => c.employerId === currentCard.employerId && c.workerId === currentUser.id
    );
    if (existingChat) {
      router.push({ pathname: '/chat-room', params: { chatId: existingChat.id } });
      return;
    }
    setApplyFor(currentCard);
  }, [currentCard, currentUser, chats, router]);

  const sendApply = useCallback(async (message: string) => {
    const card = applyFor;
    if (!card || !currentUser || messagingRef.current) return;
    messagingRef.current = true;
    try {
      await dbUpsertLike(card.id, currentUser.id, card.employerId, {
        workerLiked: true,
        workerSkipped: false,
      });
      const chatId = await dbCreateChat(
        currentUser.id,
        card.employerId,
        card.id,
        card.title,
        card.company,
        message,
        0,
        1,
        true,   // сообщение от работника, а не от системы
      );
      refreshChats().catch(() => {});
      // В уведомлении — сами слова человека: работодатель решает, отвечать
      // ли, по ним, а не по казённому «Новый отклик».
      notifyEmployerNewMessage(
        card.employerId,
        `${currentUser.firstName} ${currentUser.lastName}`,
        message,
        chatId,
      ).catch(() => {});
      setApplyFor(null);
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch (e) {
      showToast('Не удалось отправить отклик', 'error');
    } finally {
      messagingRef.current = false;
    }
  }, [applyFor, currentUser, refreshChats, router, showToast]);

  const swipeCbRef = useRef<((dir: 'want' | 'skip', vx: number) => void) | null>(null);
  const snapBackRef = useRef<(() => void) | null>(null);
  const doMessageRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    swipeCbRef.current = (dir, vx) => { if (dir === 'want') doWant(vx); else doSkip(vx); };
    snapBackRef.current = snapBack;
    doMessageRef.current = doMessage;
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 1.2 && Math.abs(g.dx) > 8,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, { dx, vx }) => {
        pan.flattenOffset();
        if (dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) {
          swipeCbRef.current?.('want', Math.abs(vx));
        } else if (dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) {
          swipeCbRef.current?.('skip', Math.abs(vx));
        } else {
          snapBackRef.current?.();
        }
      },
      onPanResponderTerminate: () => { swipingRef.current = false; setSwiping(false); snapBackRef.current?.(); },
    })
  ).current;

  const getDateCount = (d: string) => {
    if (!currentUser) return 0;
    return vacancies.filter(v => {
      if (v.status !== 'open') return false;
      if (v.date !== d) return false;
      if (!currentUser.workTypes?.includes(v.workType)) return false;
      const alreadySwiped = likes.find(l => l.vacancyId === v.id && l.workerId === currentUser.id);
      if (alreadySwiped) return false;
      if (filterStation && v.metroStation !== filterStation) return false;
      return true;
    }).length;
  };

  const visibleDates = dates;
  const activeStationLine = filterStation
    ? METRO_LINES.find(l => l.stations.includes(filterStation)) ?? null
    : null;

  const getRuDay = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Date strip + inline filter button */}
      <View style={styles.dateStrip}>
        <View style={styles.dateStripInner}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateRow}
            style={{ flex: 1 }}
          >
            {visibleDates.map(d => {
              const active = d === selectedDate;
              const cnt = getDateCount(d);
              return (
                <TouchableOpacity key={d} style={[styles.dateChip, active && styles.dateChipActive]} onPress={() => setSelectedDate(d)} activeOpacity={0.8}>
                  <Text style={[styles.dcDay, active && styles.dcDayActive]}>{getRuDay(d)}</Text>
                  <Text style={[styles.dcNum, active && styles.dcNumActive]}>{new Date(d + 'T00:00:00').getDate()}</Text>
                  <Text style={[styles.dcCnt, active && styles.dcCntActive]}>{cnt}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={[pS.inlineFilter, filterStation ? pS.inlineFilterActive : null]}
            onPress={() => setMapOpen(true)}
            activeOpacity={0.8}
          >
            {filterStation && activeStationLine ? (
              <View style={[pS.filterLineDot, { backgroundColor: activeStationLine.color }]} />
            ) : (
              <View style={pS.metroIconWrap}>
                <Ionicons name="map-outline" size={18} color={Colors.textSecondary} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {filterStation ? (
        <TouchableOpacity style={styles.activeStationChip} onPress={() => setFilterStation(null)} activeOpacity={0.8}>
          <Ionicons name="location" size={13} color={Colors.primary} />
          <Text style={styles.activeStationTxt}>м. {filterStation}</Text>
          <Ionicons name="close" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      ) : null}

      <MetroMap
        visible={mapOpen}
        title="Смены на карте"
        items={mapItems}
        onSelect={(st) => { setFilterStation(st); setMapOpen(false); }}
        onClose={() => setMapOpen(false)}
      />

      {/* Card area */}
      <View
        ref={cardAreaRef}
        style={styles.cardArea}
        onLayout={() => {
          cardAreaRef.current?.measureInWindow((x, y, w, h) => {
            if (w > 0) setOnboardingTarget('card', { x, y, w, h: Math.min(h, 360) });
          });
        }}
      >
        {!currentCard ? (
          <View style={styles.emptyState} pointerEvents="none">
            <View style={styles.emptyCharContainer}>
              <Image
                source={require('../../assets/images/char-seeker-empty.png')}
                style={styles.emptyCharImg}
                contentFit="cover"
                contentPosition={{ top: '22%' }}
              />
            </View>
            <Text style={styles.emptyTitle}>Новых вакансий пока нет</Text>
            <Text style={styles.emptySubtitle}>Попробуй другую дату или дождись новых объявлений</Text>
          </View>
        ) : (
          <>
            {cards[2] ? <View style={styles.ghost2} /> : null}
            {cards[1] ? <View style={styles.ghost1} /> : null}

            <Animated.View
              style={[styles.cardAnimated, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
              {...panResponder.panHandlers}
            >
              <View style={styles.card}>
                <Animated.View style={[styles.wantOverlay, { opacity: wantOpacity }]}>
                  <Text style={styles.wantText}>ХОЧУ ♥</Text>
                </Animated.View>
                <Animated.View style={[styles.skipOverlay, { opacity: skipOpacity }]}>
                  <Text style={styles.skipText}>НЕТ ✕</Text>
                </Animated.View>

                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  overScrollMode="never"
                >
                  <View style={styles.cardTop}>
                    <View style={styles.companyRow}>
                      <CompanyMark company={currentCard.company} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.companyName} numberOfLines={1}>
                          {normalizeCompany(currentCard.company)}
                        </Text>
                        <View style={styles.metroHintRow}>
                          <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
                          <Text style={styles.metroHint}>{currentCard.metroStation}</Text>
                        </View>
                      </View>
                      {currentCard.isUrgent ? (
                        <View style={styles.urgentTag}>
                          <Ionicons name="flash" size={11} color="#92400E" />
                          <Text style={styles.urgentTagTxt}>Срочно</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.jobTitle} numberOfLines={2}>{currentCard.title}</Text>

                    <View style={styles.chipsRow}>
                      <Chip label={`${currentCard.timeStart}–${currentCard.timeEnd}`} variant="time" icon="time-outline" />
                      <Chip label={formatDate(currentCard.date)} variant="date" icon="calendar-outline" />
                      {currentCard.noExperienceNeeded ? <Chip label="Без опыта" variant="exp" icon="school-outline" /> : null}
                    </View>

                    {currentCard.address ? (
                      <View style={styles.addressChip}>
                        <Ionicons name="location-outline" size={15} color="#92400E" style={{ marginTop: 1 }} />
                        <Text style={styles.addressChipText} numberOfLines={2}>{currentCard.address}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.cardMiddle}>
                    <View style={styles.slotsRow}>
                      <View style={styles.slotInfo}>
                        <Ionicons name="people-outline" size={20} color={Colors.blue} />
                        <Text style={[styles.slotValue, { color: Colors.blue }]}>{vacancyStats.applicants}</Text>
                        <Text style={styles.slotLabel}>Отклики</Text>
                      </View>
                      <View style={styles.slotInfo}>
                        <Ionicons name="eye-outline" size={20} color={Colors.green} />
                        <Text style={[styles.slotValue, { color: Colors.green }]}>{vacancyStats.views}</Text>
                        <Text style={styles.slotLabel}>Просмотрели</Text>
                      </View>
                    </View>
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={styles.detailHintRow}
                  activeOpacity={0.7}
                  onPress={() => { setDetailVacancy(currentCard); setDetailEmployer(currentEmployer ?? null); }}
                >
                  <Text style={styles.detailHintText}>Подробности и нормативы</Text>
                  <Text style={styles.detailHintArrow}>→</Text>
                </TouchableOpacity>

                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    style={[styles.cardActionItem, !dateHistory.length && { opacity: 0.3 }]}
                    onPress={doUndo}
                    disabled={!dateHistory.length || swiping}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="arrow-undo" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionItem, styles.cardActionSkip]}
                    onPress={() => doSkip(0.5)}
                    disabled={swiping}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={24} color={Colors.red} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cardActionItem}
                    onPress={() => doMessageRef.current?.()}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubble-outline" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cardActionItem, styles.cardActionWant]}
                    onPress={() => doWant(0.5)}
                    disabled={swiping}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="heart" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </>
        )}
      </View>


      <MetroStationPicker
        visible={filterPicker}
        selectedStation={filterStation}
        onSelect={s => setFilterStation(s)}
        onClose={() => setFilterPicker(false)}
      />

      {/* Detail modal */}
      <VacancyDetailModal
        vacancy={detailVacancy}
        visible={!!detailVacancy}
        employer={detailEmployer}
        onClose={() => { setDetailVacancy(null); setDetailEmployer(null); }}
        actions={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={styles.detailSkipBtn}
              onPress={() => { setDetailVacancy(null); doSkip(0.5); }}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="close" size={16} color={Colors.red} />
                <Text style={styles.detailSkipTxt}>Не подходит</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.detailWantBtn}
              onPress={() => { setDetailVacancy(null); doWant(0.5); }}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="heart" size={16} color="#fff" />
                <Text style={styles.detailWantTxt}>Хочу!</Text>
              </View>
            </TouchableOpacity>
          </View>
        }
      />

      <ApplySheet
        visible={!!applyFor}
        onClose={() => setApplyFor(null)}
        onSend={sendApply}
        title="Отклик на смену"
        info={applyFor ? vacancyInfoLines(applyFor) : []}
        chips={getChatSuggestions('worker', applyFor)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────
// Worker Permanent mode
// ─────────────────────────────────────────────────
type PermTab = 'open' | 'applied' | 'saved';

const SALARY_CHIPS = [
  { label: 'Любая', value: 0 },
  { label: '30 000+', value: 30000 },
  { label: '50 000+', value: 50000 },
  { label: '80 000+', value: 80000 },
  { label: '100 000+', value: 100000 },
];

function WorkerPermMode() {
  const router = useRouter();
  const {
    currentUser, users, permVacancies, permApplications,
    refreshPermVacancies, refreshPermApplications,
    chats, refreshChats,
    showToast, permVacancyViewsMap, refreshPermVacancyViews,
    permSavedIds, optimisticAddPermSaved, optimisticRemovePermSaved,
  } = useApp();
  const tabBarHeight = useBottomTabBarHeight();

  const [tab, setTab] = useState<PermTab>('open');
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterStation, setFilterStation] = useState<string | null>(null);
  const [filterPicker, setFilterPicker] = useState(false);
  const [minSalary, setMinSalary] = useState(0);
  const [applying, setApplying] = useState<string | null>(null);
  // Вакансия, по которой человек сейчас пишет отклик (null — окно закрыто)
  const [permApplyFor, setPermApplyFor] = useState<PermVacancy | null>(null);
  const [chatLoading, setChatLoading] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [externalVacancies, setExternalVacancies] = useState<ExternalVacancy[]>([]);

  const loadExternalVacancies = useCallback(async () => {
    try {
      const rows = await dbGetExternalVacancies();
      setExternalVacancies(rows.filter(v => v.kind === 'permanent'));
    } catch {
      // Свои вакансии должны продолжить работать, даже если партнёрский фид
      // временно недоступен.
    }
  }, []);

  useEffect(() => { loadExternalVacancies(); }, [loadExternalVacancies]);

  // Вакансии для карты: метка — это адрес, станция остаётся для фильтра
  const permMapItems: MapListItem[] = useMemo(
    () => [
      ...(permVacancies as PermVacancy[])
      .filter((v: PermVacancy) => v.status === 'open' && (!!v.metroStation || !!v.address))
      .map((v: PermVacancy) => ({
        id: v.id,
        station: (v.metroStation ?? '') as string,
        title: v.title,
        company: v.company,
        pay: payShort(v.salary, v.workType),
        meta: v.schedule,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
      })),
      ...externalVacancies
        .filter(v => !!v.metroStation || !!v.address)
        .map(v => ({
          id: `external:${v.id}`,
          station: v.metroStation ?? '',
          title: v.title,
          company: v.company ?? v.sourceName ?? 'Компания',
          pay: v.salary ? `${v.salary.toLocaleString('ru-RU')} ₽/мес` : undefined,
          meta: v.schedule,
          address: v.address,
          lat: v.lat,
          lng: v.lng,
        })),
    ],
    [permVacancies, externalVacancies],
  );

  const viewedPermIds = useRef(new Set<string>());
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const uid = currentUserRef.current?.id;
    if (!uid) return;
    viewableItems.forEach(({ item }: any) => {
      if (item && 'sourceId' in item) return;
      if (item?.id && !viewedPermIds.current.has(item.id)) {
        viewedPermIds.current.add(item.id);
        dbRecordPermVacancyView(item.id, uid).catch(() => {});
      }
    });
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshPermVacancies(), refreshPermApplications(), refreshPermVacancyViews(),
      loadExternalVacancies(),
    ]);
    setRefreshing(false);
  };

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const myApps = permApplications.filter(a => a.workerId === currentUser.id);
  const myAppVacIds = new Set(myApps.map(a => a.vacancyId));
  const getAppStatus = (vacId: string) => myApps.find(a => a.vacancyId === vacId)?.status ?? null;

  const matchesSearch = (v: PermVacancy) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return v.title.toLowerCase().includes(q) || v.company.toLowerCase().includes(q);
  };
  const matchesFilters = (v: PermVacancy) => {
    if (filterStation && v.metroStation !== filterStation) return false;
    if (minSalary > 0 && v.salary < minSalary) return false;
    return true;
  };

  const openVacancies    = permVacancies.filter(v => v.status === 'open' && !myAppVacIds.has(v.id) && matchesSearch(v) && matchesFilters(v));
  const externalOpenVacancies = externalVacancies.filter(v => {
    if (filterStation && v.metroStation !== filterStation) return false;
    if (minSalary > 0 && (v.salary ?? 0) < minSalary) return false;
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return v.title.toLowerCase().includes(q)
      || (v.company ?? v.sourceName ?? '').toLowerCase().includes(q);
  });
  // Отказ больше не прячется в отдельную вкладку: отклик остаётся здесь,
  // просто с красной плашкой «✕ Отказ» — иначе вакансия исчезала без объяснений
  const appliedVacancies = permVacancies.filter(v => myAppVacIds.has(v.id) && matchesSearch(v) && matchesFilters(v));
  const savedVacancies   = permVacancies.filter(v => permSavedIds.includes(v.id) && matchesSearch(v) && matchesFilters(v));

  const shownVacancies: (PermVacancy | ExternalVacancy)[] =
    tab === 'open'     ? [...openVacancies, ...externalOpenVacancies] :
    tab === 'applied'  ? appliedVacancies :
    savedVacancies;

  // Отклик на постоянную вакансию раньше уходил молча — строка в таблице со
  // статусом «ожидает», и всё. Теперь сначала спрашиваем пару слов о себе, и
  // отклик открывает переписку: сказать о себе было негде, а именно сюда
  // приходит большая часть откликов.
  const applyTo = (v: PermVacancy) : void => {
    if (!currentUser) return;
    if (myAppVacIds.has(v.id) || applying === v.id) { showToast('Уже откликнулись', 'success'); return; }
    setPermApplyFor(v);
  };

  const sendPermApply = async (message: string) => {
    const v = permApplyFor;
    if (!v || !currentUser) return;
    setApplying(v.id);
    try {
      await dbApplyPermVacancy(v.id, currentUser.id, v.employerId, message);
      showToast('Отклик отправлен', 'success');
      setPermApplyFor(null);
      await Promise.all([
        refreshPermApplications().catch(() => {}),
        refreshChats().catch(() => {}),
      ]);
      notifyEmployerNewMessage(
        v.employerId,
        `${currentUser.firstName} ${currentUser.lastName}`,
        message,
      ).catch(() => {});
    } catch (e) {
      console.warn('[applyTo]', e);
      showToast('Не удалось отправить отклик', 'error');
    } finally {
      setApplying(null);
    }
  };

  const openPermChat = async (v: PermVacancy, displayCompany: string) => {
    if (!currentUser || chatLoading) return;
    // Check if chat already exists
    const existing = chats.find(c => c.employerId === v.employerId && c.workerId === currentUser.id);
    if (existing) {
      router.push({ pathname: '/chat-room', params: { chatId: existing.id } });
      return;
    }
    setChatLoading(v.id);
    try {
      const chatId = await dbCreateChat(
        currentUser.id,
        v.employerId,
        v.id,
        v.title,
        displayCompany,
      );
      refreshChats().catch(() => {});
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch {
      showToast('Ошибка при открытии чата', 'error');
    } finally {
      setChatLoading(null);
    }
  };

  // Тот же набор, что видит директор в своей шторке, — и так же иконками,
  // а не смайликами: их рисует система, и на каждом телефоне по-своему.
  const STATUS_MAP: Record<string, { label: string; icon: IconName; color: string; bg: string }> = {
    pending:  { label: 'На рассмотрении', icon: 'hourglass-outline', color: '#92400E',    bg: '#FFF7ED' },
    approved: { label: 'Приглашён',       icon: 'checkmark-circle',  color: Colors.green, bg: '#D1FAE5' },
    rejected: { label: 'Отказ',           icon: 'close-circle',      color: Colors.red,   bg: '#FEE2E2' },
  };

  const activeStationLine = filterStation
    ? METRO_LINES.find(l => l.stations.includes(filterStation)) ?? null
    : null;

  const TAB_CONFIG: { key: PermTab; label: string; count: number }[] = [
    { key: 'open',    label: 'Открытые',     count: openVacancies.length + externalOpenVacancies.length },
    { key: 'applied', label: 'Откликнулись', count: appliedVacancies.length },
    { key: 'saved',   label: 'Избранное',    count: savedVacancies.length },
  ];

  const toggleSaved = (v: PermVacancy) => {
    if (!currentUser) return;
    if (permSavedIds.includes(v.id)) {
      optimisticRemovePermSaved(v.id);
      dbRemovePermSaved(currentUser.id, v.id).catch(() => {});
      showToast('Удалено из избранного', 'success');
    } else {
      optimisticAddPermSaved(v.id);
      dbAddPermSaved(currentUser.id, v.id).catch(() => {});
      showToast('Сохранено в избранное', 'success');
    }
  };

  const shareVacancy = async (v: PermVacancy) => {
    // Ссылку строим от того адреса, с которого открыто приложение (в вебе):
    // если раздаём с «чистого» имени, то и ссылка «поделиться» должна вести на
    // него, а не на зашитый jobtoo.ru, который у получателя в РФ режет фильтр.
    const base =
      Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : (process.env.EXPO_PUBLIC_API_URL || 'https://jobtoo.ru').trim().replace(/\/+$/, '');
    const url = `${base}/perm-vacancy-detail?vacancyId=${v.id}`;
    try {
      // iOS: pass url only — system appends it cleanly, no duplicate text
      // Android: url param is ignored, pass as message
      await Share.share(
        Platform.OS === 'ios' ? { url } : { message: url }
      );
    } catch {}
  };

  const renderPerm = ({ item: v }: { item: PermVacancy | ExternalVacancy }) => {
    const isExternal = 'sourceId' in v;
    if (isExternal) {
      const company = v.company ?? v.sourceName ?? 'Компания';
      const openExternal = async () => {
        dbRecordExternalClick(v.id, v.sourceId, currentUser.id).catch(() => {});
        try {
          await Linking.openURL(v.url);
        } catch {
          showToast('Не удалось открыть вакансию', 'error');
        }
      };
      return (
        <TouchableOpacity style={pS.card} onPress={openExternal} activeOpacity={0.9}>
          <View style={pS.externalHead}>
            <View style={{ flex: 1 }}>
              <Text style={pS.jobTitle} numberOfLines={2}>{v.title}</Text>
              <Text style={pS.companyName} numberOfLines={1}>{company}</Text>
            </View>
            <View style={pS.externalBadge}>
              <Text style={pS.externalBadgeTxt}>{v.sourceName ?? 'Партнёр'}</Text>
            </View>
          </View>
          {v.salary ? <Text style={pS.salaryMain}>{v.salary.toLocaleString('ru-RU')} ₽/мес</Text> : null}
          {(v.metroStation || v.metroStationRaw || v.address) ? (
            <View style={pS.locationRow}>
              <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
              <Text style={pS.locationRowText} numberOfLines={2}>
                {[v.metroStation ?? v.metroStationRaw, v.address].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
          {v.schedule ? <Text style={pS.desc} numberOfLines={2}>{v.schedule}</Text> : null}
          <View style={pS.externalAction}>
            <Text style={pS.externalActionTxt}>Открыть у источника</Text>
            <Ionicons name="open-outline" size={15} color={Colors.primary} />
          </View>
        </TouchableOpacity>
      );
    }

    const isApplied = myAppVacIds.has(v.id);
    const isApplying = applying === v.id;
    const isSaved = permSavedIds.includes(v.id);
    const appStatus = getAppStatus(v.id);
    const statusInfo = appStatus ? STATUS_MAP[appStatus] : null;
    const metroLine = v.metroStation
      ? METRO_LINES.find(l => l.stations.includes(v.metroStation!)) ?? null
      : null;

    const displayCompany = normalizeCompany(v.company);

    return (
      <TouchableOpacity
        style={pS.card}
        onPress={() => router.push({ pathname: '/perm-vacancy-detail', params: { vacancyId: v.id } })}
        activeOpacity={0.92}
      >
        {statusInfo ? (
          <View style={[pS.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Ionicons name={statusInfo.icon} size={rf(12)} color={statusInfo.color} />
            <Text style={[pS.statusTxt, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        ) : null}

        {/* Company row */}
        <View style={pS.companyRow}>
          <CompanyMark company={v.company} size={42} />
          <View style={pS.companyMeta}>
            <Text style={pS.companyName} numberOfLines={1}>{displayCompany}</Text>
            <View style={pS.verifiedRow}>
              <View style={pS.verifiedBadge}>
                <Ionicons name="checkmark" size={9} color="#fff" />
              </View>
              <Text style={pS.verifiedTxt}>Проверено</Text>
            </View>
          </View>
        </View>

        {/* Title */}
        <Text style={pS.jobTitle} numberOfLines={2}>{v.title}</Text>

        {/* Salary */}
        <View style={pS.salaryRow}>
          <Text style={pS.salaryMain}>{v.salary.toLocaleString('ru-RU')} ₽/мес</Text>
          <View style={pS.naRukiBadge}>
            <Text style={pS.naRukiTxt}>На руки</Text>
          </View>
        </View>

        {/* Metro + address */}
        {(v.metroStation || v.address) ? (
          <View style={pS.locationRow}>
            {v.metroStation ? (
              <View style={pS.locationItem}>
                <View style={[pS.metroCircle, { backgroundColor: metroLine?.color ?? Colors.primary }]}>
                  <Text style={pS.metroCircleTxt}>М</Text>
                </View>
                <Text style={pS.locationTxt} numberOfLines={1}>{v.metroStation}</Text>
              </View>
            ) : null}
            {v.address ? (
              <View style={pS.addressLocationItem}>
                <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                <Text style={pS.locationRowText} numberOfLines={2}>{v.address}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Schedule */}
        {v.schedule ? (
          <View style={pS.scheduleRow}>
            <View style={pS.locationItem}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
              <Text style={pS.locationTxt}>{v.schedule}</Text>
            </View>
          </View>
        ) : null}

        {/* Description */}
        {v.description ? (
          <Text style={pS.desc} numberOfLines={2}>{v.description}</Text>
        ) : null}

        {/* Views */}
        <View style={pS.viewsRow}>
          <Ionicons name="eye-outline" size={13} color={Colors.textMuted} />
          <Text style={pS.viewsTxt}>{permVacancyViewsMap[v.id] ?? 0} просмотрели</Text>
        </View>

        {/* Actions */}
        <View style={pS.actionRow}>
          <TouchableOpacity
            style={[pS.applyBtn, isApplied && pS.applyBtnDone, isApplying && { opacity: 0.6 }]}
            onPress={(e) => { e.stopPropagation?.(); applyTo(v); }}
            disabled={isApplied || isApplying}
            activeOpacity={0.8}
          >
            <Text style={[pS.applyBtnTxt, isApplied && { color: Colors.green }]}>
              {isApplied ? '✓ Отклик отправлен' : 'Откликнуться'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[pS.actionIconBtn, chatLoading === v.id && { opacity: 0.5 }]}
            onPress={(e) => { e.stopPropagation?.(); openPermChat(v, displayCompany); }}
            disabled={chatLoading === v.id}
            activeOpacity={0.8}
          >
            {chatLoading === v.id
              ? <ActivityIndicator size={14} color={Colors.textSecondary} />
              : <Ionicons name="chatbubble-outline" size={17} color={Colors.textSecondary} />
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={pS.actionIconBtn}
            onPress={(e) => { e.stopPropagation?.(); shareVacancy(v); }}
            activeOpacity={0.8}
          >
            <Ionicons name="share-outline" size={17} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[pS.actionIconBtn, isSaved && pS.actionIconBtnSaved]}
            onPress={(e) => { e.stopPropagation?.(); toggleSaved(v); }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isSaved ? 'heart' : 'heart-outline'}
              size={17}
              color={isSaved ? Colors.red : Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const emptyMessages: Record<PermTab, { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }> = {
    open:     { icon: 'search-outline', title: 'Нет открытых вакансий', sub: 'Попробуйте изменить фильтры' },
    applied:  { icon: 'paper-plane-outline', title: 'Нет откликов', sub: 'Откликайтесь на вакансии во вкладке «Открытые»' },
    saved:    { icon: 'heart-outline', title: 'Пока пусто', sub: 'Нажмите ♥ на вакансии — она сохранится здесь' },
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search + Filters */}
      <View style={pS.searchRow}>
        <View style={pS.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={pS.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Поиск вакансий..."
            placeholderTextColor={Colors.textMuted}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[pS.filtersBtn, filterStation ? pS.filtersBtnActive : null]}
          onPress={() => (filterStation ? setFilterStation(null) : setMapOpen(true))}
          activeOpacity={0.8}
        >
          <Ionicons
            name={filterStation ? 'close' : 'map-outline'}
            size={16}
            color={filterStation ? '#FFFFFF' : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {filterStation ? (
        <TouchableOpacity style={pS.activeStationChip} onPress={() => setFilterStation(null)} activeOpacity={0.8}>
          <Ionicons name="location" size={13} color={Colors.primary} />
          <Text style={pS.activeStationTxt}>м. {filterStation}</Text>
          <Ionicons name="close" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      ) : null}

      <MetroMap
        visible={mapOpen}
        title="Вакансии на карте"
        items={permMapItems}
        onSelect={(st) => { setFilterStation(st); setMapOpen(false); }}
        onClose={() => setMapOpen(false)}
      />

      {/* Tab chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={pS.tabChipsRow}
        style={pS.tabChipsScroll}
      >
        {TAB_CONFIG.map(t => {
          const isActive = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[pS.tabChip, isActive && pS.tabChipActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              {t.key === 'saved' ? (
                <Ionicons
                  name="heart"
                  size={13}
                  color={isActive ? Colors.primary : Colors.textMuted}
                />
              ) : null}
              <Text style={[pS.tabChipTxt, isActive && pS.tabChipTxtActive]}>
                {t.label}
              </Text>
              <Text style={[pS.tabChipCount, isActive && pS.tabChipCountActive]}>
                {t.count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {shownVacancies.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name={emptyMessages[tab].icon} size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>{emptyMessages[tab].title}</Text>
          <Text style={styles.emptySubtitle}>{emptyMessages[tab].sub}</Text>
        </View>
      ) : (
        <FlatList
          data={shownVacancies}
          keyExtractor={v => ('sourceId' in v ? `external:${v.id}` : v.id)}
          extraData={{ users, permVacancyViewsMap }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
          renderItem={renderPerm}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
        />
      )}

      <MetroStationPicker
        visible={filterPicker}
        selectedStation={filterStation}
        onSelect={s => setFilterStation(s)}
        onClose={() => setFilterPicker(false)}
      />

      <ApplySheet
        visible={!!permApplyFor}
        onClose={() => setPermApplyFor(null)}
        onSend={sendPermApply}
        title="Отклик на вакансию"
        info={permApplyFor ? permVacancyInfoLines(permApplyFor) : []}
        chips={getChatSuggestions('worker', null)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────
// Employer home — combined Shift + Perm
// ─────────────────────────────────────────────────
function getTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function EmployerHome() {
  const router = useRouter();
  const { currentUser, vacancies, likes, permVacancies, permApplications, refreshVacancies, refreshPermVacancies, refreshPermApplications, refreshLikes, refreshAll, showToast, vacancyStatsMap, permVacancyViewsMap } = useApp();
  const tabBarHeight = useBottomTabBarHeight();
  const fabRef = useRef<View>(null);
  // Способ перемерить кнопку «+» по требованию: одного onLayout мало —
  // первый замер нередко приходит с нулями, и цель не регистрируется.
  const measureFab = useCallback(() => {
    fabRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setOnboardingTarget('fab', { x, y, w, h });
    });
  }, []);
  useEffect(() => registerOnboardingMeasurer('fab', measureFab), [measureFab]);
  const [mode, setMode] = useState<AppMode>('shift');
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  // Смена раздела — это переход в другое место, а не продолжение прежнего.
  // Раньше «Закрытые» тянулись из смен в постоянные вакансии, и человек
  // попадал сразу в архив вместо списка активных.
  const changeMode = (m: AppMode) => { setMode(m); setTab('active'); };
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [workerListModal, setWorkerListModal] = useState<{ vacId: string; type: 'applicants' | 'hired' | 'rejected' } | null>(null);
  const [viewersModal, setViewersModal] = useState<{ id: string; kind: 'shift' | 'perm' } | null>(null);
  const didAutoClose = useRef(false);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [closingPermIds, setClosingPermIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  // Отклики на постоянную вакансию — шторкой поверх списка, а не отдельным
  // экраном: директор смотрит их между делом и возвращается к вакансиям.
  const [appsVacancyId, setAppsVacancyId] = useState<string | null>(null);
  const [deletingPermIds, setDeletingPermIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeletePerm, setConfirmDeletePerm] = useState<string | null>(null);

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (currentUser) refreshLikes(currentUser).catch(() => {});
    }, [currentUser?.id]),
  );

  const todayISO = getTodayISO();
  const myVacancies = vacancies.filter(v => v.employerId === currentUser?.id);
  const myPermVacancies = permVacancies.filter(v => v.employerId === currentUser?.id);

  useEffect(() => {
    if (didAutoClose.current) return;
    const pastOpen = myVacancies.filter(v => v.status === 'open' && v.date < todayISO);
    if (pastOpen.length === 0) return;
    didAutoClose.current = true;
    Promise.all(pastOpen.map(v => dbUpdateVacancy(v.id, { status: 'closed' })))
      .then(() => refreshVacancies())
      .catch(e => console.warn('[EmployerHome] auto-close past vacancies error', e));
  }, [vacancies]);

  const shown = myVacancies.filter(v => {
    if (deletingIds.has(v.id)) return false;
    const isClosing = closingIds.has(v.id);
    if (tab === 'active') return !isClosing && v.status === 'open' && v.date >= todayISO;
    return isClosing || v.status === 'closed' || (v.status === 'open' && v.date < todayISO);
  });

  const shownPerm = myPermVacancies.filter(v => {
    if (deletingPermIds.has(v.id)) return false;
    const isClosing = closingPermIds.has(v.id);
    if (tab === 'active') return !isClosing && v.status === 'open';
    return isClosing || v.status === 'closed';
  });

  const applicantCount = (vacId: string) =>
    likes.filter(l => l.vacancyId === vacId && l.workerLiked && !l.isMatch && l.employerLiked !== false).length;
  const rejectedCount = (vacId: string) =>
    likes.filter(
      l => l.vacancyId === vacId && (
        l.employerLiked === false ||
        (l.workerLiked === false && l.workerSkipped === true)
      )
    ).length;

  const permApplicantCount = (vacId: string) =>
    permApplications.filter(a => a.vacancyId === vacId).length;

  const closeVacancy = (id: string) => {
    if (closingIds.has(id)) return;
    setConfirmClose(null);
    setClosingIds(prev => new Set([...prev, id]));
    showToast('Вакансия закрыта', 'success');
    dbUpdateVacancy(id, { status: 'closed' })
      .then(() => refreshVacancies().catch(() => {}))
      .catch(e => console.warn('[closeVacancy]', e));
  };

  const closePermVacancy = (id: string) => {
    if (closingPermIds.has(id)) return;
    setClosingPermIds(prev => new Set([...prev, id]));
    showToast('Вакансия закрыта', 'success');
    dbClosePermVacancy(id)
      .then(() => refreshPermVacancies().catch(() => {}))
      .catch(e => console.warn('[closePermVacancy]', e));
  };

  const deleteVacancy = (id: string) => {
    setConfirmDelete(null);
    setDeletingIds(prev => new Set([...prev, id]));
    showToast('Вакансия удалена', 'success');
    dbDeleteVacancy(id)
      .then(() => refreshVacancies().catch(() => {}))
      .catch(e => console.warn('[deleteVacancy]', e));
  };

  const deletePermVacancy = (id: string) => {
    setConfirmDeletePerm(null);
    setDeletingPermIds(prev => new Set([...prev, id]));
    showToast('Вакансия удалена', 'success');
    dbDeletePermVacancy(id)
      .then(() => refreshPermVacancies().catch(() => {}))
      .catch(e => console.warn('[deletePermVacancy]', e));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TabHeader tgAnchor />

      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <ModeSwitcher mode={mode} onChange={changeMode} />
      </View>

      <View style={styles.tabs}>
        {(['active', 'closed'] as const).map(t => (
          <TouchableOpacity key={t} style={styles.tabItem2} onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[styles.tabLabel2, tab === t && styles.tabLabelActive]}>{t === 'active' ? 'Активные' : 'Закрытые'}</Text>
            {tab === t ? <View style={styles.tabUnderline} /> : null}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      >
        {mode === 'shift' ? (
          shown.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={52} color={Colors.textMuted} />
              {tab === 'active' ? (
                <>
                  <Text style={styles.emptyTitle}>Нет активных вакансий</Text>
                  <Text style={styles.emptySubtitle}>Создайте первую вакансию</Text>
                  <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/create-vacancy')}>
                    <Text style={styles.createBtnText}>+ Создать смену</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Нет закрытых вакансий</Text>
                  <Text style={styles.emptySubtitle}>Здесь появятся завершённые смены</Text>
                </>
              )}
            </View>
          ) : (
            shown.map(v => (
              <View key={v.id} style={styles.vacCard}>
                <View style={styles.vacTop}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {v.isUrgent ? <View style={styles.urgentBadge}><Ionicons name="flash" size={12} color="#D97706" /></View> : null}
                    <Text style={styles.vacTitle} numberOfLines={1}>{v.title}</Text>
                  </View>
                  <View style={styles.vacTopRight}>
                    <TouchableOpacity
                      style={[styles.editBtn, { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' }]}
                      onPress={() => router.push({ pathname: '/create-vacancy', params: { copyId: v.id } })}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="repeat" size={16} color={Colors.green} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => router.push({ pathname: '/create-vacancy', params: { editId: v.id } })}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                      onPress={() => tab === 'closed' ? setConfirmDelete(v.id) : setConfirmClose(v.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.red} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.vacMeta}>м. {v.metroStation} · {formatDate(v.date)} · {v.timeStart}–{v.timeEnd}</Text>
                {v.address ? <Text style={styles.vacAddress}>{v.address}</Text> : null}

                <View style={styles.statsRow}>
                  {[
                    { num: applicantCount(v.id), label: 'Отклики', color: Colors.blue, onTap: () => setWorkerListModal({ vacId: v.id, type: 'applicants' }) },
                    { num: rejectedCount(v.id), label: 'Отклонено', color: Colors.red, onTap: () => setWorkerListModal({ vacId: v.id, type: 'rejected' }) },
                    { num: vacancyStatsMap[v.id]?.views ?? 0, label: 'Просмотрели', color: Colors.textMuted, onTap: () => setViewersModal({ id: v.id, kind: 'shift' }) },
                  ].map((s, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.statBox}
                      onPress={s.onTap}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                      <Text style={styles.statTap}>↗</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.vacProgress}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, (v.workersFound / v.workersNeeded) * 100)}%` }]} />
                </View>
              </View>
            ))
          )
        ) : (
          shownPerm.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={52} color={Colors.textMuted} />
              {tab === 'active' ? (
                <>
                  <Text style={styles.emptyTitle}>Нет постоянных вакансий</Text>
                  <Text style={styles.emptySubtitle}>Создайте первую вакансию на постоянную работу</Text>
                  <TouchableOpacity style={[styles.createBtn, { borderColor: '#7C3AED' }]} onPress={() => router.push('/create-perm-vacancy')}>
                    <Text style={[styles.createBtnText, { color: '#7C3AED' }]}>+ Создать вакансию</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Нет закрытых вакансий</Text>
                  <Text style={styles.emptySubtitle}>Здесь появятся завершённые вакансии</Text>
                </>
              )}
            </View>
          ) : (
            shownPerm.map(v => (
              <View key={v.id} style={[styles.vacCard, pS.permVacCard]}>
                <View style={styles.vacTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vacTitle} numberOfLines={1}>{v.title}</Text>
                    <Text style={pS.permCompany}>{normalizeCompany(v.company)}</Text>
                  </View>
                  <View style={styles.vacTopRight}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => router.push({ pathname: '/create-perm-vacancy', params: { editId: v.id } })}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                      onPress={() => tab === 'closed' ? setConfirmDeletePerm(v.id) : closePermVacancy(v.id)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.red} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={pS.permMetaRow}>
                  {v.metroStation ? <Text style={styles.vacMeta}>м. {v.metroStation}</Text> : null}
                  {v.address ? <Text style={styles.vacAddress} numberOfLines={2}>{v.address}</Text> : null}
                </View>
                <View style={pS.permTagsRow}>
                  <View style={pS.permSalaryTag}>
                    <Text style={pS.permSalaryTxt}>{v.salary.toLocaleString('ru-RU')} ₽/мес</Text>
                  </View>
                  <View style={pS.permScheduleTag}>
                    <Ionicons name="calendar-outline" size={rf(13)} color={Colors.textSecondary} />
                    <Text style={pS.permScheduleTxt}>{v.schedule}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={pS.appStatBtn}
                  onPress={() => setAppsVacancyId(v.id)}
                  activeOpacity={0.8}
                >
                  <Text style={pS.appStatNum}>{permApplicantCount(v.id)}</Text>
                  <Text style={pS.appStatLabel}>откликов</Text>
                  <Text style={pS.appStatArrow}>Посмотреть ↗</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[pS.appStatBtn, { backgroundColor: '#F4F4F5', marginTop: 6 }]}
                  onPress={() => setViewersModal({ id: v.id, kind: 'perm' })}
                  activeOpacity={0.8}
                >
                  <Text style={[pS.appStatNum, { color: Colors.textSecondary }]}>{permVacancyViewsMap[v.id] ?? 0}</Text>
                  <Text style={[pS.appStatLabel, { color: Colors.textSecondary }]}>посмотрели</Text>
                  <Text style={[pS.appStatArrow, { color: Colors.textSecondary }]}>Посмотреть ↗</Text>
                </TouchableOpacity>
              </View>
            ))
          )
        )}
      </ScrollView>

      {workerListModal ? (
        <WorkerListModal
          vacancyId={workerListModal.vacId}
          type={workerListModal.type}
          onClose={() => setWorkerListModal(null)}
        />
      ) : null}

      {viewersModal ? (
        <VacancyViewersModal
          vacancyId={viewersModal.id}
          kind={viewersModal.kind}
          onClose={() => setViewersModal(null)}
        />
      ) : null}

      {confirmClose ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Закрыть вакансию?</Text>
            <Text style={styles.confirmBody}>Вакансия будет перемещена в архив</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmClose(null)}><Text style={styles.cancelBtnText}>Отмена</Text></TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={() => closeVacancy(confirmClose)}><Text style={styles.confirmBtnText}>Закрыть</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {confirmDelete ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Удалить вакансию?</Text>
            <Text style={styles.confirmBody}>Вакансия будет полностью удалена из истории</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDelete(null)}><Text style={styles.cancelBtnText}>Отмена</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#EF4444' }]} onPress={() => deleteVacancy(confirmDelete)}><Text style={styles.confirmBtnText}>Удалить</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {confirmDeletePerm ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Удалить вакансию?</Text>
            <Text style={styles.confirmBody}>Вакансия будет полностью удалена из истории</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDeletePerm(null)}><Text style={styles.cancelBtnText}>Отмена</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#EF4444' }]} onPress={() => deletePermVacancy(confirmDeletePerm)}><Text style={styles.confirmBtnText}>Удалить</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {appsVacancyId ? (
        <PermApplicationsSheet vacancyId={appsVacancyId} onClose={() => setAppsVacancyId(null)} />
      ) : null}

      {/* Плавающая кнопка создания — видна и когда вакансии уже есть */}
      <TouchableOpacity
        ref={fabRef}
        onLayout={measureFab}
        style={[
          styles.fab,
          { bottom: tabBarHeight + 14, backgroundColor: mode === 'shift' ? Colors.primary : '#7C3AED' },
        ]}
        onPress={() => router.push(mode === 'shift' ? '/create-vacancy' : '/create-perm-vacancy')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────
// Worker Home (wrapper with mode switcher)
// ─────────────────────────────────────────────────
function WorkerHome() {
  const [mode, setMode] = useState<AppMode>('shift');
  const { currentUser } = useApp();

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TabHeader tgAnchor />
      <View style={styles.modeSwitcherRow}>
        <ModeSwitcher mode={mode} onChange={setMode} modes={['shift', 'perm']} />
      </View>
      {mode === 'shift' ? <WorkerFeed /> : <WorkerPermMode />}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────
export default function HomeScreen() {
  const app = useApp();
  const currentUser = app?.currentUser ?? null;
  if (!currentUser) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  }
  return currentUser.role === 'worker' ? <WorkerHome /> : <EmployerHome />;
}

// ─────────────────────────────────────────────────
// Permanent mode styles
// ─────────────────────────────────────────────────
const pS = StyleSheet.create({
  // — search row —
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8),
    paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(6),
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(6),
    borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: rs(10),
    paddingHorizontal: rs(10), paddingVertical: rs(7), backgroundColor: Colors.bg,
  },
  searchInput: { flex: 1, fontSize: rf(13), color: Colors.textPrimary },
  searchClear: { fontSize: rf(13), color: Colors.textMuted },
  filtersBtn: {
    width: rs(42), height: rs(42), alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: rs(10),
    backgroundColor: Colors.bg,
  },
  filtersBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  activeStationChip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6), alignSelf: 'flex-start',
    marginHorizontal: rs(16), marginBottom: rs(4),
    backgroundColor: Colors.primaryLight, borderRadius: rs(100), paddingHorizontal: rs(12), paddingVertical: rs(6),
  },
  activeStationTxt: { fontSize: rf(13), fontWeight: '700', color: Colors.primary },

  // — tab chips —
  tabChipsScroll: {
    flexGrow: 0, flexShrink: 0, alignSelf: 'stretch',
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  tabChipsRow: {
    flexDirection: 'row', gap: rs(8),
    paddingHorizontal: rs(16), paddingVertical: rs(10),
  },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5),
    borderRadius: rs(100), paddingHorizontal: rs(12), paddingVertical: rs(8),
    borderWidth: 1.5, borderColor: Colors.inputBorder,
    backgroundColor: Colors.bg, flexShrink: 0,
  },
  tabChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  tabChipTxt: { fontSize: rf(13), fontWeight: '500', color: Colors.textSecondary },
  tabChipTxtActive: { color: Colors.primary, fontWeight: '700' },
  tabChipCount: { fontSize: rf(13), fontWeight: '600', color: Colors.textMuted },
  tabChipCountActive: { color: Colors.primary },

  // — card —
  card: {
    backgroundColor: Colors.bg, borderRadius: rs(18),
    padding: rs(16), gap: rs(10), ...Shadow.card,
  },
  externalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
  externalBadge: {
    maxWidth: rs(110), paddingHorizontal: rs(8), paddingVertical: rs(4),
    borderRadius: rs(100), backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.divider,
  },
  externalBadgeTxt: { fontSize: rf(11), fontWeight: '700', color: Colors.textMuted },
  externalAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: rs(5),
    paddingTop: rs(2),
  },
  externalActionTxt: { fontSize: rf(13), fontWeight: '700', color: Colors.primary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: rs(5), borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(6), alignSelf: 'flex-start' },
  statusTxt: { fontSize: rf(12), fontWeight: '700' },

  // company row
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  companyAvatar: {
    width: rs(42), height: rs(42), borderRadius: rs(12),
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  companyAvatarTxt: { fontSize: rf(16), fontWeight: '800', color: '#fff' },
  companyMeta: { flex: 1 },
  companyName: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4), marginTop: rs(2) },
  verifiedBadge: {
    width: rs(14), height: rs(14), borderRadius: rs(7),
    backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
  },
  verifiedTxt: { fontSize: rf(11), color: Colors.textMuted },
  saveBtn: { padding: rs(4) },

  // title & salary
  jobTitle: { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, lineHeight: rf(28) },
  salaryRow: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
  salaryMain: { fontSize: rf(20), fontWeight: '800', color: Colors.primary },
  naRukiBadge: {
    backgroundColor: '#D1FAE5', borderRadius: rs(100),
    paddingHorizontal: rs(10), paddingVertical: rs(4),
  },
  naRukiTxt: { fontSize: rf(12), fontWeight: '700', color: Colors.green },

  // location row
  locationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(10), maxWidth: '100%' },
  locationItem: { flexDirection: 'row', alignItems: 'center', gap: rs(5), minWidth: 0, maxWidth: '100%' },
  addressLocationItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rs(5),
    flexBasis: '100%', minWidth: 0, maxWidth: '100%',
  },
  metroCircle: {
    width: rs(18), height: rs(18), borderRadius: rs(9),
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  metroCircleTxt: { fontSize: rf(10), fontWeight: '900', color: '#fff', lineHeight: rf(12) },
  locationTxt: { fontSize: rf(13), color: Colors.textSecondary, fontWeight: '500', flexShrink: 1 },
  locationRowText: {
    flex: 1, minWidth: 0, fontSize: rf(13), color: Colors.textSecondary,
    fontWeight: '500', lineHeight: rf(18),
  },

  // schedule row
  scheduleRow: { flexDirection: 'row', gap: rs(16) },

  // desc
  desc: { fontSize: rf(13), color: Colors.textMuted, lineHeight: rf(19) },

  // action row
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: rs(8), marginTop: rs(2) },
  applyBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: rs(100),
    paddingVertical: rs(13), alignItems: 'center',
  },
  applyBtnDone: { backgroundColor: '#D1FAE5' },
  applyBtnTxt: { color: '#fff', fontSize: rf(14), fontWeight: '700' },
  actionIconBtn: {
    width: rs(44), height: rs(44), borderRadius: rs(100),
    borderWidth: 1.5, borderColor: Colors.inputBorder,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bg,
  },
  actionIconBtnSaved: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },

  // views row
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4), marginBottom: rs(10) },
  viewsTxt: { fontSize: rf(12), color: Colors.textMuted },


  // Employer-side perm card styles (used in EmployerHome)
  permVacCard: { borderLeftWidth: 3, borderLeftColor: '#7C3AED' },
  permCompany: { fontSize: rf(12), color: Colors.textMuted, marginTop: rs(2) },
  permMetaRow: { gap: rs(2), minWidth: 0, maxWidth: '100%' },
  permTagsRow: { flexDirection: 'row', gap: rs(10), flexWrap: 'wrap' },
  permSalaryTag: { backgroundColor: '#D1FAE5', borderRadius: rs(100), paddingHorizontal: rs(12), paddingVertical: rs(5) },
  permSalaryTxt: { fontSize: rf(13), fontWeight: '800', color: Colors.green },
  permScheduleTag: { flexDirection: 'row', alignItems: 'center', gap: rs(5), backgroundColor: Colors.surface, borderRadius: rs(100), paddingHorizontal: rs(12), paddingVertical: rs(5) },
  permScheduleTxt: { fontSize: rf(13), color: Colors.textSecondary, fontWeight: '500' },
  appStatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6),
    backgroundColor: '#EDE9FE', borderRadius: rs(10), padding: rs(10),
  },
  appStatNum: { fontSize: rf(20), fontWeight: '800', color: '#7C3AED' },
  appStatLabel: { fontSize: rf(12), color: '#7C3AED', flex: 1 },
  appStatArrow: { fontSize: rf(12), color: '#7C3AED', fontWeight: '600' },

  // legacy (used by WorkerFeed M-button)
  filterLineDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  metroIconWrap: {
    width: rs(30), height: rs(30), borderRadius: rs(15),
    borderWidth: 2.5, borderColor: '#111111',
    alignItems: 'center', justifyContent: 'center',
  },
  metroIconText: { fontSize: rf(14), fontWeight: '900', color: '#111111', lineHeight: rf(17) },
  inlineFilter: {
    width: rs(44), height: rs(44), borderRadius: rs(12), marginRight: rs(8),
    borderWidth: 1.5, borderColor: Colors.inputBorder,
    backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  inlineFilterActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
});

// ─────────────────────────────────────────────────
// Shared styles (shift mode)
// ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  companyFallback: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  companyFallbackText: { color: '#fff', fontSize: rf(15), fontWeight: '800' },
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rs(16), paddingVertical: rs(12),
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  logo: { fontSize: rf(20) },
  logoB: { fontWeight: '800', color: Colors.textPrimary },
  logoO: { fontWeight: '800', color: Colors.primary },
  addBtn: { backgroundColor: Colors.primary, borderRadius: rs(100), paddingHorizontal: rs(16), paddingVertical: rs(8) },
  addBtnText: { color: '#fff', fontSize: rf(13), fontWeight: '700' },
  dateStrip: { borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.bg },
  activeStationChip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6), alignSelf: 'flex-start',
    marginHorizontal: rs(16), marginTop: rs(10),
    backgroundColor: Colors.primaryLight, borderRadius: rs(100), paddingHorizontal: rs(12), paddingVertical: rs(6),
  },
  activeStationTxt: { fontSize: rf(13), fontWeight: '700', color: Colors.primary },
  dateStripInner: { flexDirection: 'row', alignItems: 'center' },
  dateRow: { paddingHorizontal: rs(12), paddingVertical: rs(10), gap: rs(8), flexDirection: 'row' },
  modeSwitcherRow: { paddingHorizontal: rs(16), paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: Colors.divider },
  dateChip: { width: rs(48), height: rs(64), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center' },
  dateChipActive: { backgroundColor: Colors.primary, borderRadius: rs(14) },
  dcDay: { fontSize: rf(10), fontWeight: '600', textTransform: 'uppercase', color: Colors.textMuted },
  dcDayActive: { color: '#fff' },
  dcNum: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary },
  dcNumActive: { color: '#fff' },
  dcCnt: { fontSize: rf(10), fontWeight: '700', color: Colors.primary },
  dcCntActive: { color: 'rgba(255,255,255,0.8)' },
  cardArea: { flex: 1, flexDirection: 'column', paddingHorizontal: rs(10), paddingTop: rs(10), paddingBottom: rs(80) },
  ghost1: { position: 'absolute', left: rs(10), right: rs(10), top: rs(10), bottom: rs(80), backgroundColor: Colors.bg, borderRadius: Radius.xl, transform: [{ scale: 0.97 }, { translateY: 6 }], opacity: 0.5, zIndex: 0, ...Shadow.card },
  ghost2: { position: 'absolute', left: rs(10), right: rs(10), top: rs(10), bottom: rs(80), backgroundColor: Colors.bg, borderRadius: Radius.xl, transform: [{ scale: 0.94 }, { translateY: 12 }], opacity: 0.3, zIndex: 0, ...Shadow.card },
  cardAnimated: { flex: 1, zIndex: 1, elevation: 10 },
  card: { flex: 1, backgroundColor: Colors.bg, borderRadius: Radius.xl, ...Shadow.strong, overflow: 'hidden', borderWidth: 1, borderColor: Colors.inputBorder },
  wantOverlay: { position: 'absolute', top: rs(20), left: rs(20), zIndex: 10, backgroundColor: Colors.green, borderRadius: rs(10), paddingHorizontal: rs(14), paddingVertical: rs(8), transform: [{ rotate: '-10deg' }] },
  wantText: { color: '#fff', fontSize: rf(20), fontWeight: '800' },
  skipOverlay: { position: 'absolute', top: rs(20), right: rs(20), zIndex: 10, backgroundColor: Colors.red, borderRadius: rs(10), paddingHorizontal: rs(14), paddingVertical: rs(8), transform: [{ rotate: '10deg' }] },
  skipText: { color: '#fff', fontSize: rf(20), fontWeight: '800' },
  cardTop: { padding: rs(14), paddingBottom: rs(12), gap: rs(10) },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: rs(12) },
  avatar: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarImg: { width: rs(44), height: rs(44), borderRadius: rs(22), flexShrink: 0 },
  avatarText: { fontSize: rf(17), fontWeight: '700', color: '#fff' },
  companyName: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  metroHint: { fontSize: rf(12), color: Colors.textMuted },
  urgentTag: { flexDirection: 'row', alignItems: 'center', gap: rs(3), backgroundColor: '#FEF3C7', borderRadius: rs(8), paddingHorizontal: rs(8), paddingVertical: rs(4), flexShrink: 0 },
  urgentTagTxt: { fontSize: rf(11), fontWeight: '700', color: '#92400E' },
  metroHintRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4), marginTop: rs(2) },
  jobTitle: { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, lineHeight: rf(28) },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
  addressChip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rs(8),
    backgroundColor: '#FFF7ED', borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(7),
    borderWidth: 1, borderColor: '#FDBA74',
  },
  addressChipIcon: { fontSize: rf(15), marginTop: rs(1) },
  addressChipText: { flex: 1, fontSize: rf(14), fontWeight: '600', color: '#92400E', lineHeight: rf(20) },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: rs(14) },
  cardMiddle: { padding: rs(10), paddingHorizontal: rs(14), gap: rs(8) },
  slotsRow: { flexDirection: 'row' },
  slotInfo: { flex: 1, alignItems: 'center', paddingVertical: rs(2) },
  slotInfoBordered: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.divider },
  slotLabel: { fontSize: rf(11), color: Colors.textMuted, fontWeight: '500', marginTop: rs(2) },
  slotValue: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary },
  progressTrack: { height: rs(5), backgroundColor: Colors.divider, borderRadius: rs(3), overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: rs(3) },
  detailHintRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: rs(6), paddingVertical: rs(10), paddingHorizontal: rs(14),
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  detailHintText: { fontSize: rf(13), fontWeight: '600', color: Colors.primary },
  detailHintArrow: { fontSize: rf(14), color: Colors.primary },
  cardActionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: rs(10), paddingHorizontal: rs(20),
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  cardActionItem: {
    width: rs(46), height: rs(46), borderRadius: rs(14),
    alignItems: 'center', justifyContent: 'center',
  },
  cardActionSkip: { backgroundColor: '#FEF2F2' },
  cardActionWant: { backgroundColor: Colors.primary },
  detailSkipBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.red, borderRadius: rs(100), paddingVertical: rs(13), alignItems: 'center' },
  detailSkipTxt: { color: Colors.red, fontSize: rf(14), fontWeight: '600' },
  detailWantBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: rs(100), paddingVertical: rs(13), alignItems: 'center' },
  detailWantTxt: { color: '#fff', fontSize: rf(14), fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(24), paddingBottom: rs(180) },
  emptyCharContainer: { width: SW - 40, height: Math.round((SW - 40) * 1.216), marginBottom: rs(8) },
  emptyCharImg: { width: '100%', height: '100%' },
  emptyTitle: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: rf(14), color: Colors.textMuted, marginTop: rs(4), textAlign: 'center', lineHeight: rf(20) },
  filterOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, justifyContent: 'flex-end' },
  filterSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: rs(20), borderTopRightRadius: rs(20), paddingBottom: rs(40), maxHeight: '70%' },
  filterSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: rs(16), borderBottomWidth: 1, borderBottomColor: Colors.divider },
  filterSheetTitle: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary },
  filterClose: { fontSize: rf(18), color: Colors.textMuted, padding: rs(4) },
  clearFilterRow: { marginHorizontal: rs(16), marginTop: rs(12), borderWidth: 1.5, borderColor: Colors.red, borderRadius: rs(100), paddingVertical: rs(10), alignItems: 'center' },
  clearFilterTxt: { color: Colors.red, fontSize: rf(14), fontWeight: '600' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: rs(12), paddingHorizontal: rs(16), paddingVertical: rs(12), borderBottomWidth: 1, borderBottomColor: Colors.divider },
  lineRowActive: { backgroundColor: Colors.primaryLight },
  lineDot: { width: rs(12), height: rs(12), borderRadius: rs(6) },
  lineName: { flex: 1, fontSize: rf(15), color: Colors.textPrimary },
  createBtn: { marginTop: rs(20), borderWidth: 1.5, borderColor: Colors.primary, borderRadius: rs(100), paddingHorizontal: rs(24), paddingVertical: rs(10) },
  createBtnText: { color: Colors.primary, fontWeight: '600', fontSize: rf(15) },
  fab: {
    position: 'absolute',
    right: rs(16),
    width: rs(56),
    height: rs(56),
    borderRadius: rs(28),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tabItem2: { flex: 1, alignItems: 'center', paddingVertical: rs(12) },
  tabLabel2: { fontSize: rf(15), fontWeight: '500', color: Colors.textMuted },
  tabLabelActive: { fontWeight: '700', color: Colors.textPrimary },
  tabUnderline: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, backgroundColor: Colors.primary, borderRadius: rs(1) },
  // gap, а не отступы у каждого блока: внутри карточки строки шли вплотную —
  // метро, адрес и плашки с зарплатой слипались в одну кашу.
  vacCard: { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: rs(16), gap: rs(8), ...Shadow.card },
  vacTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(4) },
  vacTopRight: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
  vacTitle: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  urgentBadge: { backgroundColor: '#FEF3C7', borderRadius: rs(100), paddingHorizontal: rs(8), paddingVertical: rs(3) },
  urgentText: { fontSize: rf(12) },
  editBtn: { width: rs(32), height: rs(32), borderRadius: rs(8), backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.inputBorder },
  editBtnText: { fontSize: rf(14) },
  vacMeta: { fontSize: rf(12), color: Colors.textMuted, marginTop: rs(4) },
  vacAddress: { fontSize: rf(12), color: Colors.textMuted, marginTop: rs(2) },
  statsRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(4) },
  // Плитка должна читаться как кнопка: рамка и стрелка в углу. Раньше стрелка
  // была девятого размера и пряталась под подписью — нажать догадывался не всякий.
  statBox: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: rs(10),
    paddingVertical: rs(8), paddingHorizontal: rs(8), alignItems: 'center',
    borderWidth: 1, borderColor: Colors.divider,
  },
  statNum: { fontSize: rf(18), fontWeight: '800' },
  statLabel: { fontSize: rf(10), color: Colors.textMuted, textTransform: 'uppercase', marginTop: rs(2) },
  statTap: { position: 'absolute', top: rs(5), right: rs(7), fontSize: rf(12), fontWeight: '700', color: Colors.primary },
  vacProgress: { height: rs(3), backgroundColor: Colors.divider, borderRadius: rs(2), marginTop: rs(10), overflow: 'hidden' },
  vacActions: { flexDirection: 'row', gap: rs(8), marginTop: rs(12) },
  candBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.blue, borderRadius: rs(100), paddingVertical: rs(8), alignItems: 'center' },
  candBtnText: { color: Colors.blue, fontSize: rf(13), fontWeight: '600' },
  deleteBtn: { width: rs(44), height: rs(36), borderWidth: 1.5, borderColor: Colors.red, borderRadius: rs(10), alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: rf(16) },
  confirmOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: rs(24) },
  confirmCard: { backgroundColor: Colors.bg, borderRadius: Radius.xl, padding: rs(28), width: '100%', gap: rs(12) },
  confirmTitle: { fontSize: rf(18), fontWeight: '700', textAlign: 'center', color: Colors.textPrimary },
  confirmBody: { fontSize: rf(14), color: Colors.textSecondary, textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: rs(100), paddingVertical: rs(14), alignItems: 'center' },
  cancelBtnText: { fontSize: rf(15), fontWeight: '600', color: Colors.textSecondary },
  confirmBtn: { flex: 1, backgroundColor: Colors.red, borderRadius: rs(100), paddingVertical: rs(14), alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
});
