import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
// Именно отсюда, а не из react-native: тот SafeAreaView работает только на
// iOS, а на Android остаётся обычным контейнером. Из-за этого содержимое
// окна залезало под часы и значок сети — на айфоне всё выглядело нормально,
// а на андроидах нет.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { routeForNotification, routeByTitle } from '@/services/notificationRoute';
import { Colors } from '@/constants/theme';
import {
  dbGetNotifications, dbMarkNotifRead, dbMarkAllNotifsRead,
  dbDeleteNotif, dbDeleteAllNotifs,
} from '@/services/db';

interface Notif {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  /** Вид уведомления — по нему открываем нужный экран (может отсутствовать
   *  у записей, созданных до появления колонки) */
  type?: string | null;
  payload?: { chatId?: string } | null;
}

export function NotifBell() {
  const app = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const count = app?.unreadNotifCount ?? 0;
  const userId = app?.currentUser?.id ?? null;

  const fetchNotifs = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const rows = await dbGetNotifications(uid);
      setNotifs(rows.map((n: any) => ({
        id: n.id, title: n.title, body: n.body,
        isRead: n.is_read, createdAt: n.created_at,
        type: n.type ?? null,
        // payload приходит объектом (jsonb) либо строкой — принимаем оба вида
        payload: typeof n.payload === 'string'
          ? (() => { try { return JSON.parse(n.payload); } catch { return null; } })()
          : (n.payload ?? null),
      })));
      app?.refreshNotifications?.();
    } catch {
      // keep current list on error
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

  /** Чат с этим человеком — для старых уведомлений «💬 Имя», у которых
   *  не сохранён chatId. Имя берём из заголовка. */
  function chatIdByPersonName(title: string): string | undefined {
    const name = title.replace(/^💬\s*/, '').trim();
    if (!name) return undefined;
    const me = app?.currentUser;
    const chats = app?.chats ?? [];
    const users = app?.users ?? [];
    const match = chats.find((c: any) => {
      const otherId = me?.role === 'worker' ? c.employerId : c.workerId;
      const u = users.find((x: any) => x.id === otherId);
      return u && `${u.firstName} ${u.lastName}`.trim() === name;
    });
    return match?.id;
  }

  async function handleTap(n: Notif) {
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
    dbMarkNotifRead(n.id).catch(() => {});
    app?.markNotifRead?.(n.id);

    // Уведомление — это ссылка: открываем экран, о котором оно говорит
    let target = routeForNotification(n.type, n.payload);
    if (!target || (target.pathname === '/(tabs)/chats' && n.title.startsWith('💬'))) {
      const chatId = n.payload?.chatId ?? chatIdByPersonName(n.title);
      if (chatId) target = { pathname: '/chat-room', params: { chatId } };
    }
    if (!target) target = routeByTitle(n.title);
    if (!target) return;

    setOpen(false);
    router.push(target as never);
  }

  async function handleDelete(id: string) {
    setNotifs(prev => prev.filter(n => n.id !== id));
    await dbDeleteNotif(id).catch(() => {});
    app?.refreshNotifications?.();
  }

  async function handleDeleteAll() {
    if (!userId) return;
    if (!confirmDeleteAll) { setConfirmDeleteAll(true); return; }
    setConfirmDeleteAll(false);
    setNotifs([]);
    await dbDeleteAllNotifs(userId).catch(() => {});
    app?.refreshNotifications?.();
  }

  const unread = notifs.filter(n => !n.isRead).length;
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

      <Modal statusBarTranslucent navigationBarTranslucent visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={s.sheet} edges={['top', 'bottom', 'left', 'right']}>
          <View style={s.header}>
            <Text style={s.title}>Уведомления</Text>
            <View style={s.headerRight}>
              {notifs.length > 0 && (
                confirmDeleteAll ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity onPress={handleDeleteAll} style={s.deleteAllBtn}>
                      <Text style={s.deleteAllTxt}>Подтвердить</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setConfirmDeleteAll(false)} style={s.cancelBtn}>
                      <Text style={s.cancelTxt}>Отмена</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleDeleteAll} style={s.deleteAllBtn}>
                    <Text style={s.deleteAllTxt}>Удалить все</Text>
                  </TouchableOpacity>
                )
              )}
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

          <ScrollView contentContainerStyle={s.list}>
            {loading ? (
              <View style={s.empty}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            ) : notifs.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="notifications-outline" size={56} color={Colors.textMuted} style={{ marginBottom: 16 }} />
                <Text style={s.emptyTitle}>Нет уведомлений</Text>
                <Text style={s.emptySub}>Здесь будут появляться важные уведомления</Text>
              </View>
            ) : (
              notifs.map(n => (
                <View key={n.id} style={[s.item, !n.isRead && s.itemUnread]}>
                  <TouchableOpacity
                    onPress={() => handleTap(n)}
                    activeOpacity={0.7}
                    style={s.itemContent}
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
                    {/* Стрелка — знак того, что уведомление открывается */}
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ alignSelf: 'center' }} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(n.id)} style={s.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteAllBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#FEE2E2' },
  deleteAllTxt: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  cancelBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: Colors.divider },
  cancelTxt: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  markAllBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: Colors.primaryLight },
  markAllTxt: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  closeBtn: { padding: 4 },

  list: { paddingVertical: 8 },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 20, paddingRight: 12, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  itemUnread: { backgroundColor: '#FFF8F5' },
  itemContent: { flex: 1, flexDirection: 'row' },
  itemDot: { width: 20, alignItems: 'center', paddingTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, color: Colors.textPrimary, marginBottom: 3 },
  itemTitleBold: { fontWeight: '600' },
  itemText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 5 },
  itemTime: { fontSize: 11, color: Colors.textMuted },
  deleteBtn: { padding: 6, marginLeft: 8 },
});
