
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, FlatList,
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
import { dbGetRatingsForUser, UserRating } from '@/services/db';
import { getSupabaseClient } from '@/template';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { MetroPicker } from '@/components/feature/MetroPicker';
import { WorkTypeSelector } from '@/components/feature/WorkTypeSelector';
import { WorkType } from '@/constants/types';
import { WORK_TYPE_META } from '@/components/feature/WorkTypeSelector';
import { METRO_LINES } from '@/constants/metro';

type EditSection = 'personal' | 'metro' | 'worktypes' | 'company' | 'bio' | null;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 2, marginTop: 2 },
  star: { fontSize: 18 },
  starFilled: { color: '#FBBF24' },
  starEmpty: { color: '#E5E7EB' },
  count: { fontSize: 13, color: Colors.textMuted, marginLeft: 4 },
  viewAll: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginLeft: 6 },
});

// ─── Ratings Modal ────────────────────────────────────────────────────────────
function RatingsModal({ userId, users, onClose }: { userId: string; users: any[]; onClose: () => void }) {
  const [ratings, setRatings] = useState<UserRating[]>([]);
  const [loading, setLoading] = useState(true);

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
        .channel(`ratings_modal:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jm_ratings', filter: `to_user_id=eq.${userId}` }, fetchRatings)
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
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={rmS.overlay}>
        <View style={rmS.sheet}>
          <View style={rmS.handle} />
          <View style={rmS.header}>
            <Text style={rmS.title}>Мои отзывы</Text>
            <TouchableOpacity onPress={onClose} style={rmS.closeBtn}>
              <Text style={rmS.closeTxt}>✕</Text>
            </TouchableOpacity>
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
              <Text style={{ fontSize: 44 }}>⭐</Text>
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
        </View>
      </View>
    </Modal>
  );
}

const rmS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  handle: { width: 36, height: 4, backgroundColor: Colors.inputBorder, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 18, color: Colors.textMuted },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#FFFBEB', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: '#FDE68A',
  },
  summaryAvg: { fontSize: 44, fontWeight: '800', color: '#92400E' },
  sumStar: { fontSize: 20 },
  starFilled: { color: '#FBBF24' },
  starEmpty: { color: '#E5E7EB' },
  summaryCount: { fontSize: 13, color: '#B45309', fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', padding: 48, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  role: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  starsRow: { flexDirection: 'row', gap: 1 },
  star: { fontSize: 16 },
  review: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18, fontStyle: 'italic', paddingLeft: 4 },
  noReview: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', paddingLeft: 4 },
});

export default function ProfileScreen() {
  const router = useRouter();
  const { currentUser, logout, users, showToast, updateUser, unreadCount } = useApp();
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [showRatings, setShowRatings] = useState(false);
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [metroPicker, setMetroPicker] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
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
  const [editCompany, setEditCompany] = useState('');
  const [editBio, setEditBio] = useState('');

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const initials = getInitials(`${currentUser.firstName} ${currentUser.lastName}`);
  const avatarColor = nameColorFromString(currentUser.id);
  const line = METRO_LINES.find(l => l.id === currentUser.metroLineId);

  const openEdit = (section: EditSection) => {
    setEditSection(section);
    setEditPhone(currentUser.phone);
    setEditLast(currentUser.lastName);
    setEditFirst(currentUser.firstName);
    setEditMetroLineId(currentUser.metroLineId ?? '');
    setEditMetroStation(currentUser.metroStation ?? '');
    setEditMetroLineName(line?.name ?? '');
    setEditWorkTypes((currentUser.workTypes ?? []) as WorkType[]);
    setEditCompany(currentUser.company ?? '');
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

      // 3. Читаем файл как base64 и конвертируем в Uint8Array
      const base64Data = await FileSystem.readAsStringAsync(processed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const uint8Array = base64ToUint8Array(base64Data);

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

      // Supabase иногда возвращает warning-ошибку даже при успешной загрузке —
      // просто логируем и продолжаем (фото реально сохраняется).
      if (uploadError) {
        console.warn('[Avatar] upload warning (non-fatal):', uploadError.message);
      }

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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>
            <Text style={styles.logoBlack}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push('/(tabs)/chats')} style={styles.headerBtn}>
              <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn}>
              <Ionicons name="settings-outline" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

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

          <TouchableOpacity onPress={() => openEdit('personal')} style={styles.userCardArrowBtn}>
            <Text style={styles.userCardArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {currentUser.role === 'worker' ? (
          <>
            <SectionCard
              iconName="briefcase"
              iconBg={Colors.primary}
              title="Специализация"
              onEdit={() => openEdit('worktypes')}
              rows={[]}
              chips={(currentUser.workTypes ?? []).map(t => `${WORK_TYPE_META[t]?.emoji ?? ''} ${WORK_TYPE_META[t]?.label ?? t}`)}
            />
            <SectionCard
              iconName="document-text"
              iconBg={Colors.primary}
              title="О себе"
              onEdit={() => openEdit('bio')}
              rows={currentUser.bio ? [{ label: '', value: currentUser.bio }] : []}
              placeholder="Расскажите о себе — опыт, навыки, предпочтения"
            />
            <SectionCard
              iconName="person"
              iconBg={Colors.primary}
              title="Личные данные"
              onEdit={() => openEdit('personal')}
              rows={[
                { label: 'Телефон', value: currentUser.phone },
                { label: 'Фамилия', value: currentUser.lastName },
                { label: 'Имя', value: currentUser.firstName },
              ]}
            />
            <SectionCard
              iconName="train"
              iconBg="#1C1C1E"
              title="Метро"
              onEdit={() => openEdit('metro')}
              rows={[
                { label: 'Линия', value: line?.name ?? '—', lineColor: line?.color },
                { label: 'Станция', value: currentUser.metroStation ?? '—' },
              ]}
            />
          </>
        ) : (
          <>
            <SectionCard
              iconName="business"
              iconBg={Colors.primary}
              title="Компания"
              onEdit={() => openEdit('company')}
              rows={[{ label: 'Название', value: currentUser.company ?? '—' }]}
            />
            <SectionCard
              iconName="document-text"
              iconBg={Colors.primary}
              title="О компании"
              onEdit={() => openEdit('bio')}
              rows={currentUser.bio ? [{ label: '', value: currentUser.bio }] : []}
              placeholder="Расскажите о компании, условиях, коллективе"
            />
            <SectionCard
              iconName="person"
              iconBg={Colors.primary}
              title="Личные данные"
              onEdit={() => openEdit('personal')}
              rows={[
                { label: 'Телефон', value: currentUser.phone },
                { label: 'Фамилия', value: currentUser.lastName },
                { label: 'Имя', value: currentUser.firstName },
              ]}
            />
          </>
        )}

        {/* Documents section */}
        <View style={styles.docsCard}>
          <View style={styles.docsHeader}>
            <View style={[sS.iconSquare, { backgroundColor: '#6B7280' }]}>
              <Ionicons name="document-text" size={18} color="#fff" />
            </View>
            <Text style={styles.docsSectionTitle}>Документы</Text>
            <TouchableOpacity onPress={() => setShowConfirmLogout(true)}>
              <Text style={styles.logoutLink}>Выйти из аккаунта</Text>
            </TouchableOpacity>
          </View>
          {[
            { label: 'Пользовательское соглашение', doc: 'terms' },
            { label: 'Политика конфиденциальности', doc: 'privacy' },
            { label: 'Согласие на обработку данных', doc: 'consent' },
          ].map((item) => (
            <TouchableOpacity
              key={item.doc}
              style={styles.docRow}
              onPress={() => router.push({ pathname: '/legal', params: { doc: item.doc } })}
              activeOpacity={0.7}
            >
              <Text style={styles.docRowLabel}>{item.label}</Text>
              <Text style={styles.docRowArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Delete account button */}
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={() => setShowConfirmDelete(true)}
          disabled={deletingAccount}
        >
          <Text style={styles.deleteAccountText}>
            {deletingAccount ? 'Удаление...' : 'Удалить аккаунт'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={() => setShowConfirmLogout(true)}>
          <Text style={styles.logoutBtnText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        <View style={{ height: 8 }} />
      </ScrollView>

      {/* Photo source picker */}
      {showPhotoSource ? (
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { gap: 0, padding: 0, overflow: 'hidden' }]}>
            <View style={{ padding: 20, paddingBottom: 16 }}>
              <Text style={[styles.confirmTitle, { fontSize: 16 }]}>Обновить фото</Text>
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
      <Modal visible={!!editSection} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalSheet}>
            <View style={styles.handle} />
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
                <AppInput label="Название компании" value={editCompany} onChangeText={setEditCompany} placeholder="ООО МегаСклад" />
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
          </View>
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
      <Modal visible={showNotifications} transparent animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowNotifications(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.modalTitle}>Уведомления</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
              <Ionicons name="notifications-outline" size={56} color={Colors.textMuted} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.textPrimary }}>Уведомлений пока нет</Text>
              <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center' }}>
                Здесь будут появляться уведомления и новости от приложения
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Change password modal */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowSettings(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.handle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={styles.modalTitle}>Изменить пароль</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
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
                  if (curPassword !== currentUser.password) {
                    showToast('Неверный текущий пароль', 'error'); return;
                  }
                  if (newPassword.length < 6) {
                    showToast('Пароль должен быть не менее 6 символов', 'error'); return;
                  }
                  if (newPassword !== confirmPassword) {
                    showToast('Пароли не совпадают', 'error'); return;
                  }
                  setSavingPassword(true);
                  try {
                    await updateUser({ ...currentUser, password: newPassword });
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function SectionCard({ iconName, iconBg, title, onEdit, rows, chips, placeholder }: {
  iconName: IoniconName;
  iconBg?: string;
  title: string;
  onEdit: () => void;
  rows: { label: string; value: string; lineColor?: string }[];
  chips?: string[];
  placeholder?: string;
}) {
  return (
    <View style={sS.card}>
      <View style={sS.header}>
        <View style={[sS.iconSquare, { backgroundColor: iconBg ?? Colors.primary }]}>
          <Ionicons name={iconName} size={18} color="#fff" />
        </View>
        <Text style={sS.title}>{title}</Text>
        <TouchableOpacity onPress={onEdit}><Text style={sS.editLink}>Изменить</Text></TouchableOpacity>
      </View>
      {rows.map((r, i) => (
        r.label ? (
          <View key={i} style={sS.row}>
            <Text style={sS.label}>{r.label}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {r.lineColor ? <View style={[sS.dot, { backgroundColor: r.lineColor }]} /> : null}
              <Text style={sS.value}>{r.value}</Text>
              <Text style={sS.rowArrow}>›</Text>
            </View>
          </View>
        ) : (
          <Text key={i} style={sS.bioText}>{r.value}</Text>
        )
      ))}
      {rows.length === 0 && placeholder ? <Text style={sS.placeholder}>{placeholder}</Text> : null}
      {chips && chips.length > 0 ? (
        <View style={sS.chipsRow}>
          {chips.map((c, i) => <View key={i} style={sS.chip}><Text style={sS.chipText}>{c}</Text></View>)}
        </View>
      ) : null}
    </View>
  );
}

const sS = StyleSheet.create({
  card: { backgroundColor: Colors.bg, borderRadius: 16, padding: 16, ...Shadow.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconSquare: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  editLink: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  label: { fontSize: 13, color: Colors.textMuted },
  value: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  rowArrow: { fontSize: 16, color: Colors.textMuted, marginLeft: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { backgroundColor: Colors.primaryLight, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  bioText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20, paddingTop: 8 },
  placeholder: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', paddingTop: 4 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.outerBg ?? '#F5F7FA' },
  scroll: { padding: 16, paddingBottom: 100, gap: 12 },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
  logo: { fontSize: 26, fontWeight: '800' },
  logoBlack: { color: '#111111' },
  logoOrange: { color: Colors.primary },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { position: 'relative', padding: 6 },
  notifBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: Colors.primary, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  // User card
  userCard: { backgroundColor: Colors.bg, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, ...Shadow.card },
  avatarWrapper: { position: 'relative' },
  bigAvatarImg: { width: 72, height: 72, borderRadius: 36 },
  bigAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  avatarCameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.bg },
  userInfo: { flex: 1, gap: 3 },
  fullName: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  roleBadge: { backgroundColor: Colors.primary, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 2 },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  phone: { fontSize: 13, color: Colors.textMuted },
  userCardArrowBtn: { padding: 8 },
  userCardArrow: { fontSize: 22, color: Colors.textMuted },
  // Docs card
  docsCard: { backgroundColor: Colors.bg, borderRadius: 16, ...Shadow.card, overflow: 'hidden' },
  docsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 12 },
  docsSectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  logoutLink: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.divider },
  docRowLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  docRowArrow: { fontSize: 20, color: Colors.textMuted },
  // Delete account
  deleteAccountBtn: { backgroundColor: '#FFF1F0', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  deleteAccountText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
  logoutBtn: { alignItems: 'center', paddingVertical: 14 },
  logoutBtnText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  handle: { width: 36, height: 4, backgroundColor: Colors.inputBorder, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  metroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  metroVal: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  metroPickBtn: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: 12 },
  confirmOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { backgroundColor: Colors.bg, borderRadius: Radius.xl, padding: 28, width: '100%', gap: 12 },
  confirmTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', color: Colors.textPrimary },
  confirmBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  logoutConfirmBtn: { flex: 1, backgroundColor: Colors.red, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  logoutConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const photoSrcS = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 18,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  icon: { fontSize: 22, width: 30, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>😕</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>
          Не удалось загрузить профиль
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 24 }}>
          {error.message}
        </Text>
        <TouchableOpacity
          onPress={retry}
          style={{ backgroundColor: Colors.primary, borderRadius: 100, paddingHorizontal: 24, paddingVertical: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Попробовать снова</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
