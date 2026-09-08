import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { rs, rf } from '@/constants/scale';

// Ссылки на все юридические документы. Экран /legal авторизации не требует,
// поэтому этот блок можно показывать до регистрации — на стартовом экране и
// экране входа, чтобы документы были доступны любому, а не только после входа.
const DOCS: { key: 'terms' | 'privacy' | 'dataPolicy' | 'consent'; label: string }[] = [
  { key: 'terms', label: 'Пользовательское соглашение' },
  { key: 'privacy', label: 'Политика конфиденциальности' },
  { key: 'dataPolicy', label: 'Политика обработки персональных данных' },
  { key: 'consent', label: 'Согласие на обработку данных' },
];

export function LegalLinks({ style }: { style?: ViewStyle }) {
  const router = useRouter();
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.caption}>Документы</Text>
      <View style={styles.links}>
        {DOCS.map((d, i) => (
          <React.Fragment key={d.key}>
            {i > 0 ? <Text style={styles.dot}>·</Text> : null}
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/legal', params: { doc: d.key } })}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={styles.link}>{d.label}</Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: rs(4) },
  caption: {
    fontSize: rf(10.5), color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  links: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', alignItems: 'center', gap: rs(6),
  },
  link: { fontSize: rf(12), color: Colors.textSecondary, textDecorationLine: 'underline' },
  dot: { fontSize: rf(12), color: Colors.textMuted },
});
