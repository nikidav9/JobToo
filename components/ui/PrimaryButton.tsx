import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Colors } from '@/constants/theme';

import { rs, rf } from '@/constants/scale';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
  small?: boolean;
  danger?: boolean;
}

export function PrimaryButton({ label, onPress, disabled, loading, secondary, small, danger }: Props) {
  const bg = danger ? Colors.red : secondary ? Colors.bg : Colors.primary;
  const border = secondary ? Colors.inputBorder : danger ? Colors.red : Colors.primary;
  const color = secondary ? Colors.textPrimary : '#fff';
  const h = small ? 36 : 52;
  const fs = small ? 13 : 15;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, height: h, opacity: (disabled || loading) ? 0.45 : 1 },
        secondary && styles.secondary,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Text
          style={[styles.label, { color, fontSize: fs }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    borderRadius: rs(100),
    // Боковые поля: высота у кнопки фиксированная, и длинная подпись
    // без них упиралась в края овала и вылезала наружу
    paddingHorizontal: rs(14),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  secondary: {
    borderColor: Colors.inputBorder,
  },
  label: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
