import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { formatDate } from '@/services/storage';
import { dbRemoveSaved } from '@/services/db';
import { Chip } from '@/components/ui/Chip';
import { VacancyDetailModal } from '@/components/feature/VacancyDetailModal';
import { NotifBell } from '@/components/ui/NotifBell';
import { Vacancy } from '@/constants/types';

export default function SavedScreen() {
  const { currentUser, vacancies, savedIds, optimisticRemoveSaved, refreshSaved, refreshVacancies, showToast } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshVacancies(), refreshSaved()]);
    setRefreshing(false);
  };
  const [detailVacancy, setDetailVacancy] = useState<Vacancy | null>(null);

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const savedVacancies = vacancies.filter(v => savedIds.includes(v.id));

  const removeSaved = async (id: string) => {
    optimisticRemoveSaved(id);
    dbRemoveSaved(currentUser.id, id)
      .then(() => refreshSaved())
      .catch(() => {});
    showToast('Удалено из избранного', 'success');
  };

  if (savedVacancies.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>Избранное</Text>
          <NotifBell />
        </View>
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>❤️</Text>
          <Text style={styles.emptyTitle}>Нет сохранённых вакансий</Text>
          <Text style={styles.emptySubtitle}>Нажми ❤️ на карточке вакансии, чтобы сохранить</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Избранное</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countTxt}>{savedVacancies.length}</Text>
        </View>
        <NotifBell />
      </View>

      <FlatList
        data={savedVacancies}
        keyExtractor={v => v.id}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        renderItem={({ item: v }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => setDetailVacancy(v)}
          >
            <View style={styles.cardTop}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarText}>{(v.company[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.company}>{v.company}</Text>
                <Text style={styles.metro}>🚇 {v.metroStation}</Text>
              </View>
              <TouchableOpacity
                onPress={() => removeSaved(v.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.removeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.jobTitle}>{v.title}</Text>

            <View style={styles.chipsRow}>
              <Chip label={v.workTypeLabel ?? v.workType ?? 'Работа'} variant="work" />
              <Chip label={`⏰ ${v.timeStart}–${v.timeEnd}`} variant="time" />
              <Chip label={`📅 ${formatDate(v.date)}`} variant="date" />
              {v.isUrgent ? <Chip label="🔥 Срочно" variant="urgent" /> : null}
            </View>



            <View style={styles.footer}>
              <View style={[styles.statusBadge, { backgroundColor: v.status === 'open' ? Colors.greenLight : Colors.surface }]}>
                <Text style={[styles.statusText, { color: v.status === 'open' ? Colors.green : Colors.textMuted }]}>
                  {v.status === 'open' ? '● Открыта' : '○ Закрыта'}
                </Text>
              </View>
              <Text style={styles.detailLink}>Подробнее →</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <VacancyDetailModal
        vacancy={detailVacancy}
        visible={!!detailVacancy}
        onClose={() => setDetailVacancy(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  countBadge: { backgroundColor: Colors.primary, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3 },
  countTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: 16, ...Shadow.card, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  company: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  metro: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  removeBtn: { fontSize: 16, color: Colors.textMuted, padding: 4 },
  jobTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, lineHeight: 22 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  statusBadge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  detailLink: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
