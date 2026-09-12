import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Share, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius } from '@/constants/theme';
import { ExternalVacancy } from '@/constants/types';
import { CompanyMark } from '@/components/ui/CompanyMark';
import { VacancyDetailHead, DetailChip } from '@/components/feature/VacancyDetailHead';
import { VacancyContacts } from '@/components/feature/VacancyContacts';
import { agoRu, domainOf } from '@/services/time';
import { rs, rf } from '@/constants/scale';

interface Props {
  vacancy: ExternalVacancy | null;
  onClose: () => void;
  /** Уход к партнёру: у каждой ленты свой учёт перехода, поэтому снаружи. */
  onOpenSource: (v: ExternalVacancy) => void;
  /** Гость: контакты скрыты до входа. */
  locked: boolean;
  onLogin: () => void;
}

/**
 * Подробности партнёрской вакансии — внутри приложения, а не на чужом сайте.
 *
 * Раньше «подробнее» у партнёрской карточки означало сразу уход к источнику.
 * Человек уходил, не прочитав даже описания, которое у нас уже было, и часто
 * возвращался ни с чем. Теперь текст показывается здесь, а переход остаётся
 * отдельным осознанным шагом.
 *
 * Отклик отсюда не принимается намеренно: способ отклика зависит от режима
 * интеграции источника, и решает это лента, а не экран с текстом.
 */
export function ExternalVacancyDetail({ vacancy, onClose, onOpenSource, locked, onLogin }: Props) {
  if (!vacancy) return null;

  const source = vacancy.sourceName ?? 'Партнёр';
  const station = vacancy.metroStation ?? vacancy.metroStationRaw;

  const chips: DetailChip[] = [];
  if (vacancy.salary) {
    chips.push({
      label: `${vacancy.salary.toLocaleString('ru-RU')} ₽${vacancy.payPeriod === 'month' ? '/мес' : ''}`,
      variant: 'salary', icon: 'wallet-outline',
    });
  }
  if (station) chips.push({ label: station, icon: 'subway-outline' });
  if (vacancy.schedule) chips.push({ label: vacancy.schedule, icon: 'calendar-outline' });
  if (vacancy.timeStart && vacancy.timeEnd) {
    chips.push({ label: `${vacancy.timeStart}–${vacancy.timeEnd}`, icon: 'time-outline' });
  }
  if (vacancy.address) chips.push({ label: vacancy.address, icon: 'location-outline' });

  const share = async () => {
    try {
      await Share.share(Platform.OS === 'ios'
        ? { message: vacancy.title, url: vacancy.url }
        : { message: `${vacancy.title}\n${vacancy.url}` });
    } catch {
      // Отмена системного окна «Поделиться» — не ошибка.
    }
  };

  return (
    <Modal visible animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityLabel="Назад" onPress={onClose} hitSlop={10} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Поделиться" onPress={() => { void share(); }} hitSlop={10} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={23} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <VacancyDetailHead
            logo={<CompanyMark company={vacancy.company ?? source} size={34} />}
            company={vacancy.company ? `${vacancy.company} · ${source}` : source}
            postedAgo={agoRu(vacancy.createdAt)}
            title={vacancy.title}
            chips={chips}
          />

          {vacancy.description ? (
            <View style={styles.section}>
              <Text style={styles.secHead}>Описание</Text>
              <Text style={styles.desc}>{vacancy.description}</Text>
            </View>
          ) : (
            <Text style={styles.desc}>Источник не прислал описания — оно есть на его странице.</Text>
          )}

          <VacancyContacts
            contact={{ kind: 'source', domain: domainOf(vacancy.url), onOpen: () => onOpenSource(vacancy) }}
            locked={locked}
            onLogin={onLogin}
          />

          {/* Прямо и заранее: дальше человек уходит на чужой сайт, и там
              действуют не наши правила. Узнать об этом после перехода хуже,
              чем до. */}
          <Text style={styles.note}>
            Отклик на эту вакансию оформляется на стороне источника ({source}).
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.openBtn, locked && styles.openBtnLocked]}
            activeOpacity={0.85}
            onPress={() => (locked ? onLogin() : onOpenSource(vacancy))}
          >
            <Ionicons name={locked ? 'lock-closed-outline' : 'open-outline'} size={17} color="#fff" />
            <Text style={styles.openTxt}>{locked ? 'Войти, чтобы откликнуться' : 'Открыть у источника'}</Text>
          </TouchableOpacity>
        </View>
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
  desc: { fontSize: rf(14.5), lineHeight: rf(21), color: Colors.textPrimary },
  note: { fontSize: rf(12.5), lineHeight: rf(18), color: Colors.textMuted },
  footer: {
    paddingHorizontal: rs(20), paddingTop: rs(10), paddingBottom: rs(10),
    borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.bg,
  },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(8),
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: rs(15),
  },
  openBtnLocked: { backgroundColor: Colors.textMuted },
  openTxt: { color: '#fff', fontSize: rf(15.5), fontWeight: '700' },
});
