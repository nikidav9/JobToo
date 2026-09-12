import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius } from '@/constants/theme';
import { ExternalVacancy } from '@/constants/types';
import { Chip } from '@/components/ui/Chip';
import { SheetHandle, useSwipeToDismiss } from '@/components/ui/Sheet';
import { agoRu } from '@/services/time';
import { rs, rf } from '@/constants/scale';

interface Props {
  vacancy: ExternalVacancy | null;
  onClose: () => void;
  /** Уход к партнёру: у каждой ленты свой учёт перехода, поэтому снаружи. */
  onOpenSource: (v: ExternalVacancy) => void;
}

/**
 * Подробности партнёрской вакансии — внутри приложения.
 *
 * Раньше «подробнее» у партнёрской карточки означало сразу уход на чужой сайт.
 * Человек уходил, не прочитав даже описания, которое у нас уже было, и часто
 * возвращался ни с чем. Теперь текст показывается здесь, а переход остаётся
 * отдельным осознанным шагом.
 *
 * Отклик отсюда не принимается намеренно: способ отклика зависит от режима
 * интеграции источника, и решает это лента, а не окно с текстом.
 */
export function ExternalVacancySheet({ vacancy, onClose, onOpenSource }: Props) {
  const insets = useSafeAreaInsets();
  const { panHandlers, animStyle } = useSwipeToDismiss(onClose, !!vacancy);
  if (!vacancy) return null;

  const source = vacancy.sourceName ?? 'Партнёр';
  const station = vacancy.metroStation ?? vacancy.metroStationRaw;
  const posted = agoRu(vacancy.createdAt);

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom }, animStyle]}>
          <View {...panHandlers}><SheetHandle /></View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} bounces={false}>
            <Text style={styles.source}>
              {vacancy.company ? `${vacancy.company} · ` : ''}{source}{posted ? ` · ${posted}` : ''}
            </Text>
            <Text style={styles.title}>{vacancy.title}</Text>

            <View style={styles.chips}>
              {vacancy.salary ? (
                <Chip
                  label={`${vacancy.salary.toLocaleString('ru-RU')} ₽${vacancy.payPeriod === 'month' ? '/мес' : ''}`}
                  variant="salary"
                  icon="wallet-outline"
                />
              ) : null}
              {station ? <Chip label={station} variant="neutral" icon="subway-outline" /> : null}
              {vacancy.schedule ? <Chip label={vacancy.schedule} variant="neutral" icon="calendar-outline" /> : null}
              {vacancy.timeStart && vacancy.timeEnd
                ? <Chip label={`${vacancy.timeStart}–${vacancy.timeEnd}`} variant="neutral" icon="time-outline" />
                : null}
              {vacancy.address ? <Chip label={vacancy.address} variant="neutral" icon="location-outline" /> : null}
            </View>

            {vacancy.description ? (
              <>
                <Text style={styles.secLabel}>Описание</Text>
                <Text style={styles.desc}>{vacancy.description}</Text>
              </>
            ) : (
              <Text style={styles.desc}>Источник не прислал описания — оно есть на его странице.</Text>
            )}

            {/* Прямо и заранее: дальше человек уходит на чужой сайт, и там
                действуют не наши правила. Узнать об этом после перехода хуже,
                чем до. */}
            <Text style={styles.note}>
              Отклик на эту вакансию оформляется на стороне источника ({source}).
            </Text>

            <TouchableOpacity style={styles.openBtn} activeOpacity={0.85} onPress={() => onOpenSource(vacancy)}>
              <Ionicons name="open-outline" size={17} color="#fff" />
              <Text style={styles.openTxt}>Открыть у источника</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: {
    backgroundColor: Colors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
  },
  body: { paddingHorizontal: rs(20), paddingBottom: rs(24), gap: rs(10) },
  source: { fontSize: rf(13), color: Colors.textMuted, fontWeight: '600' },
  title: { fontSize: rf(20), lineHeight: rf(26), fontWeight: '800', color: Colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
  secLabel: { fontSize: rf(13), fontWeight: '700', color: Colors.textSecondary, marginTop: rs(6) },
  desc: { fontSize: rf(14.5), lineHeight: rf(21), color: Colors.textPrimary },
  note: { fontSize: rf(12.5), lineHeight: rf(18), color: Colors.textMuted, marginTop: rs(6) },
  openBtn: {
    marginTop: rs(8), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(8),
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: rs(14),
  },
  openTxt: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
});
