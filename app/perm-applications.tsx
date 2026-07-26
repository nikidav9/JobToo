/**
 * Permanent job applications screen — employer view
 * Shows workers who applied to a specific permanent vacancy
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { PermApplication } from '@/constants/types';
import { getInitials, nameColorFromString } from '@/services/storage';
import {
  dbSetPermApplicationStatus,
  dbCreateChat,
  dbInsertMessage,
  dbIncrementUnread,
} from '@/services/db';
import {
  notifyWorkerPermApplicationApproved,
  notifyWorkerPermApplicationRejected,
} from '@/services/notifications';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: '⏳ На рассмотрении', color: '#92400E', bg: '#FFF7ED' },
  approved: { label: '✅ Одобрено',        color: Colors.green, bg: '#D1FAE5' },
  rejected: { label: '✕ Отказ',           color: Colors.red,   bg: '#FEE2E2' },
  hired:    { label: '✅ Кандидат закрыт', color: '#4F46E5',    bg: '#EEF2FF' },
};

export default function PermApplicationsScreen() {
  const router = useRouter();
  const { vacancyId } = useLocalSearchParams<{ vacancyId: string }>();
  const { currentUser, users, permVacancies, permApplications, refreshPermApplications, refreshChats, showToast } = useApp();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const vacancy = permVacancies.find(v => v.id === vacancyId);
  const apps = permApplications.filter(a => a.vacancyId === vacancyId);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshPermApplications();
    setRefreshing(false);
  };

  const approve = async (app: PermApplication) => {
    if (!currentUser || !vacancy) return;
    setActionLoading(app.id);
    try {
      await dbSetPermApplicationStatus(app.id, 'approved');
      const worker = users.find(u => u.id === app.workerId);
      if (worker && vacancy) {
        notifyWorkerPermApplicationApproved(
          app.workerId,
          vacancy.company,
          vacancy.title,
        ).catch(() => {});
      }
      // Open chat automatically
      const chatId = await dbCreateChat(
        app.workerId,
        currentUser.id,
        app.vacancyId,
        vacancy.title,
        vacancy.company,
        `🎉 Поздравляем! Вы одобрены на вакансию «${vacancy.title}». Свяжитесь с кандидатом для уточнения деталей.`,
        1,
        0,
      );
      await refreshPermApplications();
      await refreshChats(currentUser);
      showToast('Одобрено! Чат открыт 🎉', 'match');
      router.push({ pathname: '/chat-room', params: { chatId } });
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
          onPress={() => router.push({ pathname: '/user-profile', params: { userId: worker.id } })}
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
              onPress={() => approve(app)}
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backTxt}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{vacancy?.title ?? 'Отклики'}</Text>
        <View style={{ width: 60 }} />
      </View>

      {apps.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>📥</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backTxt: { fontSize: 15, color: Colors.textSecondary, fontWeight: '500', width: 60 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: 16, ...Shadow.card, gap: 10 },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  arrow: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  statusTxt: { fontSize: 13, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10 },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: Colors.red, borderRadius: 100, paddingVertical: 11, alignItems: 'center' },
  rejectBtnTxt: { color: Colors.red, fontSize: 14, fontWeight: '600' },
  approveBtn: { flex: 2, backgroundColor: Colors.green, borderRadius: 100, paddingVertical: 11, alignItems: 'center' },
  approveBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
