import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';
import { rs, rf } from '@/constants/scale';

/**
 * Заглушка для гостевого режима: этот раздел доступен только после регистрации.
 * Показывается вместо матчей/чатов/профиля, пока человек смотрит как гость —
 * там нечего показать без аккаунта, а профиль ещё и писал бы в базу.
 */
export default function GuestGate({ title, subtitle }: { title: string; subtitle: string }) {
  const router = useRouter();
  const { exitGuest } = useApp();
  const go = () => { exitGuest(); router.replace('/'); };
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.wrap}>
        <View style={s.iconCircle}>
          <Ionicons name="lock-closed-outline" size={rs(30)} color={Colors.primary} />
        </View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{subtitle}</Text>
        <TouchableOpacity style={s.btn} activeOpacity={0.85} onPress={go}>
          <Text style={s.btnTxt}>Зарегистрироваться</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(32), gap: rs(12) },
  iconCircle: {
    width: rs(64), height: rs(64), borderRadius: rs(32),
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.inputBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: rs(4),
  },
  title: { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  sub: { fontSize: rf(13.5), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(19) },
  btn: {
    marginTop: rs(8), backgroundColor: Colors.primary,
    paddingHorizontal: rs(28), paddingVertical: rs(13), borderRadius: rs(14),
  },
  btnTxt: { color: '#fff', fontSize: rf(15), fontWeight: '800' },
});
