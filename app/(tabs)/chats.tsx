import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Animated, PanResponder, Dimensions, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { Chat } from '@/constants/types';
import { nameColorFromString, getInitials } from '@/services/storage';
import { dbDeleteChat } from '@/services/db';
import { TabHeader } from '@/components/ui/TabHeader';

const { width: SW } = Dimensions.get('window');
const DELETE_THRESHOLD = -80;

function UserAvatar({ name, avatarUrl, size = 44 }: { name: string; avatarUrl?: string; size?: number }) {
  const color = nameColorFromString(name);
  const initials = getInitials(name);
  const borderRadius = size / 2;
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius }}
        contentFit="cover"
        transition={150}
      />
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontSize: size * 0.36, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

function ChatRow({ item, currentUser, users, onPress, onDelete }: {
  item: Chat;
  currentUser: any;
  users: any[];
  onPress: () => void;
  onDelete: () => void;
}) {
  const pan = useRef(new Animated.Value(0)).current;
  const [deleting, setDeleting] = useState(false);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => {
      pan.setOffset((pan as any)._value);
      pan.setValue(0);
    },
    onPanResponderMove: (_, g) => {
      if (g.dx <= 0) pan.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      pan.flattenOffset();
      if (g.dx < DELETE_THRESHOLD) {
        Animated.spring(pan, { toValue: -120, useNativeDriver: false }).start();
      } else {
        Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
      }
    },
  })).current;

  const otherId = currentUser.role === 'worker' ? item.employerId : item.workerId;
  const other = users.find((u: any) => u.id === otherId);
  const name = other ? `${other.firstName} ${other.lastName}` : item.companyName;
  const avatarUrl = other?.avatarUrl;

  const unread = currentUser.role === 'worker' ? item.unreadWorker : item.unreadEmployer;
  const last = item.messages[item.messages.length - 1];

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleDelete = () => {
    Alert.alert(
      'Удалить переписку?',
      'Переписка будет удалена только у вас.',
      [
        { text: 'Отмена', style: 'cancel', onPress: () => Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start() },
        {
          text: 'Удалить', style: 'destructive', onPress: () => {
            setDeleting(true);
            onDelete();
          },
        },
      ]
    );
  };

  if (deleting) return null;

  return (
    <View style={styles.swipeRow}>
      {/* Delete button revealed on left swipe */}
      <View style={styles.deleteAction}>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={styles.deleteBtnLabel}>Удалить</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.chatRowAnimated, { transform: [{ translateX: pan }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity style={styles.chatRow} onPress={onPress} activeOpacity={0.8}>
          <UserAvatar name={name} avatarUrl={avatarUrl} size={44} />
          <View style={styles.chatInfo}>
            <View style={styles.chatTop}>
              <Text style={styles.chatName} numberOfLines={1}>{name}</Text>
              {last ? <Text style={styles.chatTime}>{formatTime(last.timestamp)}</Text> : null}
            </View>
            <Text style={styles.chatVac} numberOfLines={1}>{item.vacTitle}</Text>
            <Text style={styles.chatLast} numberOfLines={1}>
              {last ? last.text : ''}
            </Text>
          </View>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function ChatsScreen() {
  const router = useRouter();
  const { currentUser, chats, users, refreshChats, refreshAll, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const myChats = chats.filter(c =>
    currentUser.role === 'worker' ? c.workerId === currentUser.id : c.employerId === currentUser.id
  );

  const filtered = myChats.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    // Search by vacancy title, company name, and the other person's name
    const otherId = currentUser.role === 'worker' ? c.employerId : c.workerId;
    const other = users.find(u => u.id === otherId);
    const otherName = other ? `${other.firstName} ${other.lastName}`.toLowerCase() : '';
    return (
      c.vacTitle.toLowerCase().includes(q) ||
      c.companyName.toLowerCase().includes(q) ||
      otherName.includes(q)
    );
  });

  const handleDelete = async (chatId: string) => {
    await dbDeleteChat(chatId);
    await refreshChats();
    showToast('Переписка удалена', 'success');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TabHeader title="Сообщения" />

      <View style={styles.searchWrap}>
        <View style={styles.searchInner}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по чатам..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-ellipses-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Нет сообщений</Text>
          <Text style={styles.emptySubtitle}>Чаты появятся после мэтча</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <ChatRow
              item={item}
              currentUser={currentUser}
              users={users}
              onPress={() => router.push({ pathname: '/chat-room', params: { chatId: item.id } })}
              onDelete={() => handleDelete(item.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  // Поиск стоял вплотную к заголовку и читался его частью. Отодвинули и
  // скруглили до овала — теперь это отдельный элемент, а не продолжение шапки.
  searchWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14 },
  searchInner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 100,
    borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, padding: 0 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 6 },

  swipeRow: { position: 'relative', overflow: 'hidden' },
  deleteAction: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: 120, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.red,
  },
  deleteBtn: { alignItems: 'center', gap: 4 },
  deleteBtnLabel: { fontSize: 11, color: '#fff', fontWeight: '600' },

  chatRowAnimated: { backgroundColor: Colors.bg },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chatInfo: { flex: 1 },
  chatTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  chatTime: { fontSize: 12, color: Colors.textMuted },
  chatVac: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  chatLast: { fontSize: 13, color: '#374151', marginTop: 2 },
  badge: { backgroundColor: Colors.primary, borderRadius: 100, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
