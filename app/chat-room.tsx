
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Application from 'expo-application';
import {
  useAudioRecorder, useAudioRecorderState, useAudioPlayer,
  RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { Message, Chat } from '@/constants/types';
import { nameColorFromString, getInitials, formatDate, uid, nowISO } from '@/services/storage';
import { dbGetMessages, dbInsertMessage, dbMarkRead, dbIncrementUnread, dbGetLikeByVacancyWorker, dbUpsertLike, dbCheckAndCreateMatch, dbGetLikes, dbGetChatById, dbGetUserById, dbSetPermApplicationStatus } from '@/services/db';
import { notifyWorkerGotMatch, notifyWorkerNewMessage, notifyEmployerNewMessage,
  notifyWorkerPermApplicationApproved, notifyWorkerPermApplicationRejected } from '@/services/notifications';
import { useIsFocused } from '@react-navigation/native';
import { getSupabaseClient } from '@/template';
import { getChatSuggestions } from '@/constants/chatSuggestions';
import { isOnline, lastSeenLabel } from '@/services/presence';

const POLL_INTERVAL = 8000;

// Отступ под строкой ввода считаем ОДИН раз при загрузке модуля и больше не
// пересчитываем. useSafeAreaInsets() на Android отдаёт нули на первых кадрах
// и уточняется после первого показа клавиатуры — из-за этого поле сначала
// липло к краю, а потом подскакивало. Здесь значение постоянное, поэтому
// строка всегда стоит на одном месте.
const BAR_PAD_BOTTOM = Math.max(initialWindowMetrics?.insets.bottom ?? 0, 16);

/** Пузырь голосового: кнопка воспроизведения, дорожка и длительность. */
function VoiceBubble({ url, sec, isMe }: { url: string; sec: number; isMe: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (st: any) => {
      setPlaying(!!st?.playing);
      // Дослушали — сматываем в начало, чтобы можно было включить снова
      if (st?.didJustFinish) { player.seekTo(0); setPlaying(false); }
    });
    return () => sub.remove();
  }, [player]);

  const toggle = () => {
    if (player.playing) { player.pause(); setPlaying(false); }
    else { player.play(); setPlaying(true); }
  };

  const tint = isMe ? '#fff' : Colors.primary;
  return (
    <View style={vb.row}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.7}
        style={[vb.playBtn, { backgroundColor: isMe ? 'rgba(255,255,255,0.22)' : Colors.primaryLight }]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={16} color={tint} />
      </TouchableOpacity>
      <View style={vb.waveWrap}>
        {[10, 16, 8, 20, 13, 18, 9, 15, 11, 19, 7, 14].map((h, i) => (
          <View key={i} style={[vb.bar, { height: h, backgroundColor: isMe ? 'rgba(255,255,255,0.55)' : Colors.inputBorder }]} />
        ))}
      </View>
      <Text style={[vb.dur, { color: isMe ? 'rgba(255,255,255,0.85)' : Colors.textMuted }]}>
        {fmtDuration(sec)}
      </Text>
    </View>
  );
}

const vb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 168 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  waveWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 },
  bar: { width: 2.5, borderRadius: 2 },
  dur: { fontSize: 11, fontWeight: '600' },
});

// Поле ввода растёт вместе с текстом, но не выше этого — дальше текст
// прокручивается внутри, как в Telegram.
const INPUT_MIN_H = 22;
const INPUT_MAX_H = 108;

// Фото передаём тем же текстовым полем сообщения: URL с меткой.
// Так не нужна миграция таблицы сообщений.
const IMG_PREFIX = '[img]';
const isImageMessage = (t: string) => t.startsWith(IMG_PREFIX);
const imageUrlOf = (t: string) => t.slice(IMG_PREFIX.length);

// Голосовое: [voice]<url>|<секунды>
const VOICE_PREFIX = '[voice]';
const isVoiceMessage = (t: string) => t.startsWith(VOICE_PREFIX);
const voiceOf = (t: string) => {
  const [url, sec] = t.slice(VOICE_PREFIX.length).split('|');
  return { url, sec: Number(sec) || 0 };
};
const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня','июля',
  'августа','сентября','октября','ноября','декабря'];

/** Ключ дня — по нему решаем, нужен ли разделитель между сообщениями */
const dayKey = (ts: string) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** «Сегодня» / «Вчера» / «24 июля» — как в мессенджерах */
const dayLabel = (ts: string) => {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  const base = `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Системные сообщения раньше начинались с эмодзи прямо в тексте. Текст лежит
// в базе, старые записи не переписать — поэтому эмодзи срезаем при показе,
// а роль сообщения показываем иконкой.
const EMOJI_HEAD = /^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\s]+/u;
export const stripLeadingEmoji = (t: string) => t.replace(EMOJI_HEAD, '').trimStart();

const fmtDuration = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// Запись микрофона требует разрешения, которое нельзя добавить через OTA:
// на Android оно уже есть (его объявляет сам модуль expo-audio), а на iOS
// ключ NSMicrophoneUsageDescription появится только в следующей сборке.
// Поэтому на iOS кнопку показываем начиная с этой сборки.
const VOICE_IOS_MIN_BUILD = 6;
const voiceSupported = (() => {
  if (Platform.OS === 'android') return true;
  if (Platform.OS !== 'ios') return false;
  const b = Number(Application.nativeBuildVersion ?? 0);
  return b >= VOICE_IOS_MIN_BUILD;
})();

// Module-level message cache — survives navigation but cleared on app restart
const msgCache = new Map<string, Message[]>();

export default function ChatRoom() {
  const router = useRouter();
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const {
    currentUser, users, chats, vacancies, refreshChats, refreshLikes, likes,
    optimisticUpdateLike, showToast, permVacancies, permApplications, refreshPermApplications,
  } = useApp();

  // Track whether this chat screen is currently visible — used to suppress
  // push notifications when the user is already reading the conversation.
  const isFocused = useIsFocused();

  const chatRef = useRef(chats.find(c => c.id === chatId));
  const foundChat = chats.find(c => c.id === chatId);
  if (foundChat) chatRef.current = foundChat;
  const [dbChat, setDbChat] = useState<Chat | null>(null);
  const chat = foundChat ?? chatRef.current ?? dbChat;

  // Declare state/refs before effects that reference them
  const hasCachedRef = useRef(chatId ? msgCache.has(chatId) : false);
  const cached = chatId ? (msgCache.get(chatId) ?? chat?.messages ?? []) : (chat?.messages ?? []);
  const [messages, setMessages] = useState<Message[]>(cached);
  const [loadingMessages, setLoadingMessages] = useState(!hasCachedRef.current && !!chatId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputH, setInputH] = useState(INPUT_MIN_H);
  const inputRef = useRef<TextInput>(null);
  // Клавиатура открыта — прижимаем строку к ней; закрыта — держим постоянный
  // отступ от края экрана. Слушатель клавиатуры надёжнее, чем отступы,
  // которые на Android доезжают с задержкой.
  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, () => setKbOpen(true));
    const s2 = Keyboard.addListener(hideEvt, () => setKbOpen(false));
    return () => { s1.remove(); s2.remove(); };
  }, []);
  const barPad = kbOpen ? 8 : BAR_PAD_BOTTOM;

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Обновляем состояние записи раз в 200 мс — этого хватает для счётчика
  const recorderState = useAudioRecorderState(recorder, 200);
  const [decidingLike, setDecidingLike] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [likeStatus, setLikeStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const lastCountRef = useRef(cached.length);
  // Перечитать чат по сигналу от сервера. Хранится ссылкой, чтобы подписка
  // не пересоздавалась на каждый перерисованный кадр.
  const pollRef = useRef<() => void>(() => {});

  // If chat is not in context (freshly created, or navigated from push notification),
  // fetch it directly from DB so the chat room is fully functional immediately.
  useEffect(() => {
    if (!chatId || foundChat) return;
    let isMounted = true;
    dbGetChatById(chatId).then(c => {
      if (!isMounted || !c) return;
      if (c.workerId !== currentUser?.id && c.employerId !== currentUser?.id) {
        router.back();
        return;
      }
      setDbChat(c);
      setMessages(c.messages);
      lastCountRef.current = c.messages.length;
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [chatId]);

  // Clear dbChat once context has the chat (avoid stale fallback)
  useEffect(() => {
    if (foundChat) setDbChat(null);
  }, [foundChat?.id]);

  // Load all messages immediately on first open (context only has the last preview message)
  useEffect(() => {
    if (!chatId || hasCachedRef.current) return;
    let mounted = true;
    dbGetMessages(chatId).then(msgs => {
      if (!mounted) return;
      setMessages(msgs);
      msgCache.set(chatId, msgs);
      lastCountRef.current = msgs.length;
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    }).catch(() => {}).finally(() => { if (mounted) setLoadingMessages(false); });
    return () => { mounted = false; };
  }, [chatId]);

  const isEmployer = currentUser?.role === 'employer';
  const isBulletinChat = !!chat?.bulletinId || !!chat?.workerSlotId;

  const otherId = chat
    ? (currentUser?.role === 'worker' ? chat.employerId : chat.workerId)
    : '';
  const contextOther = users.find(u => u.id === otherId);
  const [fetchedOther, setFetchedOther] = useState<import('@/constants/types').User | null>(null);
  const other = contextOther ?? fetchedOther;

  useEffect(() => {
    if (!otherId || contextOther) return;
    dbGetUserById(otherId).then(u => setFetchedOther(u)).catch(() => {});
  }, [otherId, contextOther]);

  const vacancy = vacancies.find(v => v.id === chat?.vacancyId);
  // Пока собеседник не загрузился, здесь подставлялось название компании. Для
  // работника это ещё сходило за правду, а работодателю казалось, что он
  // переписывается с «Лавкой» вместо человека. Лучше пустая строка, чем чужое имя.
  const otherName = other
    ? `${other.firstName} ${other.lastName}`.trim()
    : (isEmployer ? '' : (chat?.companyName ?? ''));
  const otherColor = nameColorFromString(otherId || otherName);
  // Пересчитываем раз в минуту, иначе «5 мин назад» застывает на экране
  const [presenceTick, setPresenceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPresenceTick(x => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const online = useMemo(() => isOnline(other?.lastSeenAt), [other?.lastSeenAt, presenceTick]);
  const presence = useMemo(() => lastSeenLabel(other?.lastSeenAt), [other?.lastSeenAt, presenceTick]);
  const otherAvatarUrl = other?.avatarUrl;

  // Чат по постоянной вакансии живёт на другой механике: там не лайки,
  // а отклик в jm_perm_applications. Решение «подходит/не подходит» должно
  // менять именно его — через лайки оно молча падало, и кнопка ничего не делала.
  const permVacancy = (permVacancies ?? []).find((v: any) => v.id === chat?.vacancyId) ?? null;
  const permApp = permVacancy
    ? (permApplications ?? []).find((a: any) => a.vacancyId === chat?.vacancyId && a.workerId === chat?.workerId) ?? null
    : null;

  // Fetch like status (for employer decision bar — not applicable for bulletin/slot chats)
  useEffect(() => {
    if (!chat || !currentUser) return;
    if (chat.bulletinId || chat.workerSlotId) { setLikeStatus(null); return; }
    // Постоянная вакансия — статус берём из отклика, а не из лайков
    if (permVacancy) {
      setLikeStatus(permApp
        ? (permApp.status === 'approved' ? 'approved' : permApp.status === 'rejected' ? 'rejected' : 'pending')
        : null);
      return;
    }
    dbGetLikes().then(allLikes => {
      const like = allLikes.find(l => l.vacancyId === chat.vacancyId && l.workerId === chat.workerId);
      if (!like) { setLikeStatus('pending'); return; }
      if (like.isMatch || like.employerLiked === true) setLikeStatus('approved');
      else if (like.employerLiked === false) setLikeStatus('rejected');
      else setLikeStatus('pending');
    }).catch(() => {});
  }, [chat?.id, currentUser?.id, permVacancy?.id, permApp?.status]);

  // Mark as read on mount
  useEffect(() => {
    if (!chat || !currentUser) return;
    dbMarkRead(chat.id, currentUser.role).catch(() => {});
    refreshChats().catch(() => {});
  }, [chat?.id]);

  // Polling for new messages
  useEffect(() => {
    if (!chat?.id || !currentUser) return;
    const localChatId = chat.id;
    const userId = currentUser.id;
    const role = currentUser.role;

    const poll = async () => {
      try {
        const [msgs, like] = await Promise.all([
          dbGetMessages(localChatId),
          (chat.bulletinId || chat.workerSlotId) ? Promise.resolve(null) : dbGetLikeByVacancyWorker(chat.vacancyId, chat.workerId),
        ]);
        if (msgs.length !== lastCountRef.current) {
          msgCache.set(localChatId, msgs);
          setMessages(msgs);
          const newMsgs = msgs.slice(lastCountRef.current);
          const fromOther = newMsgs.filter(m => m.senderId !== userId && m.senderId !== 'system');
          if (fromOther.length > 0) {
            dbMarkRead(localChatId, role).catch(() => {});
            refreshChats().catch(() => {});
          }
          lastCountRef.current = msgs.length;
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
        if (like) {
          if (like.isMatch || like.employerLiked === true) setLikeStatus('approved');
          else if (like.employerLiked === false) setLikeStatus('rejected');
          else setLikeStatus('pending');
        }
      } catch (e) {
        console.warn('[ChatRoom] poll error', e);
      }
    };

    // Опрос — подстраховка на случай, если сигнал не дошёл. Обычно новое
    // сообщение приходит раньше, по сигналу от сервера (см. ниже).
    pollRef.current = poll;
    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [chat?.id]);

  // Сигнал о новом сообщении.
  //
  // Раньше здесь было две подписки — на таблицу сообщений и на таблицу
  // откликов. Обе читали базу напрямую и после закрытия доступа замолчали бы.
  // Теперь сервер, записав сообщение, шлёт в канал чата короткое «обнови»
  // без текста, а мы в ответ разом перечитываем и сообщения, и статус
  // отклика — тем же запросом, что и при обычном опросе.
  //
  // Решения «подходит / не подходит» тоже пишут в чат системное сообщение,
  // поэтому статус отклика обновляется сразу же, отдельная подписка не нужна.
  useEffect(() => {
    if (!chatId || !currentUser) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`chat:${chatId}`)
      .on('broadcast', { event: 'refresh' }, () => { pollRef.current(); })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [chatId, currentUser?.id]);

  // Scroll to bottom when messages load
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }, [messages.length]);

  const appendMessages = (newMsgs: Message[]) => {
    setMessages(prev => {
      const ids = new Set(prev.map(m => m.id));
      const toAdd = newMsgs.filter(m => !ids.has(m.id));
      const next = toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      lastCountRef.current = next.length;
      return next;
    });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  };

  // Employer: approve candidate
  const handleApprove = async () => {
    if (!chat || !currentUser || !isEmployer) return;
    setDecidingLike(true);
    try {
      const workerId = chat.workerId;
      const vacId = chat.vacancyId;

      if (permVacancy) {
        if (!permApp) { showToast('Отклик не найден', 'error'); return; }
        await dbSetPermApplicationStatus(permApp.id, 'approved');
        setLikeStatus('approved');
        const okMsg: Message = { id: uid(), senderId: 'system',
          text: 'Кандидат одобрен на вакансию. Обсудите детали выхода.', timestamp: nowISO() };
        appendMessages([okMsg]);
        dbInsertMessage(chat.id, 'system', okMsg.text).catch(() => {});
        notifyWorkerPermApplicationApproved(workerId, permVacancy.company, permVacancy.title).catch(() => {});
        refreshPermApplications?.().catch(() => {});
        refreshChats().catch(() => {});
        return;
      }

      await dbUpsertLike(vacId, workerId, currentUser.id, { employerLiked: true });
      const result = await dbCheckAndCreateMatch(vacId, workerId);
      setLikeStatus('approved');
      if (result.matched) {
        const matchMsg: Message = { id: uid(), senderId: 'system', text: 'У вас мэтч! Вы подошли друг другу. Познакомьтесь и обсудите детали!', timestamp: nowISO() };
        const safetyMsg: Message = { id: uid(), senderId: 'system_safety', text: 'Рекомендуем не переводить общение в сторонние мессенджеры или почту, а продолжить его в чате JobToo: так у мошенников будет меньше шансов вас обмануть.\n\nГде бы вы ни общались — не сообщайте свой CVV-код, код из SMS и не вводите данные карты по ссылке.', timestamp: nowISO() };
        appendMessages([matchMsg, safetyMsg]);
        notifyWorkerGotMatch(chat.workerId, chat.companyName, chat.vacTitle).catch(() => {});
        const existingLike = likes.find(l => l.vacancyId === vacId && l.workerId === workerId);
        if (existingLike) optimisticUpdateLike({ ...existingLike, isMatch: true, employerLiked: true });
      }
      refreshLikes().catch(() => {});
      refreshChats().catch(() => {});
    } catch (e) {
      console.error('[ChatRoom] handleApprove error', e);
      showToast('Не удалось сохранить решение. Попробуйте ещё раз', 'error');
    } finally {
      setDecidingLike(false);
    }
  };

  // Employer: reject candidate (called after confirmation)
  const handleRejectConfirmed = async () => {
    if (!chat || !currentUser || !isEmployer) return;
    setShowRejectConfirm(false);
    setDecidingLike(true);
    try {
      const workerId = chat.workerId;
      const vacId = chat.vacancyId;
      const rejectMsg = 'Вы не подошли по данной вакансии. Чат закрыт.';
      const optimisticMsg: Message = { id: uid(), senderId: 'system', text: rejectMsg, timestamp: nowISO() };
      setLikeStatus('rejected');
      appendMessages([optimisticMsg]);

      if (permVacancy) {
        if (permApp) {
          await dbSetPermApplicationStatus(permApp.id, 'rejected');
          notifyWorkerPermApplicationRejected(workerId, permVacancy.company, permVacancy.title).catch(() => {});
          refreshPermApplications?.().catch(() => {});
        }
        dbInsertMessage(chat.id, 'system', rejectMsg).catch(() => {});
        dbIncrementUnread(chat.id, 'worker').catch(() => {});
        refreshChats().catch(() => {});
        return;
      }

      await dbUpsertLike(vacId, workerId, currentUser.id, { employerLiked: false });
      dbInsertMessage(chat.id, 'system', rejectMsg).catch(() => {});
      dbIncrementUnread(chat.id, 'worker').catch(() => {});
      refreshChats().catch(() => {});
    } catch (e) {
      console.error('[ChatRoom] handleRejectConfirmed error', e);
      showToast('Не удалось сохранить решение. Попробуйте ещё раз', 'error');
      setLikeStatus('pending');
    } finally {
      setDecidingLike(false);
    }
  };

  // Chat is locked for bulletin closure or rejected for vacancy
  const isChatBlocked = likeStatus === 'rejected' || (chat?.isLocked ?? false);

  // Готовые фразы показываем, пока человек ещё ничего не написал в этот чат
  // и не начал печатать своё: дальше они только мешают.
  const suggestions = getChatSuggestions(isEmployer ? 'employer' : 'worker', vacancy);
  const iAlreadyWrote = messages.some(m => m.senderId === currentUser?.id);
  const showSuggestions =
    suggestions.length > 0 && !iAlreadyWrote && !input.trim() &&
    !isChatBlocked && !recorderState.isRecording;

  // ── Отправка фото ────────────────────────────────────────────────────────
  const base64ToUint8Array = (base64: string): Uint8Array => {
    const bin = globalThis.atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  };

  const sendImage = async (uri: string) => {
    if (!chat || !currentUser || uploadingImage) return;
    setUploadingImage(true);
    try {
      // Сжимаем перед отправкой — иначе фото с камеры весит несколько мегабайт
      const processed = await ImageManipulator.manipulateAsync(
        uri, [{ resize: { width: 1280 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );
      const base64Data = await FileSystem.readAsStringAsync(processed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const sb = getSupabaseClient();
      const fileName = `chat/${chat.id}_${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage.from('avatars').upload(
        fileName, base64ToUint8Array(base64Data),
        { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' },
      );
      if (upErr) console.warn('[ChatRoom] image upload warning', upErr.message);
      const { data: urlData } = sb.storage.from('avatars').getPublicUrl(fileName);

      const msg = await dbInsertMessage(chat.id, currentUser.id, IMG_PREFIX + urlData.publicUrl);
      setMessages(prev => {
        const next = [...prev, msg];
        msgCache.set(chat.id, next);
        return next;
      });
      lastCountRef.current += 1;
      const forRole = currentUser.role === 'worker' ? 'employer' : 'worker';
      dbIncrementUnread(chat.id, forRole).catch(() => {});
      const senderName = `${currentUser.firstName} ${currentUser.lastName}`;
      // В уведомлении вместо ссылки — понятная подпись
      if (currentUser.role === 'worker') {
        notifyEmployerNewMessage(chat.employerId, senderName, '📷 Фото', chat.id).catch(() => {});
      } else {
        notifyWorkerNewMessage(chat.workerId, senderName, '📷 Фото', chat.id).catch(() => {});
      }
      refreshChats().catch(() => {});
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      console.error('[ChatRoom] sendImage error', e);
      showToast('Не удалось отправить фото', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Голосовые сообщения ──────────────────────────────────────────────────
  const startRecording = async () => {
    if (isChatBlocked || uploadingVoice) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) { showToast('Нет доступа к микрофону', 'error'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      console.error('[ChatRoom] startRecording error', e);
      showToast('Не удалось начать запись', 'error');
    }
  };

  const cancelRecording = async () => {
    try { await recorder.stop(); } catch {}
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  };

  const stopAndSendVoice = async () => {
    if (!chat || !currentUser) return;
    const seconds = Math.max(1, Math.round(recorderState.durationMillis / 1000));
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    } catch (e) {
      console.error('[ChatRoom] stop recording error', e);
      return;
    }
    const uri = recorder.uri;
    if (!uri) return;

    setUploadingVoice(true);
    try {
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const sb = getSupabaseClient();
      const fileName = `chat/voice_${chat.id}_${Date.now()}.m4a`;
      const { error: upErr } = await sb.storage.from('avatars').upload(
        fileName, base64ToUint8Array(base64Data),
        { contentType: 'audio/m4a', upsert: true, cacheControl: '3600' },
      );
      if (upErr) console.warn('[ChatRoom] voice upload warning', upErr.message);
      const { data: urlData } = sb.storage.from('avatars').getPublicUrl(fileName);

      const msg = await dbInsertMessage(
        chat.id, currentUser.id, `${VOICE_PREFIX}${urlData.publicUrl}|${seconds}`,
      );
      setMessages(prev => {
        const next = [...prev, msg];
        msgCache.set(chat.id, next);
        return next;
      });
      lastCountRef.current += 1;
      const forRole = currentUser.role === 'worker' ? 'employer' : 'worker';
      dbIncrementUnread(chat.id, forRole).catch(() => {});
      const senderName = `${currentUser.firstName} ${currentUser.lastName}`;
      if (currentUser.role === 'worker') {
        notifyEmployerNewMessage(chat.employerId, senderName, '🎤 Голосовое сообщение', chat.id).catch(() => {});
      } else {
        notifyWorkerNewMessage(chat.workerId, senderName, '🎤 Голосовое сообщение', chat.id).catch(() => {});
      }
      refreshChats().catch(() => {});
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      console.error('[ChatRoom] sendVoice error', e);
      showToast('Не удалось отправить голосовое', 'error');
    } finally {
      setUploadingVoice(false);
    }
  };

  const pickImage = async () => {
    if (isChatBlocked || uploadingImage) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { showToast('Нет доступа к галерее', 'error'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (!res.canceled && res.assets?.[0]?.uri) await sendImage(res.assets[0].uri);
    } catch (e) {
      console.error('[ChatRoom] pickImage error', e);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || !chat || !currentUser || isChatBlocked) return;
    setSending(true);
    setInput('');
    setInputH(INPUT_MIN_H);
    try {
      const msg = await dbInsertMessage(chat.id, currentUser.id, text);
      setMessages(prev => {
        const next = [...prev, msg];
        msgCache.set(chat.id, next);
        return next;
      });
      lastCountRef.current += 1;
      const forRole = currentUser.role === 'worker' ? 'employer' : 'worker';
      dbIncrementUnread(chat.id, forRole).catch(() => {});
      const senderName = `${currentUser.firstName} ${currentUser.lastName}`;
      // Always notify the recipient — they are on a different device.
      // chatId is passed so the notification tap navigates directly to this chat.
      if (currentUser.role === 'worker') {
        notifyEmployerNewMessage(chat.employerId, senderName, text, chat.id).catch(() => {});
      } else {
        notifyWorkerNewMessage(chat.workerId, senderName, text, chat.id).catch(() => {});
      }
      refreshChats().catch(() => {});
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) {
      console.error('[ChatRoom] sendMessage error', e);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  // All hooks declared above — safe to return early here
  if (!currentUser || !chat) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backIconBtn} activeOpacity={0.7}>
            <Text style={styles.backIconTxt}>‹</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: Colors.textMuted }}>Чат не найден</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    // Разделитель дня — перед первым сообщением и на каждой смене даты
    const prev = index > 0 ? messages[index - 1] : null;
    const showDay = item.timestamp
      && (!prev || !prev.timestamp || dayKey(prev.timestamp) !== dayKey(item.timestamp));
    const daySeparator = showDay ? (
      <View style={styles.daySep}>
        <Text style={styles.daySepTxt}>{dayLabel(item.timestamp)}</Text>
      </View>
    ) : null;

    if (item.senderId === 'system') {
      const body = stripLeadingEmoji(item.text);
      const isMatch = body.includes('мэтч') || body.includes('Мэтч');
      const isReject = body.includes('не подошли') || body.includes('закрыт');
      const isOk = body.includes('одобрен');
      const icon: IconName = isMatch ? 'sparkles'
        : isReject ? 'close-circle'
        : isOk ? 'checkmark-circle' : 'information-circle';
      const tint = isMatch ? Colors.green : isReject ? Colors.red : Colors.textSecondary;
      return (
        <>
        {daySeparator}
        <View style={[
          styles.systemMsg,
          isMatch && styles.systemMsgMatch,
          isReject && styles.systemMsgReject,
        ]}>
          <Ionicons name={icon} size={15} color={tint} style={{ marginTop: 1 }} />
          <Text style={[
            styles.systemText,
            isMatch && styles.systemTextMatch,
            isReject && styles.systemTextReject,
          ]}>{body}</Text>
        </View>
        </>
      );
    }
    // Safety advisory message (from system_safety sender)
    if (item.senderId === 'system_safety') {
      return (
        <>
        {daySeparator}
        <View style={styles.safetyMsg}>
          <View style={styles.safetyHeader}>
            <View style={styles.safetyIconWrap}>
              <Ionicons name="shield-checkmark" size={14} color="#92400E" />
            </View>
            <Text style={styles.safetyTitle}>Безопасность</Text>
          </View>
          <Text style={styles.safetyText}>{stripLeadingEmoji(item.text)}</Text>
        </View>
        </>
      );
    }
    const isMe = item.senderId === currentUser.id;
    return (
      <>
      {daySeparator}
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        {!isMe ? (
          otherAvatarUrl ? (
            <Image
              source={{ uri: otherAvatarUrl }}
              style={styles.msgAvatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.msgAvatar, { backgroundColor: otherColor, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={styles.msgAvatarText}>{getInitials(otherName)}</Text>
            </View>
          )
        ) : null}
        <View style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          isImageMessage(item.text) && styles.bubbleImage,
        ]}>
          {isVoiceMessage(item.text) ? (
            <VoiceBubble {...voiceOf(item.text)} isMe={isMe} />
          ) : isImageMessage(item.text) ? (
            <Image
              source={{ uri: imageUrlOf(item.text) }}
              style={styles.msgImage}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
          )}
          <Text style={[styles.timestamp, isMe && styles.timestampMe]}>{formatTime(item.timestamp)}</Text>
        </View>
      </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Rejection confirmation modal */}
      {showRejectConfirm ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Отклонить кандидата?</Text>
            <Text style={styles.confirmBody}>
              После этого чат будет полностью заблокирован — вы и кандидат больше не сможете писать. Действие нельзя отменить.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowRejectConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelTxt}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmRejectBtn}
                onPress={handleRejectConfirmed}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmRejectTxt}>Подтвердить отказ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {/* Employer decision bar — shown at the top */}
      {isEmployer && !isBulletinChat && likeStatus === 'pending' ? (
        <View style={styles.decisionBar}>
          <Text style={styles.decisionBarLabel}>Принять решение по кандидату:</Text>
          <View style={styles.decisionBtnsRow}>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.decisionBtnReject, decidingLike && { opacity: 0.5 }]}
              onPress={() => setShowRejectConfirm(true)}
              disabled={decidingLike}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={17} color={Colors.textSecondary} />
              <Text style={styles.decisionBtnRejectTxt}>Не подходит</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.decisionBtn, styles.decisionBtnAccept, decidingLike && { opacity: 0.5 }]}
              onPress={handleApprove}
              disabled={decidingLike}
              activeOpacity={0.8}
            >
              {decidingLike ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={17} color="#fff" />
                  <Text style={styles.decisionBtnAcceptTxt}>Подходит</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : isEmployer && !isBulletinChat && likeStatus === 'approved' ? (
        <View style={[styles.decisionBar, { backgroundColor: '#D1FAE5' }]}>
          <View style={styles.decisionStatusRow}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.green} />
            <Text style={[styles.decisionBarLabel, { color: Colors.green }]}>Мэтч создан</Text>
          </View>
        </View>
      ) : isEmployer && !isBulletinChat && likeStatus === 'rejected' ? (
        <View style={[styles.decisionBar, { backgroundColor: '#FEE2E2' }]}>
          <View style={styles.decisionStatusRow}>
            <Ionicons name="close-circle" size={16} color={Colors.red} />
            <Text style={[styles.decisionBarLabel, { color: Colors.red }]}>Кандидат отклонён</Text>
          </View>
        </View>
      ) : null}

      {/* Blocked notice for both parties */}
      {isChatBlocked ? (
        <View style={styles.blockedBar}>
          <Text style={styles.blockedBarTxt}>
            {chat?.isLocked
              ? 'Объявление закрыто — работника уже нашли'
              : (isEmployer ? 'Чат закрыт — кандидат отклонён' : 'Чат закрыт — работодатель отклонил кандидатуру')}
          </Text>
        </View>
      ) : null}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIconBtn} activeOpacity={0.7}>
          <Text style={styles.backIconTxt}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={0.8}
          onPress={() => otherId ? router.push({ pathname: '/user-profile', params: { userId: otherId } }) : null}
        >
          {otherAvatarUrl ? (
            <Image
              source={{ uri: otherAvatarUrl }}
              style={styles.headerAvatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: otherColor, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={styles.headerAvatarText}>{getInitials(otherName)}</Text>
            </View>
          )}
          <View>
            <Text style={styles.headerName}>{otherName}</Text>
            {/* Под именем — присутствие, как в мессенджерах. Название
                вакансии переехало в полосу ниже, чтобы не потеряться. */}
            {presence ? (
              <View style={styles.presenceRow}>
                {online ? <View style={styles.onlineDot} /> : null}
                <Text style={[styles.headerSub, online && styles.headerSubOnline]} numberOfLines={1}>
                  {presence}
                </Text>
              </View>
            ) : (
              <Text style={styles.headerSub} numberOfLines={1}>{chat.vacTitle}</Text>
            )}
          </View>
          <Text style={{ fontSize: 16, color: Colors.textMuted, marginLeft: 4 }}>›</Text>
        </TouchableOpacity>
        <View style={{ width: 70 }} />
      </View>

      {/* Vacancy info block */}
      {vacancy || chat.vacTitle ? (
        <View style={styles.vacancyBar}>
          {chat.vacTitle ? (
            <View style={styles.vacancyItem}>
              <Ionicons name="briefcase-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.vacancyText} numberOfLines={1}>{chat.vacTitle}</Text>
            </View>
          ) : null}
          {vacancy?.date ? (
            <View style={styles.vacancyItem}>
              <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.vacancyText}>{formatDate(vacancy.date)}</Text>
            </View>
          ) : null}
          {vacancy?.timeStart && vacancy?.timeEnd ? (
            <View style={styles.vacancyItem}>
              <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.vacancyText}>{vacancy.timeStart}–{vacancy.timeEnd}</Text>
            </View>
          ) : null}
          {vacancy?.address ? (
            <View style={styles.vacancyItem}>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.vacancyText} numberOfLines={1}>{vacancy.address}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Messages + Input */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loadingMessages ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Подсказки: сразу после мэтча поле пустое и обе стороны молчат.
            Нажатие подставляет текст в поле, не отправляя его. Лента уходит,
            как только человек начал печатать или уже что-то написал в чат. */}
        {showSuggestions ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.suggestScroll}
            contentContainerStyle={styles.suggestRow}
          >
            {suggestions.map(sg => (
              <TouchableOpacity
                key={sg.id}
                style={styles.suggestChip}
                activeOpacity={0.8}
                onPress={() => { setInput(sg.text); inputRef.current?.focus(); }}
              >
                <Text style={styles.suggestChipTxt}>{sg.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {/* Идёт запись — строка ввода заменяется счётчиком */}
        {recorderState.isRecording ? (
          <View style={[styles.inputBar, { paddingBottom: barPad }]}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={cancelRecording}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={21} color={Colors.red} />
            </TouchableOpacity>

            <View style={[styles.inputWrap, styles.recordWrap]}>
              <View style={styles.recDot} />
              <Text style={styles.recTime}>
                {fmtDuration(recorderState.durationMillis / 1000)}
              </Text>
              <Text style={styles.recHint}>Идёт запись…</Text>
            </View>

            <TouchableOpacity style={styles.sendBtn} onPress={stopAndSendVoice} activeOpacity={0.8}>
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
        /* Input bar */
        <View style={[styles.inputBar, { paddingBottom: barPad }]}>
          {/* Вложение — слева, как в мессенджерах */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={pickImage}
            disabled={isChatBlocked || uploadingImage}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {uploadingImage
              ? <ActivityIndicator size="small" color={Colors.textMuted} />
              : <Ionicons name="add" size={24} color={isChatBlocked ? Colors.textMuted : Colors.textSecondary} />}
          </TouchableOpacity>

          {/* Поле растёт до INPUT_MAX_H, дальше текст прокручивается внутри */}
          <View style={[styles.inputWrap, isChatBlocked && { opacity: 0.5 }]}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { height: inputH }]}
              value={input}
              onChangeText={isChatBlocked ? undefined : setInput}
              onContentSizeChange={e => {
                const h = e.nativeEvent.contentSize.height;
                setInputH(Math.max(INPUT_MIN_H, Math.min(INPUT_MAX_H, h)));
              }}
              placeholder={isChatBlocked ? 'Чат закрыт' : 'Сообщение'}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={1000}
              blurOnSubmit={false}
              editable={!isChatBlocked}
              scrollEnabled={inputH >= INPUT_MAX_H}
            />
          </View>

          {/* Пустое поле — предлагаем записать голосовое, как в мессенджерах */}
          {!input.trim() && voiceSupported && !isChatBlocked ? (
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={startRecording}
              disabled={uploadingVoice}
              activeOpacity={0.8}
            >
              {uploadingVoice
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="mic" size={20} color="#fff" />}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending || isChatBlocked) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim() || sending || isChatBlocked}
              activeOpacity={0.8}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="arrow-up" size={20} color="#fff" />}
            </TouchableOpacity>
          )}
        </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  // Decision bar (employer top bar)
  decisionBar: {
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    gap: 10,
  },
  decisionBarLabel: { fontSize: 12.5, fontWeight: '600', color: Colors.textSecondary },
  decisionStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  decisionBtnsRow: { flexDirection: 'row', gap: 10 },
  decisionBtn: {
    flex: 1, flexDirection: 'row', gap: 6,
    borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  // «Не подходит» — второстепенное действие: контур, без заливки и без красного
  decisionBtnReject: {
    backgroundColor: Colors.bg,
    borderWidth: 1.5, borderColor: Colors.inputBorder,
  },
  decisionBtnRejectTxt: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  // «Подходит» — главное действие
  decisionBtnAccept: { backgroundColor: Colors.primary },
  decisionBtnAcceptTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // Compact back icon button
  backIconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.divider,
  },
  backIconTxt: { fontSize: 22, color: Colors.textPrimary, lineHeight: 26, fontWeight: '400', marginTop: -1 },
  // Blocked bar (worker)
  blockedBar: {
    backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FECACA',
  },
  blockedBarTxt: { fontSize: 13, fontWeight: '600', color: Colors.red, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: {},
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  headerAvatar: { width: 34, height: 34, borderRadius: 17 },
  headerAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  headerSub: { fontSize: 11, color: Colors.textMuted, maxWidth: 160 },
  headerSubOnline: { color: Colors.green, fontWeight: '600' },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
  msgList: { padding: 16, gap: 8, paddingBottom: 8 },
  systemMsg: {
    alignSelf: 'center', backgroundColor: Colors.primaryLight,
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, marginVertical: 8,
    // Иконка и текст в строку — эмодзи из текста убраны
    flexDirection: 'row', alignItems: 'flex-start', gap: 7, maxWidth: '88%',
  },
  systemMsgMatch: { backgroundColor: '#D1FAE5', borderRadius: 12 },
  systemMsgReject: { backgroundColor: '#FEE2E2', borderRadius: 12 },
  systemText: { flexShrink: 1, fontSize: 13, color: Colors.primary, fontWeight: '600' },
  systemTextMatch: { color: Colors.green },
  systemTextReject: { color: Colors.red },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 2 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, flexShrink: 0 },
  msgAvatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  bubble: { maxWidth: '72%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMe: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.surface, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  bubbleImage: { padding: 3, overflow: 'hidden' },
  msgImage: { width: 208, height: 208, borderRadius: 15, backgroundColor: Colors.divider },
  bubbleTextMe: { color: '#fff' },
  daySep: { alignSelf: 'center', marginVertical: 10 },
  daySepTxt: {
    fontSize: 11.5, fontWeight: '600', color: Colors.textSecondary,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.divider,
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4,
    overflow: 'hidden',
  },
  timestamp: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  timestampMe: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  // Раньше подсказки лежали в ленте, прокручиваемой вбок: видно было две-три,
  // остальные приходилось искать пальцем. Теперь переносятся на строки и видны
  // сразу. Высоту ограничиваем, иначе восемь фраз съедят пол-экрана над
  // клавиатурой — дальше обычная прокрутка вниз.
  suggestScroll: {
    flexGrow: 0, maxHeight: 168,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  suggestRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  suggestChip: {
    borderWidth: 1, borderColor: Colors.primaryBorder,
    backgroundColor: Colors.primaryLight,
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8,
  },
  suggestChipTxt: { fontSize: 13.5, fontWeight: '600', color: Colors.primary },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.bg,
  },
  // Кнопки одного размера и по нижнему краю — поле растёт вверх, они стоят ровно
  attachBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1, borderColor: Colors.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
    minHeight: 38,
  },
  safetyMsg: {
    marginHorizontal: 12, marginVertical: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#FDE68A',
    gap: 6,
  },
  safetyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  safetyIconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FDE9C8', alignItems: 'center', justifyContent: 'center',
  },
  safetyTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  safetyText: { fontSize: 12, color: '#78350F', lineHeight: 17 },
  // Rejection confirmation modal
  confirmOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  confirmCard: {
    backgroundColor: Colors.bg, borderRadius: 20, padding: 24, width: '100%', gap: 14,
  },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  confirmBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  confirmCancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder,
    borderRadius: 100, paddingVertical: 13, alignItems: 'center',
  },
  confirmCancelTxt: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  confirmRejectBtn: { flex: 1, backgroundColor: Colors.red, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  confirmRejectTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  vacancyBar: { // Corrected: Added 'vacancyBar' to align with the missing style error
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  vacancyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.bg, borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.divider,
  },

  vacancyText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', maxWidth: 160 },
  // Фон и скругление — у обёртки; само поле прозрачное, чтобы высота
  // считалась только по тексту и рост был плавным
  textInput: {
    fontSize: 15, color: Colors.textPrimary,
    padding: 0, margin: 0,
    textAlignVertical: 'top',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  recordWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.red },
  recTime: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, fontVariant: ['tabular-nums'] },
  recHint: { fontSize: 13, color: Colors.textMuted },
});
