import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { PASSWORD_RULES } from '@/constants/passwordRules';

/**
 * Список требований к паролю под полем ввода.
 *
 * Пункт загорается зелёным, как только выполнен, — человек видит, чего не
 * хватает, ещё до нажатия кнопки, а не получает отказ постфактум.
 */
export function PasswordRules({ password }: { password: string }) {
  return (
    <View style={s.wrap}>
      {PASSWORD_RULES.map(rule => {
        const done = rule.ok(password);
        return (
          <View key={rule.id} style={s.row}>
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={15}
              color={done ? Colors.green : Colors.textMuted}
            />
            <Text style={[s.label, done && s.labelDone]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6, marginTop: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { fontSize: 13, color: Colors.textMuted },
  labelDone: { color: Colors.green, fontWeight: '600' },
});
