import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export function NotificationBell() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity style={styles.btn} onPress={() => setVisible(true)} activeOpacity={0.7}>
        <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.title}>Уведомления</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
              <Ionicons name="notifications-outline" size={56} color={Colors.textMuted} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.textPrimary }}>Уведомлений пока нет</Text>
              <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center' }}>
                Здесь будут появляться уведомления и новости от приложения
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  handle: { width: 36, height: 4, backgroundColor: Colors.inputBorder, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
});
