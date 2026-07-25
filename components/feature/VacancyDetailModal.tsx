import React from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { User, Vacancy } from '@/constants/types';
import { Chip } from '@/components/ui/Chip';
import { formatDate, normalizeCompany } from '@/services/storage';
import { LavkaLogo } from '@/components/ui/LavkaLogo';

interface Props {
  vacancy: Vacancy | null;
  visible: boolean;
  onClose: () => void;
  employer?: User | null;
  /** Optional action buttons to render at the bottom */
  actions?: React.ReactNode;
}

export function VacancyDetailModal({ vacancy, visible, onClose, employer, actions }: Props) {
  const insets = useSafeAreaInsets();
  if (!vacancy) return null;

  const companyName = normalizeCompany(employer?.company || vacancy.company);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Затемнение над шторкой тоже закрывает: не единственный способ выйти */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
            bounces={false}
          >
            {/* Company row */}
            <View style={styles.companyRow}>
              <LavkaLogo size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.company}>{companyName}</Text>
                {vacancy.metroStation ? (
                  <View style={styles.metroRow}>
                    <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.metro}>{vacancy.metroStation}</Text>
                  </View>
                ) : null}
              </View>
              {vacancy.isUrgent ? (
                <View style={styles.urgentBadge}>
                  <Ionicons name="flash" size={12} color="#DC2626" />
                  <Text style={styles.urgentTxt}>Срочно</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.jobTitle}>{vacancy.title}</Text>

            {/* Chips: time, date */}
            <View style={styles.row}>
              <Chip label={`${vacancy.timeStart}–${vacancy.timeEnd}`} variant="time" icon="time-outline" />
              <Chip label={formatDate(vacancy.date)} variant="date" icon="calendar-outline" />
            </View>

            {/* Experience */}
            <Text style={styles.secLabel}>Опыт</Text>
            <View style={styles.row}>
              <Chip
                label={vacancy.noExperienceNeeded ? 'Не требуется' : 'Желателен'}
                variant={vacancy.noExperienceNeeded ? 'exp' : 'work'}
                icon="school-outline"
              />
            </View>

            {/* Norms */}
            {vacancy.normsAndPay ? (
              <>
                <Text style={styles.secLabel}>Нормативы и оплата</Text>
                <Text style={styles.condText}>{vacancy.normsAndPay}</Text>
              </>
            ) : null}

            {/* Workers */}
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (vacancy.workersFound / vacancy.workersNeeded) * 100)}%` }]} />
              </View>
              <View style={styles.progressLabelRow}>
                <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.progressLabel}>
                  Набрано {vacancy.workersFound} из {vacancy.workersNeeded}
                </Text>
                <Text style={styles.progressDot}>·</Text>
                <Ionicons name="flash-outline" size={13} color={Colors.primary} />
                <Text style={[styles.progressLabel, { color: Colors.primary }]}>
                  Осталось {Math.max(0, vacancy.workersNeeded - vacancy.workersFound)} мест
                </Text>
              </View>
            </View>

            {actions ? <View style={styles.actionsWrap}>{actions}</View> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    // Полоску-хват убрали, но её место оставляем: иначе строка компании
    // подъезжает под крестик, и «Срочно» с ним сталкивается.
    paddingTop: 25,
  },
  // Крестик был почти в цвет шторки — закрыть окно было нечем.
  closeBtn: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#EDEFF2',
    borderWidth: 1, borderColor: '#DDE1E6',
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 20, paddingTop: 8, gap: 10, paddingBottom: 24 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
  company: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  metroRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metro: { fontSize: 12, color: Colors.textMuted },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  urgentTxt: { fontSize: 12, color: '#DC2626', fontWeight: '600' },
  jobTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, lineHeight: 28 },
  secLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '500', marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  condText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  progressWrap: { marginTop: 8, gap: 6 },
  progressTrack: { height: 4, backgroundColor: Colors.divider, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  progressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progressLabel: { fontSize: 12, color: Colors.textMuted },
  progressDot: { fontSize: 12, color: Colors.textMuted },
  actionsWrap: { marginTop: 8, gap: 10 },
});
