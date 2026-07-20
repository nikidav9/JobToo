import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { TelegramConnectButton } from '@/components/TelegramConnectButton';
import { NotifBell } from '@/components/ui/NotifBell';

// Единая шапка для всех вкладок: одинаковая высота, шрифт и размеры иконок.
// title отсутствует → показываем логотип JobToo. badge — доп. плашка слева
// (например «N ждут»). right — кастомный правый блок (профиль с шестерёнкой).
export function TabHeader({
  title, tgAnchor = false, badge, right,
}: {
  title?: string;
  tgAnchor?: boolean;
  badge?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={h.header}>
      <View style={h.left}>
        {title ? (
          <Text style={h.title} numberOfLines={1}>{title}</Text>
        ) : (
          <Text style={h.logo}>
            <Text style={h.logoB}>Job</Text>
            <Text style={h.logoO}>Too</Text>
          </Text>
        )}
        {badge ?? null}
      </View>
      {right ?? (
        <View style={h.right}>
          <TelegramConnectButton size={22} pad={4} onboardingAnchor={tgAnchor} />
          <NotifBell />
        </View>
      )}
    </View>
  );
}

// Общие размеры для правого блока (используются и в кастомном right профиля)
export const HEADER_ICON = 22;

const h = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  logo: { fontSize: 22 },
  logoB: { fontWeight: '800', color: Colors.textPrimary },
  logoO: { fontWeight: '800', color: Colors.primary },
});
