import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { ToastType } from '@/contexts/AppContext';

import { rs, rf } from '@/constants/scale';

interface Props {
  message: string;
  type: ToastType;
  visible: boolean;
}

const BAR_COLOR: Record<ToastType, string> = {
  success: Colors.primary,
  error: Colors.red,
  info: Colors.primary,
  match: Colors.green,
};
const EMOJI: Record<ToastType, string> = { success: '✅', error: '❌', info: 'ℹ️', match: '🎉' };

export function Toast({ message, type, visible }: Props) {
  const anim = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 60, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: -80, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: anim }] }]}>
      <View style={[styles.bar, { backgroundColor: BAR_COLOR[type] }]} />
      <Text style={styles.text}>{EMOJI[type]} {message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: rs(20),
    right: rs(20),
    zIndex: 999,
    backgroundColor: '#fff',
    borderRadius: rs(12),
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    paddingVertical: rs(12),
    paddingHorizontal: rs(16),
    gap: rs(10),
  },
  bar: { width: rs(4), height: '100%', borderRadius: rs(2), position: 'absolute', left: 0, top: 0, bottom: 0 },
  text: { fontSize: rf(14), color: Colors.textPrimary, fontWeight: '500', flex: 1, marginLeft: rs(10) },
});
