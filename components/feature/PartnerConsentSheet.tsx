import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { rs, rf } from '@/constants/scale';

export const PARTNER_CONSENT_VERSION = 'partner-transfer:2026-09-02';

type Props = {
  visible: boolean;
  partnerName: string;
  companyName?: string | null;
  onClose: () => void;
  onAccept: () => Promise<void>;
};

export function PartnerConsentSheet({ visible, partnerName, companyName, onClose, onAccept }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) { setConfirmed(false); setSending(false); setError(''); }
  }, [visible]);

  async function accept() {
    if (!confirmed || sending) return;
    setSending(true); setError('');
    try {
      await onAccept();
    } catch {
      setError('Не удалось сохранить согласие. Данные партнёру не отправлены.');
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>Передача отклика партнёру</Text>
          <Text style={s.lead}>
            Получатель: {partnerName}{companyName ? ` · ${companyName}` : ''}
          </Text>
          <ScrollView style={s.body}>
            <Text style={s.text}>
              Для отклика на выбранную вакансию JobToo передаст этому получателю:
            </Text>
            <Text style={s.list}>• данные профиля, необходимые для рассмотрения отклика;</Text>
            <Text style={s.list}>• данные отклика и последующие сообщения по этой вакансии;</Text>
            <Text style={s.list}>• статусы рассмотрения и результата отклика.</Text>
            <Text style={s.text}>
              Цель передачи — рассмотреть отклик, обеспечить диалог и синхронизировать его статус.
              Получатель обрабатывает данные по своим условиям. Согласие относится только к этой вакансии.
            </Text>
          </ScrollView>

          <TouchableOpacity style={s.checkRow} onPress={() => setConfirmed(v => !v)} activeOpacity={0.8}>
            <View style={[s.check, confirmed && s.checkOn]}><Text style={s.tick}>{confirmed ? '✓' : ''}</Text></View>
            <Text style={s.checkText}>Согласен на передачу перечисленных данных указанному получателю</Text>
          </TouchableOpacity>

          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={[s.accept, (!confirmed || sending) && s.disabled]}
            onPress={accept} disabled={!confirmed || sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.acceptText}>Продолжить отклик</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancel} onPress={onClose} disabled={sending}>
            <Text style={s.cancelText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22), padding: rs(20), maxHeight: '88%' },
  title: { fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary },
  lead: { fontSize: rf(14), color: Colors.textSecondary, marginTop: rs(8), marginBottom: rs(12) },
  body: { maxHeight: rs(260) },
  text: { fontSize: rf(13), lineHeight: rf(19), color: Colors.textSecondary, marginBottom: rs(10) },
  list: { fontSize: rf(13), lineHeight: rf(19), color: Colors.textPrimary, marginBottom: rs(4) },
  checkRow: { flexDirection: 'row', gap: rs(10), alignItems: 'flex-start', marginTop: rs(16) },
  check: { width: rs(22), height: rs(22), borderWidth: 1, borderColor: Colors.inputBorder, borderRadius: rs(6), alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tick: { color: '#fff', fontWeight: '700' },
  checkText: { flex: 1, fontSize: rf(13), lineHeight: rf(18), color: Colors.textPrimary },
  accept: { height: rs(50), borderRadius: rs(14), backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: rs(16) },
  disabled: { opacity: 0.45 },
  acceptText: { color: '#fff', fontSize: rf(15), fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: rs(12) },
  cancelText: { color: Colors.textSecondary, fontSize: rf(14) },
  error: { color: Colors.red, fontSize: rf(12), marginTop: rs(8) },
});
