import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/theme';

import { rs, rf } from '@/constants/scale';

import { LEGAL_DOCS, formatLegalDate, type LegalDocKey } from '@/constants/legal';

// Тексты и редакции переехали в constants/legal.ts: их читает и этот экран,
// и запись о согласии при регистрации. Пока текст жил здесь, а версии не
// было вовсе, формулировку можно было поправить незаметно — и потом никто
// не сказал бы, с чем именно согласились люди.

export default function LegalScreen() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const content = doc ? LEGAL_DOCS[doc as LegalDocKey] ?? null : null;

  if (!content) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTxt}>← Назад</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Документ</Text>
          <View style={{ width: 70 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: Colors.textMuted }}>Документ не найден</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{content.title}</Text>
        <View style={{ width: 70 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.docTitle}>{content.title}</Text>
        {/* Редакция на виду: без неё человек не может понять, тот ли это
            текст, который он принимал, а мы — доказать, какой принимали. */}
        <Text style={styles.version}>Редакция от {formatLegalDate(content.version)}</Text>
        {content.sections.map((s, i) => (
          <View key={i} style={styles.section}>
            {s.heading ? <Text style={styles.heading}>{s.heading}</Text> : null}
            <Text style={styles.docBody}>{s.body}</Text>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rs(16), paddingVertical: rs(14),
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: rs(70) },
  backTxt: { fontSize: rf(15), color: '#6B7280', fontWeight: '500' },
  headerTitle: { fontSize: rf(15), fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },
  body: { padding: rs(20), paddingBottom: rs(40), gap: rs(16) },
  docTitle: { fontSize: rf(20), fontWeight: '800', color: '#111827', lineHeight: rf(26) },
  section: { gap: rs(6) },
  heading: { fontSize: rf(15), fontWeight: '700', color: '#111827' },
  version: { fontSize: rf(12.5), color: Colors.textMuted, marginTop: rs(-8) },
  docBody: { fontSize: rf(15), color: '#374151', lineHeight: rf(24) },
});
