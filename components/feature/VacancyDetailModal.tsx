import React from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView,
  TouchableOpacity, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/hooks/useApp';
import { ReplyBadge } from '@/components/feature/ReplyBadge';
import { payShort, isEstimatedPay, PAY_ESTIMATE_HINT } from '@/services/pay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { User, Vacancy } from '@/constants/types';
import { Chip } from '@/components/ui/Chip';
import { formatDate, normalizeCompany } from '@/services/storage';
import { LavkaLogo } from '@/components/ui/LavkaLogo';
import { SheetHandle, useSwipeToDismiss } from '@/components/ui/Sheet';

import { rs, rf } from '@/constants/scale';

interface Props {
  vacancy: Vacancy | null;
  visible: boolean;
  onClose: () => void;
  employer?: User | null;
  /** Optional action buttons to render at the bottom */
  actions?: React.ReactNode;
}

export function VacancyDetailModal({ vacancy, visible, onClose, employer, actions }: Props) {
  const { responsivenessMap } = useApp();
  const insets = useSafeAreaInsets();
  const { panHandlers, animStyle } = useSwipeToDismiss(onClose, visible);
  if (!vacancy) return null;

  const companyName = normalizeCompany(employer?.company || vacancy.company);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Затемнение над шторкой тоже закрывает: не единственный способ выйти */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom }, animStyle]}>
          <View {...panHandlers}><SheetHandle /></View>

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

            {/* Как отвечает этот директор — до отклика, а не после.
                В профиль перед откликом заходят единицы, а без ответа
                остаются 45% чатов. */}
            <ReplyBadge stats={employer ? responsivenessMap[employer.id] : null} />

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

            {/* Оплата. У сдельных ролей это ориентир, и так и написано:
                человек, пришедший за обещанной суммой и получивший меньше,
                прав, считая себя обманутым. */}
            {payShort(vacancy.salary, vacancy.workType) ? (
              <>
                <Text style={styles.secLabel}>Оплата за смену</Text>
                <Text style={styles.payBig}>{payShort(vacancy.salary, vacancy.workType)}</Text>
                {isEstimatedPay(vacancy.workType) ? (
                  <Text style={styles.payHint}>{PAY_ESTIMATE_HINT}</Text>
                ) : null}
              </>
            ) : null}

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
        </Animated.View>
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
    borderTopLeftRadius: rs(28),
    borderTopRightRadius: rs(28),
    maxHeight: '90%',
    // Полоску-хват убрали, но её место оставляем: иначе строка компании
    // подъезжает под крестик, и «Срочно» с ним сталкивается.
    paddingTop: rs(25),
  },
  body: { padding: rs(20), paddingTop: rs(8), gap: rs(10), paddingBottom: rs(24) },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: rs(12), marginBottom: rs(6) },
  avatar: {
    width: rs(44), height: rs(44), borderRadius: rs(22),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: rs(44), height: rs(44), borderRadius: rs(22) },
  avatarTxt: { fontSize: rf(16), fontWeight: '700', color: '#fff' },
  company: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  metroRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4), marginTop: rs(2) },
  metro: { fontSize: rf(12), color: Colors.textMuted },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#FEF2F2', borderRadius: rs(100), paddingHorizontal: rs(10), paddingVertical: rs(5) },
  urgentTxt: { fontSize: rf(12), color: '#DC2626', fontWeight: '600' },
  jobTitle: { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, lineHeight: rf(28) },
  secLabel: { fontSize: rf(13), color: Colors.textMuted, fontWeight: '500', marginTop: rs(4) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
  payBig: { fontSize: rf(24), fontWeight: '800', color: Colors.textPrimary, marginTop: rs(2) },
  payHint: { fontSize: rf(12.5), color: Colors.textMuted, lineHeight: rf(18), marginTop: rs(4) },
  condText: { fontSize: rf(14), color: '#374151', lineHeight: rf(22) },
  progressWrap: { marginTop: rs(8), gap: rs(6) },
  progressTrack: { height: rs(4), backgroundColor: Colors.divider, borderRadius: rs(2), overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: rs(2) },
  progressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  progressLabel: { fontSize: rf(12), color: Colors.textMuted },
  progressDot: { fontSize: rf(12), color: Colors.textMuted },
  actionsWrap: { marginTop: rs(8), gap: rs(10) },
});
