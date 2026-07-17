import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Radius } from '@/constants/theme';

/**
 * Памятка директору в формах создания смены/вакансии:
 * отклики без ответа закрываются автоматически через 7 дней.
 */
export function AutoRejectNotice() {
  return (
    <View style={st.box}>
      <Ionicons name="time-outline" size={18} color="#92400E" />
      <Text style={st.txt}>
        Отвечайте на отклики вовремя: заявки без ответа <Text style={st.bold}>7 дней</Text> закрываются
        автоматически, и кандидат уходит. Одобрить или отклонить — один тап в разделе «Мэтчи» или в Telegram.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA',
    borderRadius: Radius.lg, padding: 12, marginBottom: 14,
  },
  txt: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  bold: { fontWeight: '800' },
});
