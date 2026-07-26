import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Radius } from '@/constants/theme';
import { PhoneInput } from '@/components/feature/PhoneInput';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useApp } from '@/hooks/useApp';
import { isPhoneComplete, extractPhoneDigits } from '@/services/storage';

import { rs, rf } from '@/constants/scale';

const SUPPORT_EMAIL = 'zpouches@yandex.ru';

export default function Login() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { loginUser, showToast } = useApp();

  const [phone, setPhone] = useState('+7 ');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [passError, setPassError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setPhoneError('');
    setPassError('');

    if (!password.trim()) {
      setPassError('Введите пароль');
      return;
    }

    setLoading(true);

    // Regular user check first — DB is the source of truth
    let user = null;
    try {
      user = await loginUser(phone, password);
    } catch (e) {
      console.error('[Login] loginUser error', e);
      setPhoneError('Ошибка входа. Проверьте соединение и попробуйте ещё раз.');
      setLoading(false);
      return;
    }

    if (user) {
      showToast('Добро пожаловать! 👋', 'success');
      setLoading(false);
      router.replace(returnTo ? `/${returnTo}` : '/(tabs)');
      return;
    }

    setPhoneError('Пользователь с таким номером не найден или неверный пароль');
    setLoading(false);
  };

  const openSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Восстановление пароля JobToo`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'center' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.sheet}>

        <Text style={styles.title}>Войти</Text>
        <Text style={styles.subtitle}>Номер телефона и пароль</Text>

        <PhoneInput
          value={phone}
          onChange={v => { setPhone(v); setPhoneError(''); }}
          error={phoneError}
        />

        <AppInput
          label="Пароль"
          value={password}
          onChangeText={v => { setPassword(v); setPassError(''); }}
          secureTextEntry
          placeholder="Минимум 6 символов"
        />
        {passError ? <Text style={styles.errText}>{passError}</Text> : null}

        <View style={{ marginTop: 8 }}>
          {loading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <PrimaryButton
              label="Войти →"
              onPress={handleLogin}
              disabled={!isPhoneComplete(phone) || !password.trim()}
            />
          )}
        </View>

        {/* Порядок внизу: сначала подсказка про почту, «Отмена» — последней.
            Раньше подсказка стояла над кнопкой «Войти» и перебивала её. */}
        <TouchableOpacity style={styles.forgotRow} onPress={openSupport} activeOpacity={0.8}>
          <View style={styles.forgotBanner}>
            <Text style={styles.forgotText}>
              Забыли пароль?{' '}
              <Text style={styles.forgotLink}>Обращайтесь на {SUPPORT_EMAIL}</Text>
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancel} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Отмена</Text>
        </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent', justifyContent: 'center' },
  // Раньше это была шторка, прижатая к низу: скруглялись только верхние углы.
  // Теперь окно стоит по центру, поэтому скругление круговое и есть поля по бокам.
  sheet: {
    backgroundColor: Colors.bg,
    borderRadius: rs(24),
    marginHorizontal: rs(16),
    padding: rs(24),
    gap: rs(14),
    // Sheet adapts to keyboard via parent KeyboardAvoidingView
  },
  title: { fontSize: rf(22), fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: rf(14), color: Colors.textMuted, marginTop: rs(-6), lineHeight: rf(20) },
  errText: { fontSize: rf(13), color: Colors.red, marginTop: rs(-6) },
  forgotRow: { marginTop: rs(-4) },
  forgotBanner: {
    backgroundColor: '#F0F4FF', borderRadius: rs(10), padding: rs(12),
    borderWidth: 1, borderColor: '#BFCBF5',
  },
  forgotText: { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rf(18) },
  forgotLink: { color: Colors.primary, fontWeight: '600' },
  cancel: { alignItems: 'center', marginTop: rs(4) },
  cancelText: { fontSize: rf(15), color: Colors.textMuted, fontWeight: '500' },
});
