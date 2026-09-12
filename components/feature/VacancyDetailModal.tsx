import React from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/hooks/useApp';
import { ReplyBadge } from '@/components/feature/ReplyBadge';
import { payShort, isEstimatedPay, PAY_ESTIMATE_HINT } from '@/services/pay';
import { Colors } from '@/constants/theme';
import { User, Vacancy } from '@/constants/types';
import { CompanyMark } from '@/components/ui/CompanyMark';
import { VacancyDetailHead, DetailChip } from '@/components/feature/VacancyDetailHead';
import { VacancyContacts } from '@/components/feature/VacancyContacts';
import { formatDate, normalizeCompany } from '@/services/storage';
import { agoRu, plural } from '@/services/time';

import { rs, rf } from '@/constants/scale';

interface Props {
  vacancy: Vacancy | null;
  visible: boolean;
  onClose: () => void;
  employer?: User | null;
  /** Кнопки отклика — их набор зависит от ленты, поэтому приходят снаружи. */
  actions?: React.ReactNode;
  onShare?: () => void;
  /** Гость: контакты скрыты до входа. */
  locked?: boolean;
  onLogin?: () => void;
  /** Написать работодателю. Без него раздел «Контакты» не показывается. */
  onChat?: () => void;
}

/**
 * Экран смены целиком.
 *
 * Был шторкой на 85% высоты, стал полным экраном — как у постоянных вакансий
 * и у партнёрских. Три вида подробностей отличались формой и раскладкой, и
 * одна и та же вакансия выглядела по-разному в зависимости от того, откуда на
 * неё зашли. Теперь шапка, чипы и «Контакты» — общие куски.
 */
export function VacancyDetailModal({
  vacancy, visible, onClose, employer, actions, onShare, locked = false, onLogin, onChat,
}: Props) {
  const { responsivenessMap } = useApp();
  if (!vacancy) return null;

  const companyName = normalizeCompany(employer?.company || vacancy.company);
  const pay = payShort(vacancy.salary, vacancy.workType);

  const chips: DetailChip[] = [];
  if (pay) chips.push({ label: pay, variant: 'salary', icon: 'wallet-outline' });
  chips.push({ label: `${vacancy.timeStart}–${vacancy.timeEnd}`, icon: 'time-outline' });
  chips.push({ label: formatDate(vacancy.date), icon: 'calendar-outline' });
  if (vacancy.metroStation) chips.push({ label: vacancy.metroStation, icon: 'subway-outline' });
  chips.push({
    label: vacancy.noExperienceNeeded ? 'Без опыта' : 'Опыт желателен',
    icon: 'school-outline',
  });
  if (vacancy.isUrgent) chips.push({ label: 'Срочно', variant: 'urgent', icon: 'flash' });

  const left = Math.max(0, vacancy.workersNeeded - vacancy.workersFound);
  const filled = vacancy.workersNeeded > 0
    ? Math.min(100, (vacancy.workersFound / vacancy.workersNeeded) * 100)
    : 0;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityLabel="Назад" onPress={onClose} hitSlop={10} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
          </TouchableOpacity>
          {onShare ? (
            <TouchableOpacity accessibilityLabel="Поделиться" onPress={onShare} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="share-outline" size={23} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : <View />}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <VacancyDetailHead
            logo={<CompanyMark company={companyName} size={34} />}
            company={companyName}
            postedAgo={agoRu(vacancy.createdAt)}
            title={vacancy.title}
            chips={chips}
            // Оплата у сдельных ролей — ориентир, и так и написано: человек,
            // пришедший за обещанной суммой и получивший меньше, прав, считая
            // себя обманутым.
            note={pay && isEstimatedPay(vacancy.workType) ? PAY_ESTIMATE_HINT : undefined}
          />

          {/* Как отвечает этот работодатель — до отклика, а не после. В профиль
              перед откликом заходят единицы, а без ответа остаются 45% чатов. */}
          <ReplyBadge stats={employer ? responsivenessMap[employer.id] : null} />

          {vacancy.address ? (
            <View style={styles.section}>
              <Text style={styles.secHead}>Адрес</Text>
              <Text style={styles.text}>{vacancy.address}</Text>
            </View>
          ) : null}

          {vacancy.conditions ? (
            <View style={styles.section}>
              <Text style={styles.secHead}>Условия</Text>
              <Text style={styles.text}>{vacancy.conditions}</Text>
            </View>
          ) : null}

          {vacancy.normsAndPay ? (
            <View style={styles.section}>
              <Text style={styles.secHead}>Нормативы и оплата</Text>
              <Text style={styles.text}>{vacancy.normsAndPay}</Text>
            </View>
          ) : null}

          {vacancy.workersNeeded > 0 ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${filled}%` }]} />
              </View>
              <View style={styles.progressLabelRow}>
                <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.progressLabel}>
                  Набрано {vacancy.workersFound} из {vacancy.workersNeeded}
                </Text>
                <Text style={styles.progressDot}>·</Text>
                <Ionicons name="flash-outline" size={13} color={Colors.primary} />
                <Text style={[styles.progressLabel, { color: Colors.primary }]}>
                  Осталось {left} {plural(left, 'место', 'места', 'мест')}
                </Text>
              </View>
            </View>
          ) : null}

          {onChat ? (
            <VacancyContacts
              contact={{ kind: 'chat', company: companyName, onOpen: onChat }}
              locked={locked}
              onLogin={onLogin ?? onClose}
            />
          ) : null}
        </ScrollView>

        {actions ? <View style={styles.footer}>{actions}</View> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rs(16), paddingVertical: rs(10),
  },
  body: { paddingHorizontal: rs(20), paddingBottom: rs(24), gap: rs(18) },
  section: { gap: rs(6) },
  secHead: { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary },
  text: { fontSize: rf(14.5), lineHeight: rf(21), color: Colors.textPrimary },
  progressWrap: { gap: rs(8) },
  progressTrack: { height: rs(6), borderRadius: rs(3), backgroundColor: Colors.divider, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: rs(3), backgroundColor: Colors.primary },
  progressLabelRow: { flexDirection: 'row', alignItems: 'center', gap: rs(5), flexWrap: 'wrap' },
  progressLabel: { fontSize: rf(12.5), color: Colors.textMuted },
  progressDot: { fontSize: rf(12.5), color: Colors.textMuted },
  footer: {
    paddingHorizontal: rs(20), paddingTop: rs(10), paddingBottom: rs(10),
    borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.bg,
  },
});
