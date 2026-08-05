/**
 * Отклики на постоянную вакансию — то, что видит директор.
 *
 * Шторка, а не отдельный экран: директор смотрит отклики между делом и
 * возвращается к списку вакансий, а полноэкранная страница каждый раз
 * выбивала его из контекста. Системную шторку навигации взять не вышло —
 * она задаётся нативной частью, а обновления по воздуху меняют только JS,
 * — поэтому та же, что и у «Просмотрели вакансию».
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Modal, Animated,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SheetHandle, useSwipeToDismiss } from '@/components/ui/Sheet';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { PermApplication } from '@/constants/types';
import { getInitials, nameColorFromString } from '@/services/storage';
import { rs, rf } from '@/constants/scale';

import {
  dbSetPermApplicationStatus,
  dbCreateChat,
} from '@/services/db';
import {
  notifyWorkerPermApplicationApproved,
  notifyWorkerPermApplicationRejected,
} from '@/services/notifications';
import { ApplySheet } from '@/components/feature/ApplySheet';
import { PERM_APPROVE_SUGGESTIONS } from '@/constants/chatSuggestions';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: '⏳ На рассмотрении', color: '#92400E', bg: '#FFF7ED' },
  approved: { label: '✅ Одобрено',        color: Colors.green, bg: '#D1FAE5' },
  rejected: { label: '✕ Отказ',           color: Colors.red,   bg: '#FEE2E2' },
  hired:    { label: '✅ Кандидат закрыт', color: '#4F46E5',    bg: '#EEF2FF' },
};

export function PermApplicationsSheet({ vacancyId, onClose }: { vacancyId: string; onClose: () => void }) {
  const router = useRouter();
  const swipe = useSwipeToDismiss(onClose);
  const { currentUser, users, permVacancies, permApplications, refreshPermApplications, refreshChats, showToast } = useApp();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<PermApplication | null>(null);

  const vacancy = permVacancies.find(v => v.id === vacancyId);
  const apps = permApplications.filter(a => a.vacancyId === vacancyId);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshPermApplications();
    setRefreshing(false);
  };

  /** Одобрение — это первое сообщение директора, а не уведомление о нём. */
  const approve = async (app: PermApplication, message: string) => {
    if (!currentUser || !vacancy) return;
    setActionLoading(app.id);
    try {
      await dbSetPermApplicationStatus(app.id, 'approved');
      notifyWorkerPermApplicationApproved(
        app.workerId,
        vacancy.company,
        vacancy.title,
      ).catch(() => {});
      const chatId = await dbCreateChat(
        app.workerId,
        currentUser.id,
        app.vacancyId,
        vacancy.title,
        vacancy.company,
        message,
        1,
        0,
        'employer',
      );
      setApproving(null);
      await refreshPermApplications();
      await refreshChats(currentUser);
      showToast('Одобрено! Чат открыт 🎉', 'match');
      // Окно письма лежит внутри этой шторки, и убирать оба разом нельзя:
      // на iOS второе закрытие приходит, пока первое ещё идёт, и экран
      // остаётся под затемнением. Поэтому закрываем по очереди.
      setTimeout(() => {
        onClose();
        router.push({ pathname: '/chat-room', params: { chatId } });
      }, 300);
    } catch (e) {
      showToast('Ошибка', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (app: PermApplication) => {
    if (!currentUser) return;
    setActionLoading(app.id + '_r');
    try {
      await dbSetPermApplicationStatus(app.id, 'rejected');
      if (vacancy) {
        notifyWorkerPermApplicationRejected(
          app.workerId,
          vacancy.company,
          vacancy.title,
        ).catch(() => {});
      }
      await refreshPermApplications();
      showToast('Отклонено', 'success');
    } catch (e) {
      showToast('Ошибка', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const approvingWorker = approving ? users.find(u => u.id === approving.workerId) : undefined;
  const approvingInfo = approving && vacancy
    ? [
        approvingWorker ? `${approvingWorker.firstName} ${approvingWorker.lastName}` : 'Кандидат',
        `Вакансия: ${vacancy.title}`,
        vacancy.metroStation ? `Где: 🚇 ${vacancy.metroStation}` : `Компания: ${vacancy.company}`,
      ]
    : [];

  const renderApp = ({ item: app }: { item: PermApplication }) => {
    const worker = users.find(u => u.id === app.workerId);
    if (!worker) return null;
    const name = `${worker.firstName} ${worker.lastName}`;
    const color = nameColorFromString(worker.id);
    // Подстраховка: неизвестный статус не должен ронять экран. Раньше здесь
    // читалось status.bg у undefined, и один новый статус клал весь список.
    const status = STATUS_LABELS[app.status] ?? STATUS_LABELS.pending;
    const isLoading = actionLoading === app.id;
    const isRLoading = actionLoading === app.id + '_r';

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.workerRow}
          onPress={() => { onClose(); router.push({ pathname: '/user-profile', params: { userId: worker.id } }); }}
          activeOpacity={0.8}
        >
          {worker.avatarUrl ? (
            <Image source={{ uri: worker.avatarUrl }} style={styles.avatar} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={styles.avatarTxt}>{getInitials(name)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.meta}>
              {worker.phone}
              {worker.metroStation ? `  ·  🚇 ${worker.metroStation}` : ''}
              {(worker.avgRating ?? 0) > 0 ? `  ·  ⭐ ${(worker.avgRating ?? 0).toFixed(1)}` : ''}
            </Text>
          </View>
          <Text style={styles.arrow}>Профиль ›</Text>
        </TouchableOpacity>

        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusTxt, { color: status.color }]}>{status.label}</Text>
        </View>

        {app.status === 'pending' ? (
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.rejectBtn, isRLoading && { opacity: 0.5 }]}
              disabled={!!actionLoading}
              onPress={() => reject(app)}
              activeOpacity={0.8}
            >
              {isRLoading ? <ActivityIndicator size="small" color={Colors.red} /> : <Text style={styles.rejectBtnTxt}>✕ Отказать</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.approveBtn, isLoading && { opacity: 0.5 }]}
              disabled={!!actionLoading}
              onPress={() => setApproving(app)}
              activeOpacity={0.8}
            >
              {isLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.approveBtnTxt}>✅ Одобрить + Чат</Text>}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, swipe.animStyle]}>
          {/* Тянут за верх, как и в шторке «Просмотрели вакансию»: ниже
              прокручиваемый список, и перехватывать там любое движение
              нельзя — читать станет невозможно. */}
          <View {...swipe.panHandlers}>
            <SheetHandle />
            <View style={styles.header}>
              <Text style={styles.headerTitle} numberOfLines={1}>{vacancy?.title ?? 'Отклики'}</Text>
            </View>
          </View>

      {apps.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: rf(48) }}>📥</Text>
          <Text style={styles.emptyTitle}>Нет откликов</Text>
          <Text style={styles.emptySub}>Когда кандидаты откликнутся — они появятся здесь</Text>
        </View>
      ) : (
        <FlatList
          data={apps}
          keyExtractor={a => a.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
          renderItem={renderApp}
        />
      )}
        </Animated.View>
      </View>

      <ApplySheet
        visible={!!approving}
        onClose={() => setApproving(null)}
        onSend={msg => approving ? approve(approving, msg) : undefined}
        title="Одобрить кандидата"
        info={approvingInfo}
        chips={PERM_APPROVE_SUGGESTIONS}
        label="Напишите кандидату первым"
        placeholder="Например: здравствуйте! Готовы взять, когда сможете выйти?"
        sendLabel="Одобрить и отправить"
        hint="Кандидат ждёт вашего слова — без сообщения переписка так и останется пустой"
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), maxHeight: '88%', paddingBottom: rs(12) },
  header: {
    paddingHorizontal: rs(16), paddingVertical: rs(14),
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backTxt: { fontSize: rf(15), color: Colors.textSecondary, fontWeight: '500', width: rs(60) },
  headerTitle: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  list: { padding: rs(16), gap: rs(12), paddingBottom: rs(100) },
  card: { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: rs(16), ...Shadow.card, gap: rs(10) },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  avatar: { width: rs(44), height: rs(44), borderRadius: rs(22) },
  avatarTxt: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
  name: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: rf(12), color: Colors.textMuted, marginTop: rs(2) },
  arrow: { fontSize: rf(12), color: Colors.primary, fontWeight: '600' },
  statusBadge: { borderRadius: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(6), alignSelf: 'flex-start' },
  statusTxt: { fontSize: rf(13), fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: rs(10) },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.red, borderRadius: rs(100), paddingVertical: rs(11), alignItems: 'center' },
  rejectBtnTxt: { color: Colors.red, fontSize: rf(14), fontWeight: '600' },
  approveBtn: { flex: 2, backgroundColor: Colors.green, borderRadius: rs(100), paddingVertical: rs(11), alignItems: 'center' },
  approveBtnTxt: { color: '#fff', fontSize: rf(14), fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(32), paddingBottom: rs(80) },
  emptyTitle: { fontSize: rf(18), fontWeight: '700', color: Colors.textPrimary, marginTop: rs(12) },
  emptySub: { fontSize: rf(14), color: Colors.textMuted, textAlign: 'center', marginTop: rs(6), lineHeight: rf(20) },
});
