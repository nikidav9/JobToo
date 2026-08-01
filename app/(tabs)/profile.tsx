
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, FlatList, LayoutAnimation, UIManager, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { getInitials, nameColorFromString } from '@/services/storage';
import { dbGetRatingsForUser, dbChangePassword, UserRating } from '@/services/db';
import { getSupabaseClient } from '@/template';
import { resetOnboarding } from '@/components/OnboardingOverlay';
import { TabHeader } from '@/components/ui/TabHeader';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MetroPicker } from '@/components/feature/MetroPicker';
import { WorkTypeSelector } from '@/components/feature/WorkTypeSelector';
import { WorkType } from '@/constants/types';
import { WORK_TYPE_META } from '@/components/feature/WorkTypeSelector';

const COMPANY_OPTIONS = ['Лавка'] as const;
type CompanyOption = typeof COMPANY_OPTIONS[number];
import { METRO_LINES } from '@/constants/metro';
import { NotifBell } from '@/components/ui/NotifBell';
import { SheetHandle, useSwipeToDismiss } from '@/components/ui/Sheet';
import { TelegramConnectButton } from '@/components/TelegramConnectButton';

import { rs, rf } from '@/constants/scale';

type EditSection = 'personal' | 'metro' | 'worktypes' | 'company' | 'bio' | null;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Плавное раскрытие секций. На старой архитектуре Android LayoutAnimation
// нужно включать вручную, иначе секции просто «прыгают».
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function StarRating({ rating, count, onPress }: { rating: number; count: number; onPress?: () => void }) {
  const content = (
    <View style={rS.row}>
      {[1, 2, 3, 4, 5].map(s => (
        <Text key={s} style={[rS.star, rating >= s - 0.5 ? rS.starFilled : rS.starEmpty]}>★</Text>
      ))}
      <Text style={rS.count}>
        {count > 0 ? `${rating.toFixed(1)} (${count} отз.)` : 'Нет оценок'}
      </Text>
      {count > 0 && onPress ? <Text style={rS.viewAll}>Смотреть все ›</Text> : null}
    </View>
  );
  if (onPress && count > 0) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const rS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: rs(2), marginTop: rs(2) },
  star: { fontSize: rf(18) },
  starFilled: { color: '#FBBF24' },
  starEmpty: { color: '#E5E7EB' },
  count: { fontSize: rf(13), color: Colors.textMuted, marginLeft: rs(4) },
  viewAll: { fontSize: rf(12), color: Colors.primary, fontWeight: '600', marginLeft: rs(6) },
});

// ─── Ratings Modal ────────────────────────────────────────────────────────────
function RatingsModal({ userId, users, onClose }: { userId: string; users: any[]; onClose: () => void }) {
  const [ratings, setRatings] = useState<UserRating[]>([]);
  const [loading, setLoading] = useState(true);
  const reviewsSwipe = useSwipeToDismiss(onClose);

  const fetchRatings = () => {
    dbGetRatingsForUser(userId)
      .then(setRatings)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRatings(); }, [userId]);

  // Real-time: new rating arrives while modal is open → refresh instantly (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let channel: ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | null = null;
    try {
      const sb = getSupabaseClient();
      channel = sb
        // Сигнал от сервера вместо подписки на таблицу: к таблицам доступ
        // закрыт, а канал трансляции их не касается.
        .channel(`ratings:${userId}`)
        .on('broadcast', { event: 'refresh' }, fetchRatings)
        .subscribe();
    } catch (e) {
      console.warn('[RatingsModal] realtime subscription failed:', e);
    }
    return () => {
      try { channel?.unsubscribe(); } catch {}
    };
  }, [userId]);

  const avg = ratings.length > 0
    ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
    : 0;

  const renderItem = ({ item }: { item: UserRating }) => {
    const reviewer = users.find(u => u.id === item.fromUserId);
    const name = reviewer
      ? `${reviewer.firstName} ${reviewer.lastName}`
      : (item.role === 'worker' ? 'Работник' : 'Работодатель');
    const color = reviewer ? nameColorFromString(reviewer.id) : '#9CA3AF';
    const initials = reviewer ? getInitials(name) : '?';
    const date = new Date(item.createdAt);
    const dateStr = `${date.getDate().toString().padStart(2,'0')}.${(date.getMonth()+1).toString().padStart(2,'0')}.${date.getFullYear()}`;

    return (
      <View style={rmS.card}>
        <View style={rmS.cardTop}>
          {reviewer?.avatarUrl ? (
            <View style={[rmS.avatar, { overflow: 'hidden' }]}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={rmS.avatarTxt}>{initials}</Text>
              </View>
            </View>
          ) : (
            <View style={[rmS.avatar, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={rmS.avatarTxt}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={rmS.name}>{name}</Text>
            <Text style={rmS.role}>{item.role === 'employer' ? 'Работодатель' : 'Работник'} · {dateStr}</Text>
          </View>
          <View style={rmS.starsRow}>
            {[1,2,3,4,5].map(s => (
              <Text key={s} style={[rmS.star, item.rating >= s ? rmS.starFilled : rmS.starEmpty]}>★</Text>
            ))}
          </View>
        </View>
        {item.reviewText ? (
          <Text style={rmS.review}>"{item.reviewText}"</Text>
        ) : (
          <Text style={rmS.noReview}>Комментарий не оставлен</Text>
        )}
      </View>
    );
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={rmS.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[rmS.sheet, reviewsSwipe.animStyle]}>
          <View {...reviewsSwipe.panHandlers}>
            <SheetHandle />
            <View style={rmS.header}>
              <Text style={rmS.title}>Мои отзывы</Text>
            </View>
          </View>

          {/* Summary */}
          {ratings.length > 0 ? (
            <View style={rmS.summary}>
              <Text style={rmS.summaryAvg}>{avg.toFixed(1)}</Text>
              <View>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1,2,3,4,5].map(s => (
                    <Text key={s} style={[rmS.sumStar, avg >= s - 0.5 ? rmS.starFilled : rmS.starEmpty]}>★</Text>
                  ))}
                </View>
                <Text style={rmS.summaryCount}>{ratings.length} {ratings.length === 1 ? 'отзыв' : ratings.length < 5 ? 'отзыва' : 'отзывов'}</Text>
              </View>
            </View>
          ) : null}

          {loading ? (
            <View style={{ padding: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : ratings.length === 0 ? (
            <View style={rmS.empty}>
              <Text style={{ fontSize: rf(44) }}>⭐</Text>
              <Text style={rmS.emptyTitle}>Отзывов пока нет</Text>
              <Text style={rmS.emptySub}>Оценки появятся после завершённых смен</Text>
            </View>
          ) : (
            <FlatList
              data={ratings}
              keyExtractor={r => r.id}
              renderItem={renderItem}
              contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const rmS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rs(20), paddingTop: rs(16), paddingBottom: rs(12) },
  title: { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: rs(16),
    marginHorizontal: rs(16), marginBottom: rs(8),
    backgroundColor: '#FFFBEB', borderRadius: rs(14),
    padding: rs(14), borderWidth: 1, borderColor: '#FDE68A',
  },
  summaryAvg: { fontSize: rf(44), fontWeight: '800', color: '#92400E' },
  sumStar: { fontSize: rf(20) },
  starFilled: { color: '#FBBF24' },
  starEmpty: { color: '#E5E7EB' },
  summaryCount: { fontSize: rf(13), color: '#B45309', fontWeight: '600', marginTop: rs(2) },
  empty: { alignItems: 'center', padding: rs(48), gap: rs(10) },
  emptyTitle: { fontSize: rf(17), fontWeight: '700', color: Colors.textPrimary },
  emptySub: { fontSize: rf(13), color: Colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: rs(14), padding: rs(14), gap: rs(10) },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  avatar: { width: rs(36), height: rs(36), borderRadius: rs(18) },
  avatarTxt: { color: '#fff', fontSize: rf(13), fontWeight: '700' },
  name: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  role: { fontSize: rf(11), color: Colors.textMuted, marginTop: rs(1) },
  starsRow: { flexDirection: 'row', gap: rs(1) },
  star: { fontSize: rf(16) },
  review: { fontSize: rf(13), color: Colors.textPrimary, lineHeight: rf(18), fontStyle: 'italic', paddingLeft: rs(4) },
  noReview: { fontSize: rf(12), color: Colors.textMuted, fontStyle: 'italic', paddingLeft: rs(4) },
});

export default function ProfileScreen() {
  const router = useRouter();
  const { currentUser, logout, users, showToast, updateUser, unreadCount } = useApp();
  const [editSection, setEditSection] = useState<EditSection>(null);
  // Раскрыта всегда не больше одной секции: экран остаётся коротким
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [showRatings, setShowRatings] = useState(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [metroPicker, setMetroPicker] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  // Полоска сверху обещает смахивание — значит оно должно работать
  const editSwipe = useSwipeToDismiss(() => setEditSection(null));
  const notifSwipe = useSwipeToDismiss(() => setShowNotifications(false));
  const pwdSwipe = useSwipeToDismiss(() => setShowSettings(false));
  const [showPhotoSource, setShowPhotoSource] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [curPassword, setCurPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [editPhone, setEditPhone] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editFirst, setEditFirst] = useState('');
  const [editMetroLineId, setEditMetroLineId] = useState('');
  const [editMetroLineName, setEditMetroLineName] = useState('');
  const [editMetroStation, setEditMetroStation] = useState('');
  const [editWorkTypes, setEditWorkTypes] = useState<WorkType[]>([]);
  const [editCompany, setEditCompany] = useState<CompanyOption | ''>('');
  const [editBio, setEditBio] = useState('');

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const initials = getInitials(`${currentUser.firstName} ${currentUser.lastName}`);
  const avatarColor = nameColorFromString(currentUser.id);
  const line = METRO_LINES.find(l => l.id === currentUser.metroLineId);
  const workTypeLabels = (currentUser.workTypes ?? []).map(t => WORK_TYPE_META[t]?.label ?? t);

  const toggleSection = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(
      200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity,
    ));
    setOpenSection(prev => (prev === key ? null : key));
  };

  const openEdit = (section: EditSection) => {
    setEditSection(section);
    setEditPhone(currentUser.phone);
    setEditLast(currentUser.lastName);
    setEditFirst(currentUser.firstName);
    setEditMetroLineId(currentUser.metroLineId ?? '');
    setEditMetroStation(currentUser.metroStation ?? '');
    setEditMetroLineName(line?.name ?? '');
    setEditWorkTypes((currentUser.workTypes ?? []) as WorkType[]);
    const savedCompany = currentUser.company ?? '';
    setEditCompany(COMPANY_OPTIONS.includes(savedCompany as CompanyOption) ? savedCompany as CompanyOption : '');
    setEditBio(currentUser.bio ?? '');
  };

  const saveEdit = async () => {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const updated = { ...currentUser };
      if (editSection === 'personal') { updated.phone = editPhone; updated.lastName = editLast; updated.firstName = editFirst; }
      if (editSection === 'metro') { updated.metroLineId = editMetroLineId; updated.metroStation = editMetroStation; }
      if (editSection === 'worktypes') updated.workTypes = editWorkTypes;
      if (editSection === 'company') { updated.company = editCompany; updated.bio = editBio; }
      if (editSection === 'bio') updated.bio = editBio;
      // Close modal immediately — sync to server in background
      setEditSection(null);
      setSavingEdit(false);
      showToast('Сохранено', 'success');
      updateUser(updated).catch(() => showToast('Ошибка синхронизации', 'error'));
    } catch {
      showToast('Ошибка при сохранении', 'error');
      setSavingEdit(false);
    }
  };

  // ── Base64 → Uint8Array (без atob — работает на всех RN платформах) ─────
  const base64ToUint8Array = (base64: string): Uint8Array => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
    const clean = base64.replace(/=/g, '');
    const len = clean.length;
    const bufLen = Math.floor((len * 3) / 4);
    const buf = new Uint8Array(bufLen);
    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const a = lookup[clean.charCodeAt(i)];
      const b = lookup[clean.charCodeAt(i + 1)];
      const c = lookup[clean.charCodeAt(i + 2)] ?? 0;
      const d = lookup[clean.charCodeAt(i + 3)] ?? 0;
      buf[p++] = (a << 2) | (b >> 4);
      if (p < bufLen) buf[p++] = ((b & 15) << 4) | (c >> 2);
      if (p < bufLen) buf[p++] = ((c & 3) << 6) | d;
    }
    return buf;
  };

  // ── Shared upload helper ──────────────────────────────────────────────────
  const processAndUpload = async (sourceUri: string) => {
    setUploadingPhoto(true);
    const prevAvatarUrl = currentUser.avatarUrl;
    try {
      // 1. Crop + resize + compress через ImageManipulator
      const info = await ImageManipulator.manipulateAsync(sourceUri, [], { format: ImageManipulator.SaveFormat.JPEG });
      const w = info.width;
      const h = info.height;
      const size = Math.min(w, h);
      const originX = Math.floor((w - size) / 2);
      const originY = Math.floor((h - size) / 2);

      const processed = await ImageManipulator.manipulateAsync(
        sourceUri,
        [
          { crop: { originX, originY, width: size, height: size } },
          { resize: { width: 600, height: 600 } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // 2. Локальный оптимистичный апдейт через updateUser (без записи в БД)
      // — пропускаем, финальный апдейт будет после загрузки

      // 3. Забираем содержимое файла.
      // На телефоне это путь, и читает его expo-file-system. В браузере тот же
      // модуль — пустая заглушка без единого метода, а ссылка выглядит как
      // blob:, поэтому содержимое берём запросом. Раньше звали expo-file-system
      // всегда, и на вебе смена фото падала.
      let uint8Array: Uint8Array;
      if (Platform.OS === 'web') {
        const resp = await fetch(processed.uri);
        uint8Array = new Uint8Array(await (await resp.blob()).arrayBuffer());
      } else {
        const base64Data = await FileSystem.readAsStringAsync(processed.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uint8Array = base64ToUint8Array(base64Data);
      }

      // 4. Загружаем через Supabase JS клиент (самый надёжный способ)
      const fileName = `avatar_${currentUser.id}.jpg`;
      const sb = getSupabaseClient();
      const { error: uploadError } = await sb.storage
        .from('avatars')
        .upload(fileName, uint8Array, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '3600',
        });

      // Не залилось — дальше идти нельзя: в профиль записался бы адрес файла,
      // которого нет, и вместо аватарки у человека осталась бы пустота. Раньше
      // ошибку считали безобидной и просто логировали — ровно так же прятались
      // неудачные загрузки голосовых, которые не работали месяцами.
      if (uploadError) throw uploadError;

      // 5. Получаем публичный URL и синхронизируем с БД
      const { data: urlData } = sb.storage.from('avatars').getPublicUrl(fileName);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const updated = { ...currentUser, avatarUrl };
      await updateUser(updated);
      showToast('Фото обновлено', 'success');
    } catch (e) {
      console.error('[Avatar] processAndUpload error', e);
      updateUser({ ...currentUser, avatarUrl: prevAvatarUrl }).catch(() => {});
      showToast('Не удалось обновить фото. Проверьте доступ к памяти.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Pick from gallery ────────────────────────────────────────────────────
  const pickFromGallery = async () => {
    setShowPhotoSource(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast('Нет доступа к галерее. Разрешите доступ в настройках.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // We handle crop ourselves via ImageManipulator
        quality: 1,           // Take full quality; we compress in processAndUpload
      });
      if (!result.canceled && result.assets[0]) {
        await processAndUpload(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[Avatar] pickFromGallery error', e);
      showToast('Не удалось открыть галерею.', 'error');
    }
  };

  // ── Pick from camera ─────────────────────────────────────────────────────
  const pickFromCamera = async () => {
    setShowPhotoSource(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast('Нет доступа к камере. Разрешите доступ в настройках.', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        await processAndUpload(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[Avatar] pickFromCamera error', e);
      showToast('Не удалось открыть камеру.', 'error');
    }
  };

  const pickAndUploadPhoto = () => {
    setShowPhotoSource(true);
  };

  const handleLogout = async () => {
    setShowConfirmLogout(false);
    try {
      await logout();
      showToast('Вы успешно вышли', 'success');
    } catch (error) {
      console.warn('[Profile] logout failed', error);
      showToast('Ошибка при выходе, попробуйте снова', 'error');
    }
    // Navigation is handled by <Redirect href="/" /> in (tabs)/_layout.tsx
  };

  const handleDeleteAccount = async () => {
    if (!currentUser || deletingAccount) return;
    setShowConfirmDelete(false);
    setDeletingAccount(true);
    try {
      const sb = getSupabaseClient();
      await sb.from('jm_users').delete().eq('id', currentUser.id);
      await logout();
      showToast('Аккаунт удалён', 'success');
    } catch (e) {
      console.warn('[Profile] deleteAccount failed', e);
      showToast('Ошибка при удалении, попробуйте снова', 'error');
    } finally {
      setDeletingAccount(false);
    }
    // Navigation is handled by <Redirect href="/" /> in (tabs)/_layout.tsx
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TabHeader right={
        <View style={styles.headerActions}>
          <TelegramConnectButton size={22} pad={4} />
          <TouchableOpacity onPress={() => setShowNotifications(true)} style={styles.headerBtn}>
            <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      } />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* User card — horizontal layout */}
        <View style={styles.userCard}>
          <TouchableOpacity onPress={pickAndUploadPhoto} activeOpacity={0.8} style={styles.avatarWrapper}>
            {currentUser.avatarUrl ? (
              <Image
                source={{ uri: currentUser.avatarUrl }}
                style={styles.bigAvatarImg}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.bigAvatar, { backgroundColor: avatarColor }]}>
                <Text style={styles.bigAvatarText}>{initials}</Text>
              </View>
            )}
            {uploadingPhoto ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <View style={styles.avatarCameraBtn}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <Text style={styles.fullName}>{currentUser.firstName} {currentUser.lastName}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{currentUser.role === 'worker' ? 'Работник' : 'Работодатель'}</Text>
            </View>
            <Text style={styles.phone}>{currentUser.phone}</Text>
            <StarRating
              rating={currentUser.avgRating ?? 0}
              count={currentUser.ratingCount ?? 0}
              onPress={() => setShowRatings(true)}
            />
          </View>

          {/* Без стрелки: редактирование — через «Личные данные» ниже */}
        </View>

        <SectionCard
          iconName="person"
          iconBg={Colors.primary}
          title="Личные данные"
          summary={currentUser.phone}
          open={openSection === 'personal'}
          onToggle={() => toggleSection('personal')}
          onEdit={() => openEdit('personal')}
          rows={[
            { label: 'Телефон', value: currentUser.phone },
            { label: 'Фамилия', value: currentUser.lastName },
            { label: 'Имя', value: currentUser.firstName },
          ]}
        />

        {currentUser.role === 'worker' ? (
          <>
            <SectionCard
              iconName="briefcase"
              iconBg={Colors.primary}
              title="Специализация"
              summary={workTypeLabels.length ? workTypeLabels.join(', ') : 'Не указана'}
              open={openSection === 'worktypes'}
              onToggle={() => toggleSection('worktypes')}
              onEdit={() => openEdit('worktypes')}
              chips={workTypeLabels}
              placeholder="Специализация пока не выбрана"
            />
            <SectionCard
              iconName="train"
              iconBg="#1C1C1E"
              title="Метро"
              summary={currentUser.metroStation ?? 'Не указано'}
              open={openSection === 'metro'}
              onToggle={() => toggleSection('metro')}
              onEdit={() => openEdit('metro')}
              rows={[
                { label: 'Линия', value: line?.name ?? '—', lineColor: line?.color },
                { label: 'Станция', value: currentUser.metroStation ?? '—' },
              ]}
            />
            <SectionCard
              iconName="document-text"
              iconBg={Colors.primary}
              title="О себе"
              summary={currentUser.bio ? currentUser.bio : 'Не заполнено'}
              open={openSection === 'bio'}
              onToggle={() => toggleSection('bio')}
              onEdit={() => openEdit('bio')}
              rows={currentUser.bio ? [{ label: '', value: currentUser.bio }] : []}
              placeholder="Расскажите о себе — опыт, навыки, предпочтения"
            />
          </>
        ) : (
          <>
            <SectionCard
              iconName="business"
              iconBg={Colors.primary}
              title="Компания"
              summary={currentUser.company ?? 'Не указана'}
              open={openSection === 'company'}
              onToggle={() => toggleSection('company')}
              onEdit={() => openEdit('company')}
              rows={[{ label: 'Название', value: currentUser.company ?? '—' }]}
            />
            <SectionCard
              iconName="document-text"
              iconBg={Colors.primary}
              title="О компании"
              summary={currentUser.bio ? currentUser.bio : 'Не заполнено'}
              open={openSection === 'bio'}
              onToggle={() => toggleSection('bio')}
              onEdit={() => openEdit('bio')}
              rows={currentUser.bio ? [{ label: '', value: currentUser.bio }] : []}
              placeholder="Расскажите о компании, условиях, коллективе"
            />
          </>
        )}

        {/* Документы */}
        <SectionCard
          iconName="document-text"
          iconBg="#6B7280"
          title="Документы"
          summary="Соглашения и обучение"
          open={openSection === 'docs'}
          onToggle={() => toggleSection('docs')}
        >
          {[
            { label: 'Пользовательское соглашение', doc: 'terms' },
            { label: 'Политика конфиденциальности', doc: 'privacy' },
            { label: 'Согласие на обработку данных', doc: 'consent' },
          ].map((item) => (
            <TouchableOpacity
              key={item.doc}
              style={sS.actionRow}
              onPress={() => router.push({ pathname: '/legal', params: { doc: item.doc } })}
              activeOpacity={0.7}
            >
              <Text style={[sS.actionLabel, { flex: 1 }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={sS.actionRow}
            onPress={async () => {
              if (currentUser) { await resetOnboarding(currentUser.id); }
              // Без уведомления: обучение и так открывается сразу на главной
              router.push('/(tabs)/feed');
            }}
            activeOpacity={0.7}
          >
            <Text style={[sS.actionLabel, { flex: 1 }]}>Показать обучение снова</Text>
            <Ionicons name="refresh" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </SectionCard>

        {/* Аккаунт — все действия с учётной записью в одном месте */}
        <SectionCard
          iconName="shield-checkmark"
          iconBg="#1C1C1E"
          title="Аккаунт"
          summary="Пароль, выход, удаление"
          open={openSection === 'account'}
          onToggle={() => toggleSection('account')}
        >
          <TouchableOpacity style={sS.actionRow} onPress={() => setShowSettings(true)} activeOpacity={0.7}>
            <Ionicons name="key-outline" size={17} color={Colors.textSecondary} />
            <Text style={[sS.actionLabel, { flex: 1 }]}>Сменить пароль</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={sS.actionRow} onPress={() => setShowConfirmLogout(true)} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={17} color={Colors.textSecondary} />
            <Text style={[sS.actionLabel, { flex: 1 }]}>Выйти из аккаунта</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={sS.actionRow}
            onPress={() => setShowConfirmDelete(true)}
            disabled={deletingAccount}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={17} color={Colors.red} />
            <Text style={[sS.actionLabel, { flex: 1, color: Colors.red }]}>
              {deletingAccount ? 'Удаление...' : 'Удалить аккаунт'}
            </Text>
          </TouchableOpacity>
        </SectionCard>
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* Photo source picker */}
      {showPhotoSource ? (
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { gap: 0, padding: 0, overflow: 'hidden' }]}>
            <View style={{ padding: 20, paddingBottom: 16 }}>
              <Text style={[styles.confirmTitle, { fontSize: rf(16) }]}>Обновить фото</Text>
              <Text style={[styles.confirmBody, { marginTop: 4 }]}>Выберите источник фото</Text>
            </View>
            <TouchableOpacity
              style={photoSrcS.row}
              onPress={pickFromCamera}
              activeOpacity={0.8}
            >
              <Text style={photoSrcS.icon}>📸</Text>
              <Text style={photoSrcS.label}>Камера</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[photoSrcS.row, photoSrcS.rowBorder]}
              onPress={pickFromGallery}
              activeOpacity={0.8}
            >
              <Text style={photoSrcS.icon}>🖼</Text>
              <Text style={photoSrcS.label}>Галерея</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[photoSrcS.row, photoSrcS.rowBorder, { paddingVertical: 16 }]}
              onPress={() => setShowPhotoSource(false)}
              activeOpacity={0.8}
            >
              <Text style={[photoSrcS.label, { color: Colors.textMuted, textAlign: 'center', flex: 1 }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Ratings modal */}
      {showRatings ? (
        <RatingsModal
          userId={currentUser.id}
          users={users}
          onClose={() => setShowRatings(false)}
        />
      ) : null}

      {/* Edit modal */}
      <Modal statusBarTranslucent navigationBarTranslucent visible={!!editSection} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditSection(null)} />
          <Animated.View style={[styles.modalSheet, editSwipe.animStyle]}>
            <View {...editSwipe.panHandlers}><SheetHandle /></View>
            <Text style={styles.modalTitle}>Изменить</Text>

            {editSection === 'personal' && (
              <View style={{ gap: 12 }}>
                <AppInput label="Телефон" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
                <AppInput label="Фамилия" value={editLast} onChangeText={setEditLast} />
                <AppInput label="Имя" value={editFirst} onChangeText={setEditFirst} />
              </View>
            )}
            {editSection === 'metro' && (
              <View style={{ gap: 12 }}>
                {editMetroStation ? (
                  <View style={styles.metroRow}>
                    <View style={[styles.dot, { backgroundColor: METRO_LINES.find(l => l.id === editMetroLineId)?.color }]} />
                    <Text style={styles.metroVal}>{editMetroStation}</Text>
                    <TouchableOpacity onPress={() => setMetroPicker(true)}>
                      <Text style={{ color: Colors.primary, fontWeight: '600' }}>Изменить</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.metroPickBtn} onPress={() => setMetroPicker(true)}>
                    <Text style={{ color: Colors.textPrimary }}>🚇 Выбрать станцию</Text>
                    <Text style={{ color: Colors.textMuted }}>›</Text>
                  </TouchableOpacity>
                )}
                <MetroPicker
                  visible={metroPicker}
                  onClose={() => setMetroPicker(false)}
                  onSelect={(lid, lname, st) => { setEditMetroLineId(lid); setEditMetroLineName(lname); setEditMetroStation(st); setMetroPicker(false); }}
                  selectedLineId={editMetroLineId}
                  selectedStation={editMetroStation}
                />
              </View>
            )}
            {editSection === 'worktypes' && (
              <WorkTypeSelector selected={editWorkTypes} onToggle={t => setEditWorkTypes([t])} />
            )}
            {editSection === 'company' && (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: rf(13), fontWeight: '500', color: Colors.textSecondary }}>Название компании</Text>
                {COMPANY_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[pStyles.companyOption, editCompany === opt && pStyles.companyOptionActive]}
                    onPress={() => setEditCompany(opt)}
                    activeOpacity={0.8}
                  >
                    <View style={[pStyles.companyRadio, editCompany === opt && pStyles.companyRadioActive]}>
                      {editCompany === opt ? <View style={pStyles.companyRadioDot} /> : null}
                    </View>
                    <Text style={[pStyles.companyLabel, editCompany === opt && pStyles.companyLabelActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
                <AppInput label="О компании" value={editBio} onChangeText={setEditBio} placeholder="Расскажите о компании..." multiline numberOfLines={4} />
              </View>
            )}
            {editSection === 'bio' && (
              <AppInput
                label={currentUser.role === 'worker' ? 'О себе' : 'О компании'}
                value={editBio}
                onChangeText={setEditBio}
                placeholder={currentUser.role === 'worker' ? 'Расскажите о себе — опыт, навыки, предпочтения' : 'Расскажите о компании, условиях, коллективе'}
                multiline
                numberOfLines={5}
              />
            )}

            <View style={{ marginTop: 20, gap: 10 }}>
              <PrimaryButton label="Сохранить" onPress={saveEdit} disabled={savingEdit} />
              <PrimaryButton label="Отмена" onPress={() => setEditSection(null)} secondary />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirm delete account */}
      {showConfirmDelete ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Удалить аккаунт?</Text>
            <Text style={styles.confirmBody}>
              Все ваши данные будут удалены безвозвратно. Восстановление невозможно.
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfirmDelete(false)}>
                <Text style={styles.cancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutConfirmBtn} onPress={handleDeleteAccount}>
                <Text style={styles.logoutConfirmText}>Удалить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {/* Confirm logout */}
      {showConfirmLogout ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Выйти из аккаунта?</Text>
            <Text style={styles.confirmBody}>Вы сможете войти снова по номеру телефона</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfirmLogout(false)}>
                <Text style={styles.cancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutConfirmBtn} onPress={handleLogout}>
                <Text style={styles.logoutConfirmText}>Выйти</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {/* Notifications modal */}
      <Modal statusBarTranslucent navigationBarTranslucent visible={showNotifications} transparent animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowNotifications(false)}>
          <Animated.View style={[styles.modalSheet, notifSwipe.animStyle]} onStartShouldSetResponder={() => true}>
            <View {...notifSwipe.panHandlers}>
              <SheetHandle />
              <Text style={styles.modalTitle}>Уведомления</Text>
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
              <Ionicons name="notifications-outline" size={56} color={Colors.textMuted} />
              <Text style={{ fontSize: rf(17), fontWeight: '700', color: Colors.textPrimary }}>Уведомлений пока нет</Text>
              <Text style={{ fontSize: rf(13), color: Colors.textMuted, textAlign: 'center' }}>
                Здесь будут появляться уведомления и новости от приложения
              </Text>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Change password modal */}
      <Modal statusBarTranslucent navigationBarTranslucent visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowSettings(false)} />
          <Animated.View style={[styles.modalSheet, pwdSwipe.animStyle]}>
            <View {...pwdSwipe.panHandlers}>
              <SheetHandle />
              <Text style={styles.modalTitle}>Изменить пароль</Text>
            </View>
            <View style={{ gap: 12 }}>
              <AppInput
                label="Текущий пароль"
                value={curPassword}
                onChangeText={setCurPassword}
                secureTextEntry
                placeholder="Введите текущий пароль"
              />
              <AppInput
                label="Новый пароль"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Минимум 6 символов"
              />
              <AppInput
                label="Повторите новый пароль"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Повторите новый пароль"
              />
            </View>
            <View style={{ marginTop: 8, gap: 10 }}>
              <PrimaryButton
                label={savingPassword ? 'Сохранение...' : 'Сохранить пароль'}
                disabled={savingPassword}
                onPress={async () => {
                  if (!curPassword || !newPassword || !confirmPassword) {
                    showToast('Заполните все поля', 'error'); return;
                  }
                  if (newPassword.length < 6) {
                    showToast('Пароль должен быть не менее 6 символов', 'error'); return;
                  }
                  if (newPassword !== confirmPassword) {
                    showToast('Пароли не совпадают', 'error'); return;
                  }
                  setSavingPassword(true);
                  try {
                    // Текущий пароль сверяет сервер. Раньше сравнивали здесь,
                    // строкой с currentUser.password, — и для всех, у кого в
                    // базе уже хеш, смена пароля просто не проходила.
                    const res = await dbChangePassword(currentUser.id, curPassword, newPassword);
                    if (!res.ok) {
                      showToast('Неверный текущий пароль', 'error'); return;
                    }
                    setCurPassword(''); setNewPassword(''); setConfirmPassword('');
                    setShowSettings(false);
                    showToast('Пароль изменён', 'success');
                  } catch {
                    showToast('Ошибка при сохранении', 'error');
                  } finally {
                    setSavingPassword(false);
                  }
                }}
              />
              <PrimaryButton label="Отмена" onPress={() => setShowSettings(false)} secondary />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// Свёрнутая секция — одна строка: иконка, название и короткая сводка.
// Раскрывается по нажатию; одновременно открыта только одна (см. openSection).
function SectionCard({
  iconName, iconBg, title, summary, open, onToggle, onEdit,
  rows, chips, placeholder, children,
}: {
  iconName: IoniconName;
  iconBg?: string;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  rows?: { label: string; value: string; lineColor?: string }[];
  chips?: string[];
  placeholder?: string;
  children?: React.ReactNode;
}) {
  const list = rows ?? [];
  const hasContent = list.length > 0 || (chips?.length ?? 0) > 0;
  return (
    <View style={sS.card}>
      <TouchableOpacity style={sS.header} onPress={onToggle} activeOpacity={0.7}>
        <View style={[sS.iconSquare, { backgroundColor: iconBg ?? Colors.primary }]}>
          <Ionicons name={iconName} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sS.title}>{title}</Text>
          {!open && summary ? (
            <Text style={sS.summary} numberOfLines={1}>{summary}</Text>
          ) : null}
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textMuted}
        />
      </TouchableOpacity>

      {open ? (
        <View style={sS.body}>
          {list.map((r, i) => (
            r.label ? (
              <View key={i} style={sS.row}>
                <Text style={sS.label}>{r.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {r.lineColor ? <View style={[sS.dot, { backgroundColor: r.lineColor }]} /> : null}
                  <Text style={sS.value}>{r.value}</Text>
                </View>
              </View>
            ) : (
              <Text key={i} style={sS.bioText}>{r.value}</Text>
            )
          ))}
          {!hasContent && placeholder ? <Text style={sS.placeholder}>{placeholder}</Text> : null}
          {chips && chips.length > 0 ? (
            <View style={sS.chipsRow}>
              {chips.map((c, i) => <View key={i} style={sS.chip}><Text style={sS.chipText}>{c}</Text></View>)}
            </View>
          ) : null}
          {children}
          {onEdit ? (
            <TouchableOpacity style={sS.editBtn} onPress={onEdit} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
              <Text style={sS.editBtnTxt}>Изменить</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const sS = StyleSheet.create({
  card: { backgroundColor: Colors.bg, borderRadius: rs(16), ...Shadow.card, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: rs(10), paddingHorizontal: rs(16), paddingVertical: rs(14) },
  iconSquare: { width: rs(34), height: rs(34), borderRadius: rs(9), alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
  summary: { fontSize: rf(12.5), color: Colors.textMuted, marginTop: rs(2) },
  body: { paddingHorizontal: rs(16), paddingBottom: rs(14) },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6),
    marginTop: rs(12), paddingVertical: rs(11),
    borderRadius: rs(12), backgroundColor: Colors.primaryLight,
  },
  editBtnTxt: { fontSize: rf(14), fontWeight: '700', color: Colors.primary },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(10),
    paddingVertical: rs(13), borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  actionLabel: { fontSize: rf(14), color: Colors.textPrimary, fontWeight: '500' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: rs(10), borderTopWidth: 1, borderTopColor: Colors.divider },
  label: { fontSize: rf(13), color: Colors.textMuted },
  value: { fontSize: rf(14), fontWeight: '500', color: Colors.textPrimary },
  dot: { width: rs(10), height: rs(10), borderRadius: rs(5) },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(8), marginTop: rs(4) },
  chip: { backgroundColor: Colors.primaryLight, borderRadius: rs(100), paddingHorizontal: rs(14), paddingVertical: rs(6) },
  chipText: { fontSize: rf(13), fontWeight: '600', color: Colors.primary },
  bioText: { fontSize: rf(14), color: Colors.textPrimary, lineHeight: rf(20), paddingTop: rs(8) },
  placeholder: { fontSize: rf(13), color: Colors.textMuted, fontStyle: 'italic', paddingTop: rs(4) },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.outerBg ?? '#F5F7FA' },
  scroll: { padding: rs(16), paddingBottom: rs(100), gap: rs(12) },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: rs(12), marginBottom: rs(8) },
  logo: { fontSize: rf(26), fontWeight: '800' },
  logoBlack: { color: '#111111' },
  logoOrange: { color: Colors.primary },
  headerActions: { flexDirection: 'row', gap: rs(8) },
  headerBtn: { position: 'relative', padding: rs(6) },
  notifBadge: { position: 'absolute', top: rs(2), right: rs(2), backgroundColor: Colors.primary, borderRadius: rs(8), minWidth: rs(16), height: rs(16), alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(3) },
  notifBadgeText: { color: '#fff', fontSize: rf(9), fontWeight: '700' },
  // User card
  userCard: { backgroundColor: Colors.bg, borderRadius: rs(16), padding: rs(16), flexDirection: 'row', alignItems: 'center', gap: rs(14), ...Shadow.card },
  avatarWrapper: { position: 'relative' },
  bigAvatarImg: { width: rs(72), height: rs(72), borderRadius: rs(36) },
  bigAvatar: { width: rs(72), height: rs(72), borderRadius: rs(36), alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { color: '#fff', fontSize: rf(26), fontWeight: '800' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: rs(36), backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  avatarCameraBtn: { position: 'absolute', bottom: 0, right: 0, width: rs(24), height: rs(24), borderRadius: rs(12), backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bg },
  userInfo: { flex: 1, gap: rs(3) },
  fullName: { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary },
  roleBadge: { backgroundColor: Colors.primary, borderRadius: rs(100), paddingHorizontal: rs(12), paddingVertical: rs(3), alignSelf: 'flex-start', marginTop: rs(2) },
  roleText: { color: '#fff', fontSize: rf(12), fontWeight: '600' },
  phone: { fontSize: rf(13), color: Colors.textMuted },
  logoutBtnText: { color: Colors.textMuted, fontSize: rf(14), fontWeight: '600' },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), padding: rs(24), paddingBottom: rs(40), gap: rs(12) },
  handle: { width: rs(36), height: rs(4), backgroundColor: Colors.inputBorder, borderRadius: rs(2), alignSelf: 'center', marginBottom: rs(8) },
  modalTitle: { fontSize: rf(18), fontWeight: '700', color: Colors.textPrimary },
  metroRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10), padding: rs(14), borderWidth: 1.5, borderColor: Colors.primary, borderRadius: rs(12) },
  dot: { width: rs(10), height: rs(10), borderRadius: rs(5) },
  metroVal: { flex: 1, fontSize: rf(15), fontWeight: '600', color: Colors.textPrimary },
  metroPickBtn: { flexDirection: 'row', justifyContent: 'space-between', padding: rs(14), borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: rs(12) },
  confirmOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: rs(24) },
  confirmCard: { backgroundColor: Colors.bg, borderRadius: Radius.xl, padding: rs(28), width: '100%', gap: rs(12) },
  confirmTitle: { fontSize: rf(18), fontWeight: '700', textAlign: 'center', color: Colors.textPrimary },
  confirmBody: { fontSize: rf(14), color: Colors.textSecondary, textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: rs(12), marginTop: rs(8) },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: rs(100), paddingVertical: rs(14), alignItems: 'center' },
  cancelText: { fontSize: rf(15), fontWeight: '600', color: Colors.textSecondary },
  logoutConfirmBtn: { flex: 1, backgroundColor: Colors.red, borderRadius: rs(100), paddingVertical: rs(14), alignItems: 'center' },
  logoutConfirmText: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
});

const photoSrcS = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: rs(14),
    paddingHorizontal: rs(20), paddingVertical: rs(18),
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  icon: { fontSize: rf(22), width: rs(30), textAlign: 'center' },
  label: { fontSize: rf(16), fontWeight: '600', color: Colors.textPrimary },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: rf(40), marginBottom: 12 }}>😕</Text>
        <Text style={{ fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>
          Не удалось загрузить профиль
        </Text>
        <Text style={{ fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', marginBottom: 24 }}>
          {error.message}
        </Text>
        <TouchableOpacity
          onPress={retry}
          style={{ backgroundColor: Colors.primary, borderRadius: 100, paddingHorizontal: 24, paddingVertical: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: rf(15) }}>Попробовать снова</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const pStyles = StyleSheet.create({
  companyOption: {
    flexDirection: 'row', alignItems: 'center', gap: rs(14),
    padding: rs(16), borderRadius: rs(12), borderWidth: 1.5, borderColor: Colors.inputBorder,
    backgroundColor: Colors.surface,
  },
  companyOptionActive: { borderColor: Colors.primary, backgroundColor: '#F0EEFF' },
  companyRadio: {
    width: rs(22), height: rs(22), borderRadius: rs(11), borderWidth: 2, borderColor: Colors.inputBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  companyRadioActive: { borderColor: Colors.primary },
  companyRadioDot: { width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: Colors.primary },
  companyLabel: { fontSize: rf(16), color: Colors.textPrimary, fontWeight: '500' },
  companyLabelActive: { color: Colors.primary, fontWeight: '700' },
});
