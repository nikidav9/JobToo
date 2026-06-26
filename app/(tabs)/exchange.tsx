import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, FlatList, ActivityIndicator, RefreshControl, Modal, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Colors, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { Bulletin, WorkerSlot } from '@/constants/types';
import { dbRespondToBulletin, dbCreateBulletin, dbCloseBulletin, dbIncrementBulletinViews, dbCreateWorkerSlot, dbCloseWorkerSlot, dbContactWorkerSlot } from '@/services/db';
import { notifyAllWorkersNewBulletin, notifyEmployerNewMessage, notifyWorkerNewMessage } from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { METRO_LINES } from '@/constants/metro';
import { NotifBell } from '@/components/ui/NotifBell';
import { WORK_TYPE_META } from '@/components/feature/WorkTypeSelector';

// ─── Date/time helpers ────────────────────────────────────────────────────────

function pad2(n: number) { return n.toString().padStart(2, '0'); }
function formatDisplayDate(d: Date) { return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`; }
function formatISODate(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function formatTime(d: Date) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function parseISOToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(); dt.setFullYear(y, m - 1, d); dt.setHours(0, 0, 0, 0); return dt;
}
function parseTimeToDate(time: string): Date {
  const [h, min] = time.split(':').map(Number);
  const d = new Date(); d.setHours(h, min, 0, 0); return d;
}

type PickerMode = 'date' | 'timeStart' | 'timeEnd' | null;

// ─── Metro picker ─────────────────────────────────────────────────────────────

const ALL_STATIONS = METRO_LINES.flatMap(l =>
  l.stations.map(s => ({ station: s, lineId: l.id, lineColor: l.color, lineName: l.name }))
).sort((a, b) => a.station.localeCompare(b.station, 'ru'));

function MetroStationPicker({
  visible, selectedStation, onSelect, onClose,
}: {
  visible: boolean;
  selectedStation: string | null;
  onSelect: (station: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ALL_STATIONS.filter(s => s.station.toLowerCase().includes(q)) : ALL_STATIONS;
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={xS.overlay}>
        <View style={xS.sheet}>
          <View style={xS.sheetHeader}>
            <Text style={xS.sheetTitle}>Станция метро</Text>
            <TouchableOpacity onPress={() => { setQuery(''); onClose(); }}>
              <Text style={xS.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={xS.searchRow}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <TextInput
              style={xS.searchInput}
              placeholder="Введите название станции..."
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Text style={{ color: Colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={results}
            keyExtractor={s => s.station}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[xS.stationRow, selectedStation === item.station && xS.stationRowSelected]}
                onPress={() => { onSelect(item.station); setQuery(''); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={[xS.lineDot, { backgroundColor: item.lineColor }]} />
                <Text style={xS.stationName}>{item.station}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Work type picker ─────────────────────────────────────────────────────────

const WORK_TYPE_LIST = (Object.keys(WORK_TYPE_META) as (keyof typeof WORK_TYPE_META)[]).map(k => ({
  key: k,
  label: WORK_TYPE_META[k].label,
  desc: WORK_TYPE_META[k].desc,
}));

function WorkTypePicker({
  visible, selectedLabel, onSelect, onClose,
}: {
  visible: boolean;
  selectedLabel: string | null;
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={xS.overlay}>
        <View style={xS.sheet}>
          <View style={xS.sheetHeader}>
            <Text style={xS.sheetTitle}>Специальность</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={xS.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 10, paddingBottom: 24 }}>
              {WORK_TYPE_LIST.map(wt => {
                const selected = selectedLabel === wt.label;
                return (
                  <TouchableOpacity
                    key={wt.key}
                    style={[xS.wtRow, selected && xS.wtRowSelected]}
                    onPress={() => { onSelect(wt.label); onClose(); }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[xS.wtLabel, selected && xS.wtLabelSelected]}>{wt.label}</Text>
                      <Text style={xS.wtDesc}>{wt.desc}</Text>
                    </View>
                    <View style={[xS.wtCircle, selected && xS.wtCircleSelected]}>
                      {selected && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Onboarding hint card ─────────────────────────────────────────────────────

const HINT_KEY_WORKER = '@birzha_hint_worker_v1';
const HINT_KEY_EMPLOYER = '@birzha_hint_employer_v1';

function BirzhaHint({ role }: { role: 'worker' | 'employer' }) {
  const [visible, setVisible] = useState(false);
  const key = role === 'worker' ? HINT_KEY_WORKER : HINT_KEY_EMPLOYER;

  useEffect(() => {
    AsyncStorage.getItem(key).then(val => { if (!val) setVisible(true); }).catch(() => {});
  }, [key]);

  const dismiss = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(key, '1').catch(() => {});
  }, [key]);

  if (!visible) return null;

  const workerLines = [
    { icon: 'megaphone-outline' as const, text: 'Вкладка «Вакансии» — срочные объявления от работодателей. Нажми «Откликнуться» и сразу открывается чат.' },
    { icon: 'calendar-outline' as const, text: 'Вкладка «Мои смены» — опубликуй когда ты свободен. Укажи специальность, дату, время и метро, и работодатели сами напишут тебе.' },
  ];
  const employerLines = [
    { icon: 'chatbubbles-outline' as const, text: 'Вкладка «Чат» — объявления от всех работодателей. Ты тоже можешь опубликовать своё.' },
    { icon: 'people-outline' as const, text: 'Вкладка «Работники» — работники, которые ищут смену прямо сейчас. Нажми «Написать» и сразу открывается чат.' },
    { icon: 'add-circle-outline' as const, text: 'Вкладка «Активные» — твои объявления и кнопка публикации нового.' },
  ];
  const lines = role === 'worker' ? workerLines : employerLines;

  return (
    <View style={xS.hintCard}>
      <View style={xS.hintHeader}>
        <Text style={xS.hintTitle}>Как работает Биржа</Text>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      {lines.map((l, i) => (
        <View key={i} style={xS.hintRow}>
          <Ionicons name={l.icon} size={18} color={Colors.primary} style={{ marginTop: 1 }} />
          <Text style={xS.hintTxt}>{l.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()]} (${days[d.getDay()]})`;
}

function formatDateShort(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ─── Chat-style bulletin card ─────────────────────────────────────────────────

function BulletinChatCard({
  b,
  respondBtn,
}: {
  b: Bulletin;
  respondBtn?: React.ReactNode;
}) {
  const isClosed = b.status === 'closed';
  const initial = (b.company || '?').charAt(0).toUpperCase();

  return (
    <View style={xS.chatCard}>
      {/* Sender row: avatar + name + badge + time */}
      <View style={xS.chatSenderRow}>
        <View style={[xS.chatAvatar, isClosed && xS.chatAvatarClosed]}>
          <Text style={xS.chatAvatarTxt}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={xS.chatNameLine}>
            <Text style={xS.chatCompany} numberOfLines={1}>{b.company}</Text>
            <Text style={xS.chatTimestamp}>{formatDateShort(b.date)}</Text>
          </View>
          {isClosed ? (
            <View style={xS.closedBadge}>
              <Ionicons name="lock-closed" size={10} color="#6B7280" />
              <Text style={xS.closedBadgeTxt}>Закрыта</Text>
            </View>
          ) : (
            <View style={xS.urgentBadge}>
              <Ionicons name="flash" size={10} color="#92400E" />
              <Text style={xS.urgentTxt}>Срочно</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bubble */}
      <View style={[xS.chatBubble, isClosed && xS.chatBubbleClosed]}>
        <Text style={[xS.chatWorkType, isClosed && xS.chatWorkTypeClosed]}>{b.workType}</Text>
        <View style={xS.metaRow}>
          <View style={xS.metaItem}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
            <Text style={xS.metaTxt}>{formatDateShort(b.date)}</Text>
          </View>
          <View style={xS.metaItem}>
            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
            <Text style={xS.metaTxt}>{b.timeStart}–{b.timeEnd}</Text>
          </View>
          <View style={xS.metaItem}>
            <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
            <Text style={xS.metaTxt}>м. {b.metro}</Text>
          </View>
        </View>
        <View style={xS.metaItem}>
          <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
          <Text style={[xS.metaTxt, { flex: 1 }]} numberOfLines={2}>{b.address}</Text>
        </View>
        {b.comment ? <Text style={xS.comment} numberOfLines={3}>{b.comment}</Text> : null}
        {respondBtn}
      </View>
    </View>
  );
}

// ─── Worker slot card (for employer's "Работники" tab) ───────────────────────

function WorkerSlotCard({
  slot,
  onContact,
  contacting,
  alreadyContacted,
}: {
  slot: WorkerSlot;
  onContact: () => void;
  contacting: boolean;
  alreadyContacted: boolean;
}) {
  const initial = (slot.workerName || '?').charAt(0).toUpperCase();
  return (
    <View style={xS.chatCard}>
      <View style={xS.chatSenderRow}>
        <View style={[xS.chatAvatar, xS.chatAvatarWorker]}>
          <Text style={xS.chatAvatarTxt}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={xS.chatNameLine}>
            <Text style={xS.chatCompany} numberOfLines={1}>{slot.workerName}</Text>
            <Text style={xS.chatTimestamp}>{formatDateShort(slot.date)}</Text>
          </View>
          <View style={xS.availBadge}>
            <Ionicons name="checkmark-circle" size={10} color="#059669" />
            <Text style={xS.availBadgeTxt}>Ищет смену</Text>
          </View>
        </View>
      </View>
      <View style={xS.chatBubble}>
        <Text style={xS.chatWorkType}>{slot.workType}</Text>
        <View style={xS.metaRow}>
          <View style={xS.metaItem}>
            <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
            <Text style={xS.metaTxt}>{slot.timeStart}–{slot.timeEnd}</Text>
          </View>
          <View style={xS.metaItem}>
            <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
            <Text style={xS.metaTxt}>м. {slot.metro}</Text>
          </View>
        </View>
        {slot.comment ? <Text style={xS.comment} numberOfLines={2}>{slot.comment}</Text> : null}
        <TouchableOpacity
          style={[xS.respondBtn, alreadyContacted && xS.respondBtnDone]}
          onPress={onContact}
          disabled={contacting}
          activeOpacity={0.8}
        >
          {contacting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={xS.respondBtnTxt}>{alreadyContacted ? 'Открыть чат' : 'Написать'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Worker view ──────────────────────────────────────────────────────────────

type WorkerSection = 'vacancies' | 'myslots';

function WorkerExchange() {
  const router = useRouter();
  const { currentUser, bulletins, refreshBulletins, chats, refreshChats, workerSlots, refreshWorkerSlots, showToast } = useApp();
  const tabBarHeight = useBottomTabBarHeight();
  const [section, setSection] = useState<WorkerSection>('vacancies');
  const [refreshing, setRefreshing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [viewsMarked, setViewsMarked] = useState(false);

  // Slot form state
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [submittingSlot, setSubmittingSlot] = useState(false);
  const [closingSlotIds, setClosingSlotIds] = useState<Set<string>>(new Set());
  const [slotWorkType, setSlotWorkType] = useState('');
  const [slotDate, setSlotDate] = useState<Date>(() => new Date());
  const [slotTimeStart, setSlotTimeStart] = useState<Date>(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
  const [slotTimeEnd, setSlotTimeEnd] = useState<Date>(() => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; });
  const [slotMetro, setSlotMetro] = useState('');
  const [slotComment, setSlotComment] = useState('');
  const [slotPickerMode, setSlotPickerMode] = useState<PickerMode>(null);
  const [slotIosPickerVisible, setSlotIosPickerVisible] = useState(false);
  const [slotTempDate, setSlotTempDate] = useState<Date>(new Date());
  const [slotMetroPicker, setSlotMetroPicker] = useState(false);
  const [slotWorkTypePicker, setSlotWorkTypePicker] = useState(false);

  useEffect(() => {
    if (!viewsMarked && bulletins.length > 0) {
      bulletins.forEach(b => dbIncrementBulletinViews(b.id).catch(() => {}));
      setViewsMarked(true);
    }
  }, [bulletins]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshBulletins(), refreshWorkerSlots()]);
    setRefreshing(false);
  };

  const respond = async (b: Bulletin) => {
    if (!currentUser || responding) return;
    const existing = chats.find(c => c.bulletinId === b.id && c.workerId === currentUser.id);
    if (existing) {
      router.push({ pathname: '/chat-room', params: { chatId: existing.id } });
      return;
    }
    setResponding(b.id);
    try {
      const chatId = await dbRespondToBulletin(b.id, currentUser.id);
      notifyEmployerNewMessage(
        b.employerId,
        `${currentUser.firstName} ${currentUser.lastName}`,
        `Откликнулся на объявление «${b.workType}»`,
        chatId,
      ).catch(() => {});
      refreshChats().catch(() => {});
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch {
      showToast('Ошибка при отклике', 'error');
    } finally {
      setResponding(null);
    }
  };

  const openSlotPicker = (mode: PickerMode) => {
    if (!mode) return;
    const val = mode === 'date' ? slotDate : mode === 'timeStart' ? slotTimeStart : slotTimeEnd;
    setSlotTempDate(val);
    if (Platform.OS === 'ios') { setSlotPickerMode(mode); setSlotIosPickerVisible(true); }
    else setSlotPickerMode(mode);
  };

  const applySlotPickerDate = (mode: PickerMode, date: Date) => {
    if (mode === 'date') setSlotDate(date);
    else if (mode === 'timeStart') setSlotTimeStart(date);
    else if (mode === 'timeEnd') setSlotTimeEnd(date);
  };

  const onSlotAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setSlotPickerMode(null);
    if (event.type === 'dismissed' || !date) return;
    applySlotPickerDate(slotPickerMode, date);
  };

  const onSlotIOSChange = (_: DateTimePickerEvent, date?: Date) => { if (date) setSlotTempDate(date); };
  const confirmSlotIOS = () => { applySlotPickerDate(slotPickerMode, slotTempDate); setSlotIosPickerVisible(false); setSlotPickerMode(null); };

  const slotPickerDateValue = slotPickerMode === 'date'
    ? (Platform.OS === 'ios' ? slotTempDate : slotDate)
    : slotPickerMode === 'timeStart'
    ? (Platform.OS === 'ios' ? slotTempDate : slotTimeStart)
    : (Platform.OS === 'ios' ? slotTempDate : slotTimeEnd);

  const resetSlotForm = () => {
    setSlotWorkType(''); setSlotDate(new Date());
    setSlotTimeStart(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
    setSlotTimeEnd(() => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; });
    setSlotMetro(''); setSlotComment('');
  };

  const submitSlot = async () => {
    if (!currentUser) return;
    if (!slotWorkType.trim() || !slotMetro.trim()) {
      showToast('Выберите специальность и метро', 'error');
      return;
    }
    setSubmittingSlot(true);
    try {
      await dbCreateWorkerSlot({
        workerId: currentUser.id,
        workerName: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
        workType: slotWorkType.trim(),
        date: formatISODate(slotDate),
        timeStart: formatTime(slotTimeStart),
        timeEnd: formatTime(slotTimeEnd),
        metro: slotMetro.trim(),
        comment: slotComment.trim() || undefined,
      });
      await refreshWorkerSlots();
      resetSlotForm();
      setShowSlotForm(false);
      showToast('Заявка опубликована!', 'success');
    } catch {
      showToast('Ошибка при публикации', 'error');
    } finally {
      setSubmittingSlot(false);
    }
  };

  const closeSlot = (id: string) => {
    if (closingSlotIds.has(id)) return;
    setClosingSlotIds(prev => new Set([...prev, id]));
    dbCloseWorkerSlot(id)
      .then(() => refreshWorkerSlots().catch(() => {}))
      .catch(() => showToast('Ошибка при закрытии', 'error'));
  };

  const myActiveSlots = workerSlots.filter(s => s.status === 'open' && !closingSlotIds.has(s.id));
  const myClosedSlots = workerSlots.filter(s => s.status === 'closed' || closingSlotIds.has(s.id));

  return (
    <View style={{ flex: 1 }}>
      {/* ── Tab bar ── */}
      <View style={xS.segWrap}>
        <View style={xS.segControl}>
          <TouchableOpacity
            style={[xS.segBtn, section === 'vacancies' && xS.segBtnActive]}
            onPress={() => setSection('vacancies')}
            activeOpacity={0.8}
          >
            <Text style={[xS.segTxt, section === 'vacancies' && xS.segTxtActive]}>Вакансии</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[xS.segBtn, section === 'myslots' && xS.segBtnActive]}
            onPress={() => setSection('myslots')}
            activeOpacity={0.8}
          >
            <Text style={[xS.segTxt, section === 'myslots' && xS.segTxtActive]}>Мои смены</Text>
          </TouchableOpacity>
        </View>
      </View>

      {section === 'vacancies' ? (
        <FlatList
          data={bulletins}
          keyExtractor={b => b.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
          }
          ListHeaderComponent={<BirzhaHint role="worker" />}
          ListEmptyComponent={
            <View style={xS.emptyWrap}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={xS.emptyTitle}>Объявлений пока нет</Text>
              <Text style={xS.emptySubtitle}>Работодатели публикуют срочные объявления здесь</Text>
            </View>
          }
          renderItem={({ item: b }) => {
            const alreadyResponded = chats.some(c => c.bulletinId === b.id && c.workerId === currentUser?.id);
            return (
              <BulletinChatCard
                key={b.id}
                b={b}
                respondBtn={
                  <TouchableOpacity
                    style={[xS.respondBtn, alreadyResponded && xS.respondBtnDone]}
                    onPress={() => respond(b)}
                    disabled={responding === b.id}
                    activeOpacity={0.8}
                  >
                    {responding === b.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={xS.respondBtnTxt}>{alreadyResponded ? 'Открыть чат' : 'Откликнуться'}</Text>
                    }
                  </TouchableOpacity>
                }
              />
            );
          }}
        />
      ) : (
        /* ── Мои смены ── */
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
        >
          {!showSlotForm ? (
            <TouchableOpacity style={xS.createBtn} onPress={() => setShowSlotForm(true)} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={20} color={Colors.primary} />
              <Text style={xS.createBtnTxt}>Опубликовать заявку</Text>
            </TouchableOpacity>
          ) : (
            <View style={xS.formCard}>
              <Text style={xS.formTitle}>Я ищу смену</Text>
              <Text style={xS.formLabel}>Специальность *</Text>
              <TouchableOpacity style={[xS.formInput, { justifyContent: 'center' }]} onPress={() => setSlotWorkTypePicker(true)} activeOpacity={0.8}>
                <Text style={{ color: slotWorkType ? Colors.textPrimary : Colors.textMuted, fontSize: 15 }}>
                  {slotWorkType || 'Выберите специальность...'}
                </Text>
              </TouchableOpacity>
              <Text style={xS.formLabel}>Дата *</Text>
              {Platform.OS === 'web' ? (
                <View style={xS.pickerField}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
                  {/* @ts-ignore */}
                  <input type="date" value={formatISODate(slotDate)} min={formatISODate(new Date())}
                    onChange={(e: any) => e.target.value && applySlotPickerDate('date', parseISOToDate(e.target.value))}
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: '#111111', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }} />
                </View>
              ) : (
                <TouchableOpacity style={xS.pickerField} onPress={() => openSlotPicker('date')} activeOpacity={0.8}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
                  <Text style={xS.pickerValue}>{formatDisplayDate(slotDate)}</Text>
                  <Text style={xS.pickerArrow}>›</Text>
                </TouchableOpacity>
              )}
              {Platform.OS === 'android' && slotPickerMode === 'date' ? (
                <DateTimePicker value={slotDate} mode="date" display="calendar" minimumDate={new Date()} onChange={onSlotAndroidChange} />
              ) : null}
              <Text style={xS.formLabel}>Время *</Text>
              {Platform.OS === 'web' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[xS.pickerField, { flex: 1 }]}>
                    <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                    {/* @ts-ignore */}
                    <input type="time" value={formatTime(slotTimeStart)}
                      onChange={(e: any) => e.target.value && applySlotPickerDate('timeStart', parseTimeToDate(e.target.value))}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: '#111111', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }} />
                  </View>
                  <Text style={xS.timeSep}>–</Text>
                  <View style={[xS.pickerField, { flex: 1 }]}>
                    <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                    {/* @ts-ignore */}
                    <input type="time" value={formatTime(slotTimeEnd)}
                      onChange={(e: any) => e.target.value && applySlotPickerDate('timeEnd', parseTimeToDate(e.target.value))}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: '#111111', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }} />
                  </View>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity style={[xS.pickerField, { flex: 1 }]} onPress={() => openSlotPicker('timeStart')} activeOpacity={0.8}>
                      <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                      <Text style={xS.pickerValue}>{formatTime(slotTimeStart)}</Text>
                    </TouchableOpacity>
                    <Text style={xS.timeSep}>–</Text>
                    <TouchableOpacity style={[xS.pickerField, { flex: 1 }]} onPress={() => openSlotPicker('timeEnd')} activeOpacity={0.8}>
                      <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                      <Text style={xS.pickerValue}>{formatTime(slotTimeEnd)}</Text>
                    </TouchableOpacity>
                  </View>
                  {Platform.OS === 'android' && slotPickerMode === 'timeStart' ? (
                    <DateTimePicker value={slotTimeStart} mode="time" display="spinner" is24Hour onChange={onSlotAndroidChange} />
                  ) : null}
                  {Platform.OS === 'android' && slotPickerMode === 'timeEnd' ? (
                    <DateTimePicker value={slotTimeEnd} mode="time" display="spinner" is24Hour onChange={onSlotAndroidChange} />
                  ) : null}
                </>
              )}
              <Text style={xS.formLabel}>Метро *</Text>
              <TouchableOpacity style={[xS.formInput, { justifyContent: 'center' }]} onPress={() => setSlotMetroPicker(true)} activeOpacity={0.8}>
                <Text style={{ color: slotMetro ? Colors.textPrimary : Colors.textMuted, fontSize: 15 }}>
                  {slotMetro || 'Выберите станцию...'}
                </Text>
              </TouchableOpacity>
              <Text style={xS.formLabel}>Комментарий (необязательно)</Text>
              <TextInput style={[xS.formInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={slotComment} onChangeText={setSlotComment}
                placeholder="Опыт, пожелания к месту работы..." placeholderTextColor={Colors.textMuted} multiline />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity style={xS.cancelBtn} onPress={() => { setShowSlotForm(false); resetSlotForm(); }} activeOpacity={0.8}>
                  <Text style={xS.cancelTxt}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[xS.submitBtn, submittingSlot && { opacity: 0.6 }]} onPress={submitSlot} disabled={submittingSlot} activeOpacity={0.8}>
                  {submittingSlot ? <ActivityIndicator size="small" color="#fff" /> : <Text style={xS.submitTxt}>Опубликовать</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {myActiveSlots.length > 0 && (
            <>
              <Text style={xS.sectionLabel}>Активные</Text>
              {myActiveSlots.map(s => (
                <View key={s.id} style={[xS.card, xS.cardEmployer]}>
                  <View style={xS.cardHeader}>
                    <Text style={xS.workType}>{s.workType}</Text>
                    <TouchableOpacity style={xS.closeBtn} onPress={() => closeSlot(s.id)} activeOpacity={0.8}>
                      <Text style={xS.closeBtnTxt}>Закрыть</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={xS.metaRow}>
                    <View style={xS.metaItem}>
                      <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                      <Text style={xS.metaTxt}>{formatDateShort(s.date)}</Text>
                    </View>
                    <View style={xS.metaItem}>
                      <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                      <Text style={xS.metaTxt}>{s.timeStart}–{s.timeEnd}</Text>
                    </View>
                    <View style={xS.metaItem}>
                      <Ionicons name="subway-outline" size={13} color={Colors.textMuted} />
                      <Text style={xS.metaTxt}>м. {s.metro}</Text>
                    </View>
                  </View>
                  {s.comment ? <Text style={xS.comment} numberOfLines={2}>{s.comment}</Text> : null}
                </View>
              ))}
            </>
          )}

          {myClosedSlots.length > 0 && (
            <>
              <Text style={xS.sectionLabel}>Закрытые</Text>
              {myClosedSlots.map(s => (
                <View key={s.id} style={[xS.card, xS.cardClosed]}>
                  <Text style={[xS.workType, { color: Colors.textMuted }]}>{s.workType}</Text>
                  <View style={xS.metaRow}>
                    <View style={xS.metaItem}>
                      <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                      <Text style={xS.metaTxt}>{formatDateShort(s.date)}</Text>
                    </View>
                    <View style={xS.metaItem}>
                      <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                      <Text style={xS.metaTxt}>{s.timeStart}–{s.timeEnd}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {myActiveSlots.length === 0 && !showSlotForm && (
            <View style={xS.emptyWrap}>
              <Text style={xS.emptyTitle}>Нет активных заявок</Text>
              <Text style={xS.emptySubtitle}>Опубликуйте заявку — работодатели увидят вас в списке</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Pickers for slot form */}
      <MetroStationPicker
        visible={slotMetroPicker}
        selectedStation={slotMetro || null}
        onSelect={s => setSlotMetro(s ?? '')}
        onClose={() => setSlotMetroPicker(false)}
      />
      <WorkTypePicker
        visible={slotWorkTypePicker}
        selectedLabel={slotWorkType || null}
        onSelect={label => setSlotWorkType(label)}
        onClose={() => setSlotWorkTypePicker(false)}
      />
      {Platform.OS === 'ios' && (
        <Modal visible={slotIosPickerVisible} transparent animationType="slide">
          <View style={xS.iosOverlay}>
            <View style={xS.iosSheet}>
              <View style={xS.iosSheetHeader}>
                <TouchableOpacity onPress={() => { setSlotIosPickerVisible(false); setSlotPickerMode(null); }}>
                  <Text style={xS.iosCancelText}>Отмена</Text>
                </TouchableOpacity>
                <Text style={xS.iosSheetTitle}>
                  {slotPickerMode === 'date' ? 'Дата смены' : slotPickerMode === 'timeStart' ? 'Начало смены' : 'Конец смены'}
                </Text>
                <TouchableOpacity onPress={confirmSlotIOS}>
                  <Text style={xS.iosDoneText}>Готово</Text>
                </TouchableOpacity>
              </View>
              {slotPickerMode && (
                <View style={xS.iosPickerWrap}>
                  <DateTimePicker
                    value={slotPickerDateValue ?? new Date()}
                    mode={slotPickerMode === 'date' ? 'date' : 'time'}
                    display="spinner"
                    is24Hour
                    minimumDate={slotPickerMode === 'date' ? new Date() : undefined}
                    onChange={onSlotIOSChange}
                    style={xS.iosPicker}
                    textColor="#111111"
                  />
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Employer view ────────────────────────────────────────────────────────────

type EmployerSection = 'chat' | 'workers' | 'active';

function EmployerExchange() {
  const { currentUser, bulletins, refreshBulletins, chats, refreshChats, workerSlots, refreshWorkerSlots, showToast } = useApp();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const [section, setSection] = useState<EmployerSection>('chat');
  const [refreshing, setRefreshing] = useState(false);
  const [contacting, setContacting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [metroPicker, setMetroPicker] = useState(false);
  const [workTypePicker, setWorkTypePicker] = useState(false);

  const [workType, setWorkType] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedTimeStart, setSelectedTimeStart] = useState<Date>(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
  const [selectedTimeEnd, setSelectedTimeEnd] = useState<Date>(() => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; });
  const [metro, setMetro] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const openPicker = (mode: PickerMode) => {
    if (!mode) return;
    const val = mode === 'date' ? selectedDate : mode === 'timeStart' ? selectedTimeStart : selectedTimeEnd;
    setTempDate(val);
    if (Platform.OS === 'ios') { setPickerMode(mode); setIosPickerVisible(true); }
    else setPickerMode(mode);
  };

  const applyPickerDate = (mode: PickerMode, date: Date) => {
    if (mode === 'date') setSelectedDate(date);
    else if (mode === 'timeStart') setSelectedTimeStart(date);
    else if (mode === 'timeEnd') setSelectedTimeEnd(date);
  };

  const onAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setPickerMode(null);
    if (event.type === 'dismissed' || !date) return;
    applyPickerDate(pickerMode, date);
  };

  const onIOSChange = (_: DateTimePickerEvent, date?: Date) => { if (date) setTempDate(date); };
  const confirmIOS = () => { applyPickerDate(pickerMode, tempDate); setIosPickerVisible(false); setPickerMode(null); };

  const pickerDateValue = pickerMode === 'date'
    ? (Platform.OS === 'ios' ? tempDate : selectedDate)
    : pickerMode === 'timeStart'
    ? (Platform.OS === 'ios' ? tempDate : selectedTimeStart)
    : (Platform.OS === 'ios' ? tempDate : selectedTimeEnd);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshBulletins(), refreshWorkerSlots()]);
    setRefreshing(false);
  };

  const resetForm = () => {
    setWorkType('');
    setSelectedDate(new Date());
    setSelectedTimeStart(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
    setSelectedTimeEnd(() => { const d = new Date(); d.setHours(17, 0, 0, 0); return d; });
    setMetro(''); setAddress(''); setComment('');
  };

  const submitBulletin = async () => {
    if (!currentUser) return;
    if (!workType.trim() || !metro.trim() || !address.trim()) {
      showToast('Заполните все обязательные поля', 'error');
      return;
    }
    const isoDate = formatISODate(selectedDate);
    const tsStart = formatTime(selectedTimeStart);
    const tsEnd = formatTime(selectedTimeEnd);
    setSubmitting(true);
    try {
      await dbCreateBulletin({
        employerId: currentUser.id,
        company: currentUser.company ?? currentUser.firstName,
        workType: workType.trim(),
        date: isoDate,
        timeStart: tsStart,
        timeEnd: tsEnd,
        metro: metro.trim(),
        address: address.trim(),
        comment: comment.trim() || undefined,
      });
      await refreshBulletins();
      notifyAllWorkersNewBulletin({
        company: currentUser.company ?? currentUser.firstName,
        workType: workType.trim(),
        date: isoDate,
        metro: metro.trim(),
      }).catch(() => {});
      resetForm();
      setShowForm(false);
      showToast('Объявление опубликовано!', 'success');
    } catch {
      showToast('Ошибка при публикации', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const closeBulletin = (id: string) => {
    if (closingIds.has(id)) return;
    setClosingIds(prev => new Set([...prev, id]));
    showToast('Объявление закрыто', 'success');
    dbCloseBulletin(id)
      .then(() => refreshBulletins().catch(() => {}))
      .catch(() => showToast('Ошибка при закрытии', 'error'));
  };

  const myBulletins = bulletins.filter(b => b.employerId === currentUser?.id);
  const activeBulletins = myBulletins.filter(b => b.status === 'open' && !closingIds.has(b.id));
  const closedBulletins = myBulletins.filter(b => b.status === 'closed' || closingIds.has(b.id));

  return (
    <>
      {/* ── 3-segment tab bar ── */}
      <View style={xS.segWrap}>
        <View style={xS.segControl}>
          <TouchableOpacity
            style={[xS.segBtn, section === 'chat' && xS.segBtnActive]}
            onPress={() => setSection('chat')}
            activeOpacity={0.8}
          >
            <Text style={[xS.segTxt, section === 'chat' && xS.segTxtActive]}>Чат</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[xS.segBtn, section === 'workers' && xS.segBtnActive]}
            onPress={() => setSection('workers')}
            activeOpacity={0.8}
          >
            <Text style={[xS.segTxt, section === 'workers' && xS.segTxtActive]}>Работники</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[xS.segBtn, section === 'active' && xS.segBtnActive]}
            onPress={() => setSection('active')}
            activeOpacity={0.8}
          >
            <Text style={[xS.segTxt, section === 'active' && xS.segTxtActive]}>Активные</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarHeight + 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        {/* ── Чат: общая биржа объявлений ── */}
        {section === 'chat' && (
          <>
            <BirzhaHint role="employer" />
            {bulletins.length === 0 ? (
            <View style={xS.emptyWrap}>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
              <Text style={xS.emptyTitle}>Объявлений пока нет</Text>
              <Text style={xS.emptySubtitle}>Здесь появятся срочные объявления работодателей</Text>
            </View>
          ) : (
            bulletins.map(b => <BulletinChatCard key={b.id} b={b} />)
          )}
          </>
        )}

        {/* ── Работники: список доступных работников ── */}
        {section === 'workers' && (
          workerSlots.length === 0 ? (
            <View style={xS.emptyWrap}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={xS.emptyTitle}>Нет доступных работников</Text>
              <Text style={xS.emptySubtitle}>Работники, ищущие смену, появятся здесь</Text>
            </View>
          ) : (
            workerSlots.map(slot => {
              const alreadyContacted = chats.some(c => c.workerSlotId === slot.id && c.employerId === currentUser?.id);
              return (
                <WorkerSlotCard
                  key={slot.id}
                  slot={slot}
                  alreadyContacted={alreadyContacted}
                  contacting={contacting === slot.id}
                  onContact={async () => {
                    if (!currentUser || contacting) return;
                    if (alreadyContacted) {
                      const existing = chats.find(c => c.workerSlotId === slot.id && c.employerId === currentUser.id);
                      if (existing) router.push({ pathname: '/chat-room', params: { chatId: existing.id } });
                      return;
                    }
                    setContacting(slot.id);
                    try {
                      const chatId = await dbContactWorkerSlot(slot.id, currentUser.id);
                      notifyWorkerNewMessage(
                        slot.workerId,
                        currentUser.company ?? `${currentUser.firstName} ${currentUser.lastName}`,
                        `Работодатель хочет обсудить смену «${slot.workType}»`,
                        chatId,
                      ).catch(() => {});
                      refreshChats().catch(() => {});
                      router.push({ pathname: '/chat-room', params: { chatId } });
                    } catch {
                      showToast('Ошибка при открытии чата', 'error');
                    } finally {
                      setContacting(null);
                    }
                  }}
                />
              );
            })
          )
        )}

        {/* ── Активные: свои объявления + форма ── */}
        {section === 'active' && (
          <>
            {!showForm ? (
              <TouchableOpacity style={xS.createBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
                <Ionicons name="add-circle" size={20} color={Colors.primary} />
                <Text style={xS.createBtnTxt}>Опубликовать объявление</Text>
              </TouchableOpacity>
            ) : (
              <View style={xS.formCard}>
                <Text style={xS.formTitle}>Новое объявление</Text>
                <Text style={xS.formLabel}>Специальность *</Text>
                <TouchableOpacity style={[xS.formInput, { justifyContent: 'center' }]} onPress={() => setWorkTypePicker(true)} activeOpacity={0.8}>
                  <Text style={{ color: workType ? Colors.textPrimary : Colors.textMuted, fontSize: 15 }}>
                    {workType || 'Выберите специальность...'}
                  </Text>
                </TouchableOpacity>
                <Text style={xS.formLabel}>Дата *</Text>
                {Platform.OS === 'web' ? (
                  <View style={xS.pickerField}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
                    {/* @ts-ignore */}
                    <input type="date" value={formatISODate(selectedDate)} min={formatISODate(new Date())}
                      onChange={(e: any) => e.target.value && applyPickerDate('date', parseISOToDate(e.target.value))}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: '#111111', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }} />
                  </View>
                ) : (
                  <TouchableOpacity style={xS.pickerField} onPress={() => openPicker('date')} activeOpacity={0.8}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
                    <Text style={xS.pickerValue}>{formatDisplayDate(selectedDate)}</Text>
                    <Text style={xS.pickerArrow}>›</Text>
                  </TouchableOpacity>
                )}
                {Platform.OS === 'android' && pickerMode === 'date' ? (
                  <DateTimePicker value={selectedDate} mode="date" display="calendar" minimumDate={new Date()} onChange={onAndroidChange} />
                ) : null}

                <Text style={xS.formLabel}>Время *</Text>
                {Platform.OS === 'web' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[xS.pickerField, { flex: 1 }]}>
                      <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                      {/* @ts-ignore */}
                      <input type="time" value={formatTime(selectedTimeStart)}
                        onChange={(e: any) => e.target.value && applyPickerDate('timeStart', parseTimeToDate(e.target.value))}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: '#111111', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }} />
                    </View>
                    <Text style={xS.timeSep}>–</Text>
                    <View style={[xS.pickerField, { flex: 1 }]}>
                      <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                      {/* @ts-ignore */}
                      <input type="time" value={formatTime(selectedTimeEnd)}
                        onChange={(e: any) => e.target.value && applyPickerDate('timeEnd', parseTimeToDate(e.target.value))}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: '#111111', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }} />
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity style={[xS.pickerField, { flex: 1 }]} onPress={() => openPicker('timeStart')} activeOpacity={0.8}>
                        <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                        <Text style={xS.pickerValue}>{formatTime(selectedTimeStart)}</Text>
                      </TouchableOpacity>
                      <Text style={xS.timeSep}>–</Text>
                      <TouchableOpacity style={[xS.pickerField, { flex: 1 }]} onPress={() => openPicker('timeEnd')} activeOpacity={0.8}>
                        <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                        <Text style={xS.pickerValue}>{formatTime(selectedTimeEnd)}</Text>
                      </TouchableOpacity>
                    </View>
                    {Platform.OS === 'android' && pickerMode === 'timeStart' ? (
                      <DateTimePicker value={selectedTimeStart} mode="time" display="spinner" is24Hour onChange={onAndroidChange} />
                    ) : null}
                    {Platform.OS === 'android' && pickerMode === 'timeEnd' ? (
                      <DateTimePicker value={selectedTimeEnd} mode="time" display="spinner" is24Hour onChange={onAndroidChange} />
                    ) : null}
                  </>
                )}
                <Text style={xS.formLabel}>Метро *</Text>
                <TouchableOpacity style={[xS.formInput, { justifyContent: 'center' }]} onPress={() => setMetroPicker(true)} activeOpacity={0.8}>
                  <Text style={{ color: metro ? Colors.textPrimary : Colors.textMuted, fontSize: 15 }}>
                    {metro || 'Выберите станцию...'}
                  </Text>
                </TouchableOpacity>
                <Text style={xS.formLabel}>Адрес *</Text>
                <TextInput style={xS.formInput} value={address} onChangeText={setAddress}
                  placeholder="Улица, дом..." placeholderTextColor={Colors.textMuted} />
                <Text style={xS.formLabel}>Комментарий (необязательно)</Text>
                <TextInput style={[xS.formInput, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={comment} onChangeText={setComment}
                  placeholder="Дополнительные требования..." placeholderTextColor={Colors.textMuted} multiline />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <TouchableOpacity style={xS.cancelBtn} onPress={() => { setShowForm(false); resetForm(); }} activeOpacity={0.8}>
                    <Text style={xS.cancelTxt}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[xS.submitBtn, submitting && { opacity: 0.6 }]} onPress={submitBulletin} disabled={submitting} activeOpacity={0.8}>
                    {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={xS.submitTxt}>Опубликовать</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeBulletins.length > 0 ? (
              <>
                <Text style={xS.sectionLabel}>Активные</Text>
                {activeBulletins.map(b => (
                  <View key={b.id} style={[xS.card, xS.cardEmployer]}>
                    <View style={xS.cardHeader}>
                      <Text style={xS.workType}>{b.workType}</Text>
                      <TouchableOpacity style={xS.closeBtn} onPress={() => closeBulletin(b.id)} activeOpacity={0.8}>
                        <Text style={xS.closeBtnTxt}>Закрыть</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={xS.metaRow}>
                      <View style={xS.metaItem}>
                        <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                        <Text style={xS.metaTxt}>{formatDateShort(b.date)}</Text>
                      </View>
                      <View style={xS.metaItem}>
                        <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                        <Text style={xS.metaTxt}>{b.timeStart}–{b.timeEnd}</Text>
                      </View>
                      <View style={xS.metaItem}>
                        <Ionicons name="subway-outline" size={13} color={Colors.textMuted} />
                        <Text style={xS.metaTxt}>м. {b.metro}</Text>
                      </View>
                    </View>
                    <View style={xS.metaItem}>
                      <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                      <Text style={[xS.metaTxt, { flex: 1 }]} numberOfLines={1}>{b.address}</Text>
                    </View>
                    {b.comment ? <Text style={xS.comment} numberOfLines={2}>{b.comment}</Text> : null}
                    <View style={xS.viewsRow}>
                      <Ionicons name="eye-outline" size={13} color={Colors.textMuted} />
                      <Text style={xS.viewsTxt}>{b.views}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              !showForm && (
                <View style={xS.emptyWrap}>
                  <Text style={xS.emptyTitle}>Нет активных объявлений</Text>
                  <Text style={xS.emptySubtitle}>Опубликуйте срочное объявление — все работники получат уведомление</Text>
                </View>
              )
            )}

            {closedBulletins.length > 0 && (
              <>
                <Text style={xS.sectionLabel}>Закрытые</Text>
                {closedBulletins.map(b => (
                  <View key={b.id} style={[xS.card, xS.cardClosed]}>
                    <Text style={[xS.workType, { color: Colors.textMuted }]}>{b.workType}</Text>
                    <View style={xS.metaRow}>
                      <View style={xS.metaItem}>
                        <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                        <Text style={xS.metaTxt}>{formatDateShort(b.date)}</Text>
                      </View>
                      <View style={xS.metaItem}>
                        <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                        <Text style={xS.metaTxt}>{b.timeStart}–{b.timeEnd}</Text>
                      </View>
                      <View style={xS.metaItem}>
                        <Ionicons name="subway-outline" size={13} color={Colors.textMuted} />
                        <Text style={xS.metaTxt}>м. {b.metro}</Text>
                      </View>
                    </View>
                    <View style={xS.viewsRow}>
                      <Ionicons name="eye-outline" size={13} color={Colors.textMuted} />
                      <Text style={xS.viewsTxt}>{b.views}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <MetroStationPicker
        visible={metroPicker}
        selectedStation={metro || null}
        onSelect={s => setMetro(s ?? '')}
        onClose={() => setMetroPicker(false)}
      />
      <WorkTypePicker
        visible={workTypePicker}
        selectedLabel={workType || null}
        onSelect={label => setWorkType(label)}
        onClose={() => setWorkTypePicker(false)}
      />

      {Platform.OS === 'ios' && (
        <Modal visible={iosPickerVisible} transparent animationType="slide">
          <View style={xS.iosOverlay}>
            <View style={xS.iosSheet}>
              <View style={xS.iosSheetHeader}>
                <TouchableOpacity onPress={() => { setIosPickerVisible(false); setPickerMode(null); }}>
                  <Text style={xS.iosCancelText}>Отмена</Text>
                </TouchableOpacity>
                <Text style={xS.iosSheetTitle}>
                  {pickerMode === 'date' ? 'Дата смены' : pickerMode === 'timeStart' ? 'Начало смены' : 'Конец смены'}
                </Text>
                <TouchableOpacity onPress={confirmIOS}>
                  <Text style={xS.iosDoneText}>Готово</Text>
                </TouchableOpacity>
              </View>
              {pickerMode && (
                <View style={xS.iosPickerWrap}>
                  <DateTimePicker
                    value={pickerDateValue ?? new Date()}
                    mode={pickerMode === 'date' ? 'date' : 'time'}
                    display="spinner"
                    is24Hour
                    minimumDate={pickerMode === 'date' ? new Date() : undefined}
                    onChange={onIOSChange}
                    style={xS.iosPicker}
                    textColor="#111111"
                  />
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExchangeScreen() {
  const app = useApp();
  const currentUser = app?.currentUser ?? null;

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;

  return (
    <SafeAreaView style={xS.safe} edges={['top', 'left', 'right']}>
      <View style={xS.header}>
        <Text style={xS.headerTitle}>Биржа</Text>
        <NotifBell />
      </View>
      {currentUser.role === 'worker' ? <WorkerExchange /> : <EmployerExchange />}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const xS = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },

  // 3-segment control
  segWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  segControl: {
    flexDirection: 'row',
    backgroundColor: Colors.outerBg,
    borderRadius: 14,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  segBtnActive: {
    backgroundColor: Colors.bg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
  segTxtActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // Chat-style bulletin card
  chatCard: { gap: 8 },
  chatSenderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  chatAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  chatAvatarClosed: { backgroundColor: '#9CA3AF' },
  chatAvatarWorker: { backgroundColor: '#059669' },
  availBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5', borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  availBadgeTxt: { fontSize: 11, fontWeight: '600', color: '#059669' },
  chatAvatarTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  chatNameLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  chatCompany: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flex: 1, marginRight: 6 },
  chatTimestamp: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  chatBubble: {
    marginLeft: 48, backgroundColor: Colors.bg,
    borderRadius: 4, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16,
    padding: 14, gap: 8,
    borderWidth: 1, borderColor: Colors.divider,
    ...Shadow.card,
  },
  chatBubbleClosed: { backgroundColor: Colors.outerBg, borderColor: Colors.divider, opacity: 0.75 },
  chatWorkType: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  chatWorkTypeClosed: { color: Colors.textMuted },
  closedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6', borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  closedBadgeTxt: { fontSize: 11, fontWeight: '600', color: '#6B7280' },

  // Employer active/closed cards
  card: {
    backgroundColor: Colors.bg, borderRadius: 18,
    padding: 16, gap: 10, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.divider,
  },
  cardEmployer: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  cardClosed: { opacity: 0.55, borderLeftWidth: 3, borderLeftColor: Colors.textMuted },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  urgentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7', borderRadius: 100,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  urgentTxt: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  company: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, flex: 1, marginLeft: 8 },
  workType: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  addressTxt: { fontSize: 13, color: '#92400E', fontWeight: '600', flex: 1, lineHeight: 18 },
  comment: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Respond button
  respondBtn: { backgroundColor: Colors.primary, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  respondBtnDone: { backgroundColor: Colors.green },
  respondBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Close button
  closeBtn: { backgroundColor: '#FEE2E2', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  closeBtnTxt: { fontSize: 12, fontWeight: '700', color: Colors.red },

  // Create button
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 100,
    paddingVertical: 14, backgroundColor: Colors.primaryLight,
  },
  createBtnTxt: { fontSize: 15, fontWeight: '700', color: Colors.primary },

  // Form
  formCard: {
    backgroundColor: Colors.bg, borderRadius: 18,
    padding: 18, gap: 6, ...Shadow.card,
    borderWidth: 1, borderColor: Colors.divider,
  },
  formTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 4 },
  formInput: {
    borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: Colors.textPrimary,
    backgroundColor: Colors.bg,
  },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  cancelTxt: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  submitTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Worker chat header
  workerChatHeader: { marginBottom: 4 },
  workerChatChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: Colors.primaryLight, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  workerChatChipTxt: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },

  // Metro picker
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  sheetClose: { fontSize: 18, color: Colors.textMuted, padding: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  stationRowSelected: { backgroundColor: Colors.primaryLight },
  lineDot: { width: 12, height: 12, borderRadius: 6 },
  stationName: { fontSize: 15, color: Colors.textPrimary },

  // Views counter
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 2 },
  viewsTxt: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },

  // Picker fields
  pickerField: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: Colors.bg,
  },
  pickerIcon: { fontSize: 18 },
  pickerValue: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  pickerArrow: { fontSize: 20, color: Colors.textMuted },
  timeSep: { fontSize: 20, color: Colors.textMuted, fontWeight: '600' },

  // iOS picker modal
  iosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  iosSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  iosPickerWrap: { backgroundColor: '#FFFFFF', width: '100%' },
  iosPicker: { width: '100%', height: 200, backgroundColor: '#FFFFFF' },
  iosSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  iosSheetTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  iosCancelText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '500' },
  iosDoneText: { fontSize: 15, color: Colors.primary, fontWeight: '700' },

  // Work type picker
  wtRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.bg, borderRadius: 14,
    padding: 16, borderWidth: 2, borderColor: Colors.inputBorder,
  },
  wtRowSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  wtLabel: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  wtLabelSelected: { color: Colors.primary },
  wtDesc: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  wtCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.inputBorder,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  wtCircleSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  // Onboarding hint card
  hintCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1, borderColor: Colors.primary + '30',
    marginBottom: 4,
  },
  hintHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hintTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  hintRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  hintTxt: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, flex: 1 },
});
