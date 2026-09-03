import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { rf, rs } from '@/constants/scale';

interface DataStatusBannerProps {
  offline: boolean;
  failed?: boolean;
  hasCachedData?: boolean;
  retrying?: boolean;
  onRetry: () => void | Promise<void>;
}

export function DataStatusBanner({
  offline,
  failed = false,
  hasCachedData = false,
  retrying = false,
  onRetry,
}: DataStatusBannerProps) {
  if (!offline && !failed) return null;

  const title = offline ? 'Нет подключения к интернету' : 'Не удалось обновить данные';
  const detail = hasCachedData
    ? 'Показываем сохранённую информацию'
    : offline
      ? 'Подключитесь к сети и повторите'
      : 'Сервис временно недоступен';

  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${detail}`}
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'warning-outline'}
        size={rf(18)}
        color="#92400E"
      />
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <TouchableOpacity
        style={styles.retry}
        activeOpacity={0.8}
        disabled={retrying || offline}
        onPress={() => { void onRetry(); }}
        accessibilityRole="button"
        accessibilityLabel="Повторить загрузку"
      >
        {retrying
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : <Text style={[styles.retryText, offline && styles.retryDisabled]}>Повторить</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(9),
    marginHorizontal: rs(16),
    marginTop: rs(6),
    marginBottom: rs(2),
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  copy: { flex: 1 },
  title: { color: '#78350F', fontSize: rf(12), fontWeight: '700' },
  detail: { color: '#92400E', fontSize: rf(11), marginTop: rs(1) },
  retry: {
    minWidth: rs(66),
    minHeight: rs(34),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(8),
  },
  retryText: { color: Colors.primary, fontSize: rf(12), fontWeight: '700' },
  retryDisabled: { color: '#A8A29E' },
});
