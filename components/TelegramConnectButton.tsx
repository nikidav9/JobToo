import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Linking,
  AppState, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { dbGetUserById, dbUnbindTelegram } from '@/services/db';
import { isTelegramMiniApp } from '@/lib/telegram';

const TG_BLUE = '#2AABEE';
const BOT_URL = 'https://t.me/JobToo_bot';

// Постоянная кнопка в шапке: логотип Telegram → модалка подключения уведомлений.
// Не исчезает после подключения — через неё же можно отключить или открыть бота.
export function TelegramConnectButton() {
  const app = useApp();
  const userId = app?.currentUser?.id ?? null;

  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState<boolean | null>(
    app?.currentUser?.telegramId ? true : null,
  );
  const [busy, setBusy] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  const refreshStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const u = await dbGetUserById(userId);
      setLinked(!!u?.telegramId);
    } catch {}
  }, [userId]);

  // Статус при появлении кнопки
  useEffect(() => {
    if (userId) refreshStatus();
  }, [userId, refreshStatus]);

  // Вернулись из Телеграма с открытой модалкой — перепроверяем привязку
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && openRef.current) refreshStatus();
    });
    return () => sub.remove();
  }, [refreshStatus]);

  // Внутри Telegram Mini App уведомления и так идут в Телеграм — кнопка не нужна
  if (!userId || isTelegramMiniApp()) return null;

  const connect = () => {
    Linking.openURL(`${BOT_URL}?start=link_${userId}`).catch(() => {});
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await dbUnbindTelegram(userId);
      setLinked(false);
    } catch {} finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={st.headerBtn}
        onPress={() => { setOpen(true); refreshStatus(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={st.tgCircle}>
          <Ionicons name="paper-plane" size={13} color="#fff" style={{ marginLeft: -1, marginTop: 1 }} />
        </View>
        {linked === false && <View style={st.attentionDot} />}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={st.backdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)} />
          <View style={st.sheet}>
            <View style={st.grabber} />

            <View style={st.titleRow}>
              <View style={st.tgCircleBig}>
                <Ionicons name="paper-plane" size={22} color="#fff" style={{ marginLeft: -2, marginTop: 2 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.title}>
                  {linked ? 'Telegram подключён' : 'Уведомления в Telegram'}
                </Text>
                <Text style={st.subtitle}>
                  {linked
                    ? 'Всё важное приходит тебе в личку'
                    : 'Самый быстрый способ ничего не пропустить'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {linked === null ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator color={TG_BLUE} />
              </View>
            ) : linked ? (
              <>
                <View style={st.connectedBox}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
                  <Text style={st.connectedText}>
                    Новые смены, ответы директоров и сообщения приходят в Telegram мгновенно
                  </Text>
                </View>
                <TouchableOpacity style={st.secondaryBtn} onPress={() => Linking.openURL(BOT_URL).catch(() => {})} activeOpacity={0.8}>
                  <Text style={st.secondaryText}>Открыть бота</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.dangerBtn} onPress={disconnect} disabled={busy} activeOpacity={0.7}>
                  <Text style={st.dangerText}>{busy ? 'Отключаем…' : 'Отключить уведомления'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={st.benefits}>
                  <Benefit icon="flash-outline" text="Новые смены и вакансии — сразу в личку, раньше всех" />
                  <Benefit icon="mail-unread-outline" text="Ответ директора на отклик — мгновенным сообщением" />
                  <Benefit icon="chatbubble-ellipses-outline" text="Ничего не потеряется, даже если пуши отключены" />
                </View>
                <TouchableOpacity style={st.connectBtn} onPress={connect} activeOpacity={0.85}>
                  <Ionicons name="paper-plane" size={17} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={st.connectText}>Подключить Telegram</Text>
                </TouchableOpacity>
                <Text style={st.hint}>
                  Откроется Телеграм — нажми «Start». Вернись сюда, статус обновится сам.
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function Benefit({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={st.benefitRow}>
      <View style={st.benefitIcon}>
        <Ionicons name={icon} size={16} color={TG_BLUE} />
      </View>
      <Text style={st.benefitText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  headerBtn: { position: 'relative' },
  tgCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: TG_BLUE,
    alignItems: 'center', justifyContent: 'center',
  },
  attentionDot: {
    position: 'absolute', top: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.primary,
    borderWidth: 1.5, borderColor: '#fff',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34,
  },
  grabber: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', marginBottom: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  tgCircleBig: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: TG_BLUE,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  benefits: { gap: 12, marginBottom: 20 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#E7F3FB',
    alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { flex: 1, fontSize: 14, lineHeight: 19, color: Colors.textPrimary, fontWeight: '500' },
  connectBtn: {
    height: 52, borderRadius: Radius.lg,
    backgroundColor: TG_BLUE,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  connectText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12.5, lineHeight: 17, color: Colors.textMuted, textAlign: 'center', marginTop: 10 },
  connectedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.greenLight, borderRadius: Radius.md,
    padding: 12, marginBottom: 16,
  },
  connectedText: { flex: 1, fontSize: 13.5, lineHeight: 18, color: Colors.textPrimary },
  secondaryBtn: {
    height: 48, borderRadius: Radius.lg,
    backgroundColor: '#E7F3FB',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  secondaryText: { color: TG_BLUE, fontSize: 15, fontWeight: '700' },
  dangerBtn: { alignItems: 'center', paddingVertical: 12 },
  dangerText: { color: Colors.red, fontSize: 14, fontWeight: '600' },
});
