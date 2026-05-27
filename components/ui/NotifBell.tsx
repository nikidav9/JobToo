import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  ScrollView, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';
import { dbGetNotifications, dbMarkNotifRead, dbMarkAllNotifsRead } from '@/services/db';

interface Notif {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export function NotifBell() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugLine, setDebugLine] = useState('');

  const count = app?.unreadNotifCount ?? 0;
  const userId = app?.currentUser?.id ?? null;

  const fetchNotifs = useCallback(async (uid: string) => {
    setLoading(true);
    setDebugLine('');
    try {
      const rows = await dbGetNotifications(uid);
      setDebugLine(`uid=${uid} rows=${rows.length}`);
      setNotifs(rows.map((n: any) => ({
        id: n.id, title: n.title, body: n.body,
        isRead: n.is_read, createdAt: n.created_at,
      })));
      app?.refreshNotifications?.();
    } catch (e: any) {
      setDebugLine(`uid=${uid} ERR: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [app]);

  function handleOpen() {
    if (!userId) return;
    setOpen(true);
    fetchNotifs(userId);
  }

  async function handleMarkAll() {
    if (!userId) return;
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    await dbMarkAllNotifsRead(userId).catch(() => {});
    app?.markAllNotifsRead?.();
  }

  async function handleTap(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    await dbMarkNotifRead(id).catch(() => {});
    app?.markNotifRead?.(id);
  }

  const unread = notifs.filter(n => !n.isRead).length;
  // Show badge from local state if available, else from context
  const badge = open ? unread : count;

  return (
    <>
      <TouchableOpacity onPress={handleOpen} style={s.btn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
        {badge > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Уведомления</Text>
            <View style={s.headerRight}>
              {notifs.some(n => !n.isRead) && (
                <TouchableOpacity onPress={handleMarkAll} style={s.markAllBtn}>
                  <Text style={s.markAllTxt}>Прочитать все</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setOpen(false)} style={s.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {!!debugLine && (
            <View style={{ backgroundColor: '#fff3cd', paddingHorizontal: 16, paddingVertical: 6 }}>
              <Text selectable style={{ fontSize: 11, color: '#856404', fontFamily: 'monospace' }}>{debugLine}</Text>
            </View>
          )}
          <ScrollView contentContainerStyle={s.list}>
            {loading ? (
              <View style={s.empty}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            ) : notifs.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🔔</Text>
                <Text style={s.emptyTitle}>Нет уведомлений</Text>
                <Text style={s.emptySub}>Здесь будут появляться важные уведомления</Text>
              </View>
            ) : (
              notifs.map(n => (
                <TouchableOpacity
                  key={n.id}
                  onPress={() => handleTap(n.id)}
                  activeOpacity={0.7}
                  style={[s.item, !n.isRead && s.itemUnread]}
                >
                  <View style={s.itemDot}>
                    {!n.isRead && <View style={s.dot} />}
                  </View>
                  <View style={s.itemBody}>
                    <Text style={[s.itemTitle, !n.isRead && s.itemTitleBold]}>{n.title}</Text>
                    <Text style={s.itemText}>{n.body}</Text>
                    <Text style={s.itemTime}>
                      {new Date(n.createdAt).toLocaleString('ru', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  btn: { position: 'relative', padding: 4 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: Colors.primary, borderRadius: 10,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '700' },

  sheet: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  markAllBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: Colors.primaryLight },
  markAllTxt: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  closeBtn: { padding: 4 },

  list: { paddingVertical: 8 },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  item: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  itemUnread: { backgroundColor: '#FFF8F5' },
  itemDot: { width: 20, alignItems: 'center', paddingTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, color: Colors.textPrimary, marginBottom: 3 },
  itemTitleBold: { fontWeight: '600' },
  itemText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 5 },
  itemTime: { fontSize: 11, color: Colors.textMuted },
});
