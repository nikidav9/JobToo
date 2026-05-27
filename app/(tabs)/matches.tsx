import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { Like, Vacancy } from '@/constants/types';
import { formatDate, getInitials, nameColorFromString } from '@/services/storage';
import { dbUpsertLike, dbCheckAndCreateMatch, dbConfirmShift } from '@/services/db';
import { NotifBell } from '@/components/ui/NotifBell';
import {
  notifyWorkerShiftConfirmedByEmployer,
  notifyWorkerGotMatch,
} from '@/services/notifications';
import { Chip } from '@/components/ui/Chip';
import { VacancyDetailModal } from '@/components/feature/VacancyDetailModal';
import { NotificationBell } from '@/components/ui/NotificationBell';

// ─── Status badge ─────────────────────────────────────────────────────────────
function MatchStatus({ like, isWorker }: { like: Like; isWorker: boolean }) {
  if (like.shiftCompleted) {
    return <View style={[s.statusBadge, { backgroundColor: '#D1FAE5' }]}><Text style={[s.statusTxt, { color: Colors.green }]}>✅ Смена завершена</Text></View>;
  }
  if (like.isMatch) {
    if (isWorker) {
      if (like.shiftCompleted && !like.workerRated)
        return <View style={[s.statusBadge, { backgroundColor: '#FFF7ED' }]}><Text style={[s.statusTxt, { color: '#92400E' }]}>⭐ Оставьте отзыв о работодателе!</Text></View>;
    } else {
      if (!like.employerConfirmed)
        return <View style={[s.statusBadge, { backgroundColor: Colors.primaryLight }]}><Text style={[s.statusTxt, { color: Colors.primary }]}>⏰ Подтвердите смену</Text></View>;
      if (like.employerConfirmed && !like.employerRated)
        return <View style={[s.statusBadge, { backgroundColor: '#FFF7ED' }]}><Text style={[s.statusTxt, { color: '#92400E' }]}>⭐ Оцените работника!</Text></View>;
    }
    return <View style={[s.statusBadge, { backgroundColor: Colors.primaryLight }]}><Text style={[s.statusTxt, { color: Colors.primary }]}>🎉 Мэтч!</Text></View>;
  }
  if (like.employerLiked === false) {
    return <View style={[s.statusBadge, { backgroundColor: '#FEE2E2' }]}><Text style={[s.statusTxt, { color: Colors.red }]}>✕ Отказ</Text></View>;
  }
  return <View style={[s.statusBadge, { backgroundColor: Colors.surface }]}><Text style={[s.statusTxt, { color: Colors.textMuted }]}>⏳ На рассмотрении</Text></View>;
}

// ─── Confirm shift banner (employer only) with confirmation dialog ─────────────
function ConfirmBanner({ onConfirm, loading }: { onConfirm: () => void; loading: boolean }) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <View style={s.confirmBanner}>
        <Text style={s.confirmBannerIcon}>⏰</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.confirmBannerTitle}>Подтвердите смену</Text>
          <Text style={s.confirmBannerSub}>Нажмите кнопку, чтобы завершить смену</Text>
        </View>
        <TouchableOpacity
          style={s.confirmBannerBtn}
          onPress={() => setShowDialog(true)}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.confirmBannerBtnTxt}>✔</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Confirmation dialog */}
      {showDialog ? (
        <View style={s.dialogOverlay}>
          <View style={s.dialogCard}>
            <Text style={s.dialogTitle}>Подтвердить завершение смены?</Text>
            <Text style={s.dialogBody}>
              Смена будет отмечена как завершённая. Вам предложат оценить работника.
            </Text>
            <View style={s.dialogBtns}>
              <TouchableOpacity
                style={s.dialogCancelBtn}
                onPress={() => setShowDialog(false)}
                activeOpacity={0.8}
              >
                <Text style={s.dialogCancelTxt}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.dialogConfirmBtn}
                onPress={() => { setShowDialog(false); onConfirm(); }}
                activeOpacity={0.8}
              >
                <Text style={s.dialogConfirmTxt}>Подтвердить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────
// WORKER VIEW
// ─────────────────────────────────────────────────
function WorkerMatches() {
  const router = useRouter();
  const { currentUser, likes, vacancies, users, refreshAll, showToast } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [detailVacancy, setDetailVacancy] = useState<Vacancy | null>(null);
  const [tab, setTab] = useState<'active' | 'rejected' | 'completed'>('active');
  const tabBarHeight = useBottomTabBarHeight();

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const myLikes = likes.filter(l => l.workerId === currentUser.id && l.workerLiked);

  const getVacancy = (id: string) => vacancies.find(v => v.id === id);

  const activeItems = myLikes.filter(l => !l.shiftCompleted && l.employerLiked !== false);
  const rejectedItems = myLikes.filter(l => l.employerLiked === false);
  const completedItems = myLikes.filter(l => l.shiftCompleted);

  const shownItems =
    tab === 'active' ? activeItems :
    tab === 'rejected' ? rejectedItems :
    completedItems;

  const renderItem = ({ item: like }: { item: Like }) => {
    const vac = getVacancy(like.vacancyId);
    if (!vac) return null;
    const employer = users.find(u => u.id === like.employerId);
    const isMatch = like.isMatch;
    const isCompleted = like.shiftCompleted;
    // Worker can rate if shift is completed and they haven't rated yet
    const canRate = isCompleted && !like.workerRated;

    return (
      <View style={[s.card, isMatch && !isCompleted && s.matchedCard, isCompleted && s.completedCard]}>
        <MatchStatus like={like} isWorker={true} />

        <TouchableOpacity activeOpacity={0.8} onPress={() => setDetailVacancy(vac)}>
          <Text style={s.jobTitle}>{vac.title}</Text>
          <Text style={s.subText}>{vac.company} · 🚇 {vac.metroStation}</Text>
        </TouchableOpacity>

        <View style={s.chipsRow}>
          <Chip label={`📅 ${formatDate(vac.date)}`} variant="date" />
          <Chip label={`⏰ ${vac.timeStart}–${vac.timeEnd}`} variant="time" />
        </View>

        {/* Employer info */}
        {employer ? (
          <TouchableOpacity
            style={s.profileRow}
            onPress={() => router.push({ pathname: '/user-profile', params: { userId: employer.id } })}
            activeOpacity={0.8}
          >
            {employer.avatarUrl ? (
              <Image source={{ uri: employer.avatarUrl }} style={s.profileAvatar} contentFit="cover" />
            ) : (
              <View style={[s.profileAvatar, s.profileAvatarFallback, { backgroundColor: nameColorFromString(employer.id) }]}>
                <Text style={s.profileAvatarInitials}>{getInitials(`${employer.firstName} ${employer.lastName}`)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{employer.company ?? `${employer.firstName} ${employer.lastName}`}</Text>
              {(employer.avgRating ?? 0) > 0 ? (
                <Text style={s.profileSub}>⭐ {(employer.avgRating ?? 0).toFixed(1)} ({employer.ratingCount} отз.)</Text>
              ) : null}
            </View>
            <Text style={s.profileArrow}>Профиль ›</Text>
          </TouchableOpacity>
        ) : null}

        {/* Actions */}
        {isMatch ? (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.chatBtn}
              onPress={() => router.push({ pathname: '/(tabs)/chats' })}
              activeOpacity={0.8}
            >
              <Text style={s.chatBtnTxt}>💬 Чат</Text>
            </TouchableOpacity>
            {canRate && employer && vac ? (
              <TouchableOpacity
                style={s.rateBtn}
                onPress={() => router.push({
                  pathname: '/rate',
                  params: {
                    likeId: like.id,
                    toUserId: employer.id,
                    toName: employer.company ?? `${employer.firstName} ${employer.lastName}`,
                    vacancyId: vac.id,
                    role: 'worker',
                  },
                })}
                activeOpacity={0.8}
              >
                <Text style={s.rateBtnTxt}>⭐ Оставить отзыв</Text>
              </TouchableOpacity>
            ) : isCompleted && like.workerRated ? (
              <View style={s.waitBtn}><Text style={s.waitBtnTxt}>✓ Отзыв оставлен</Text></View>
            ) : !isCompleted ? (
              <View style={s.waitBtn}><Text style={s.waitBtnTxt}>⏳ Ждём подтверждения</Text></View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const TABS = [
    { key: 'active',    label: 'Активные',  count: activeItems.length },
    { key: 'rejected',  label: 'Отказ',     count: rejectedItems.length },
    { key: 'completed', label: 'Завершено', count: completedItems.length },
  ] as const;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={s.title}>Мои отклики</Text>
        <NotifBell />
        <NotificationBell />
      </View>

      {/* Tab strip */}
      <View style={s.tabStrip}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={s.tabItem} onPress={() => setTab(t.key)} activeOpacity={0.8}>
            <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>
              {t.label}{t.count > 0 ? ` (${t.count})` : ''}
            </Text>
            {tab === t.key ? <View style={s.tabUnderline} /> : null}
          </TouchableOpacity>
        ))}
      </View>

      {shownItems.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 48 }}>
            {tab === 'active' ? '📋' : tab === 'rejected' ? '😔' : '🏁'}
          </Text>
          <Text style={s.emptyTitle}>
            {tab === 'active' ? 'Нет активных заявок' : tab === 'rejected' ? 'Нет отказов' : 'Нет завершённых смен'}
          </Text>
          <Text style={s.emptySub}>
            {tab === 'active'
              ? 'Откликайтесь на вакансии — они появятся здесь'
              : tab === 'rejected'
              ? 'Это хорошо! Продолжайте откликаться'
              : 'Завершённые смены появятся здесь'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={shownItems}
          keyExtractor={l => l.id}
          contentContainerStyle={[s.list, { paddingBottom: tabBarHeight + 16 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          renderItem={renderItem}
        />
      )}

      <VacancyDetailModal
        vacancy={detailVacancy}
        visible={!!detailVacancy}
        onClose={() => setDetailVacancy(null)}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────
// EMPLOYER VIEW
// ─────────────────────────────────────────────────
function EmployerMatches() {
  const router = useRouter();
  const { currentUser, likes, vacancies, users, refreshAll, showToast } = useApp();
  const [actionLoading, setLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'matched' | 'completed'>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const myVacIds = vacancies.filter(v => v.employerId === currentUser.id).map(v => v.id);
  const allLikes = likes.filter(l => myVacIds.includes(l.vacancyId) && l.workerLiked);

  const pending = allLikes.filter(l => !l.isMatch && l.employerLiked !== false);
  const matched = allLikes.filter(l => l.isMatch && !l.shiftCompleted);
  const completed = allLikes.filter(l => l.isMatch && l.shiftCompleted);

  const needsConfirm = matched.filter(l => !l.employerConfirmed).length;
  const shown = tab === 'pending' ? pending : tab === 'matched' ? matched : completed;

  const getVacancy = (id: string) => vacancies.find(v => v.id === id);
  const getWorker = (id: string) => users.find(u => u.id === id);

  const approve = async (like: Like) => {
    setLoading(like.id);
    try {
      const vac = getVacancy(like.vacancyId);
      const worker = getWorker(like.workerId);
      const workerName = worker ? `${worker.firstName} ${worker.lastName}` : 'Работник';

      // Step 1: set employerLiked=true in DB
      await dbUpsertLike(like.vacancyId, like.workerId, currentUser.id, { employerLiked: true });

      // Step 2: check/create match — upsert is already committed, check immediately
      let result: { matched: boolean; chatId?: string } = { matched: false };
      result = await dbCheckAndCreateMatch(like.vacancyId, like.workerId);
      if (!result.matched && !result.chatId) {
        // Small delay then one retry (in case of Supabase connection pool lag)
        await new Promise(r => setTimeout(r, 400));
        result = await dbCheckAndCreateMatch(like.vacancyId, like.workerId);
      }

      // Step 3: refresh context in background — navigate immediately
      refreshAll().catch(() => {});

      if (result.matched || result.chatId) {
        notifyWorkerGotMatch(like.workerId, vac?.company ?? currentUser.company ?? '', vac?.title ?? '').catch(() => {});
        showToast(`🎉 Мэтч с ${workerName}!`, 'success');
        router.push({ pathname: '/chat-room', params: { chatId: result.chatId } });
      } else {
        showToast(`✅ Подтверждено — ждём создания чата`, 'info');
        router.push({ pathname: '/(tabs)/chats' });
      }
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setLoading(null);
    }
  };

  const dismiss = async (like: Like) => {
    const key = like.id + '_d';
    setLoading(key);
    try {
      await dbUpsertLike(like.vacancyId, like.workerId, currentUser.id, { employerLiked: false });
      refreshAll().catch(() => {});
      showToast('Отклонено', 'success');
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setLoading(null);
    }
  };

  // Only employer can confirm the shift — marks as completed and navigates to rate screen
  const confirmShift = async (like: Like) => {
    const key = like.id + '_shift';
    setLoading(key);
    try {
      await dbConfirmShift(like.id, 'employer');
      refreshAll().catch(() => {});
      const worker = getWorker(like.workerId);
      const vac = getVacancy(like.vacancyId);
      const workerName = worker ? `${worker.firstName} ${worker.lastName}` : 'Работник';
      const company = currentUser.company ?? `${currentUser.firstName} ${currentUser.lastName}`;

      // Notify worker that employer confirmed → they can now rate
      if (worker && vac) {
        notifyWorkerShiftConfirmedByEmployer(worker.id, company, vac.title).catch(() => {});
      }

      showToast('Смена подтверждена! Оцените работника 🌟', 'success');

      // Navigate employer to rate the worker — rating starts at 0 (no auto-stars)
      if (worker && vac) {
        router.push({
          pathname: '/rate',
          params: {
            likeId: like.id,
            toUserId: worker.id,
            toName: workerName,
            vacancyId: vac.id,
            role: 'employer',
          },
        });
      }
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setLoading(null);
    }
  };

  const renderItem = ({ item: like }: { item: Like }) => {
    const vac = getVacancy(like.vacancyId);
    const worker = getWorker(like.workerId);
    if (!vac) return null;
    const workerName = worker
      ? `${worker.firstName} ${worker.lastName}`.trim() || 'Работник'
      : 'Работник';
    const workerColor = nameColorFromString(worker?.id ?? like.workerId);
    const isLoading = actionLoading === like.id;
    const isDLoading = actionLoading === like.id + '_d';
    const isShiftLoading = actionLoading === like.id + '_shift';

    if (like.isMatch) {
      return (
        <View style={[s.card, like.shiftCompleted ? s.completedCard : s.matchedCard]}>
          <MatchStatus like={like} isWorker={false} />

          {/* Confirm banner — only when shift not yet completed */}
          {!like.shiftCompleted && !like.employerConfirmed ? (
            <ConfirmBanner onConfirm={() => confirmShift(like)} loading={isShiftLoading} />
          ) : null}

          <TouchableOpacity
            style={s.workerRow}
            onPress={() => worker
              ? router.push({ pathname: '/user-profile', params: { userId: worker.id } })
              : null}
            activeOpacity={0.8}
          >
            {worker?.avatarUrl ? (
              <Image source={{ uri: worker.avatarUrl }} style={s.avatar} contentFit="cover" transition={150} />
            ) : (
              <View style={[s.avatar, { backgroundColor: workerColor, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={s.avatarTxt}>{getInitials(workerName)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.workerName}>{workerName}</Text>
              {worker?.metroStation ? (
                <Text style={s.profileSub}>🚇 {worker.metroStation}</Text>
              ) : null}
              {(worker?.avgRating ?? 0) > 0 ? (
                <Text style={s.profileSub}>
                  ⭐ {(worker?.avgRating ?? 0).toFixed(1)} ({worker?.ratingCount} отз.)
                </Text>
              ) : null}
            </View>
            {worker?.phone ? (
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={s.phoneTag}><Text style={s.phoneTxt}>{worker.phone}</Text></View>
                <Text style={s.profileArrow}>Профиль ›</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <Text style={s.vacLabel}>{vac.title} · {formatDate(vac.date)}</Text>

          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.chatBtn}
              onPress={() => router.push({ pathname: '/(tabs)/chats' })}
              activeOpacity={0.8}
            >
              <Text style={s.chatBtnTxt}>💬 Чат</Text>
            </TouchableOpacity>
            {like.shiftCompleted && !like.employerRated && worker && vac ? (
              <TouchableOpacity
                style={s.rateBtn}
                onPress={() => router.push({
                  pathname: '/rate',
                  params: {
                    likeId: like.id,
                    toUserId: worker.id,
                    toName: workerName,
                    vacancyId: vac.id,
                    role: 'employer',
                  },
                })}
                activeOpacity={0.8}
              >
                <Text style={s.rateBtnTxt}>⭐ Оценить</Text>
              </TouchableOpacity>
            ) : like.shiftCompleted && like.employerRated ? (
              <View style={s.waitBtn}><Text style={s.waitBtnTxt}>✓ Оценка оставлена</Text></View>
            ) : null}
          </View>
        </View>
      );
    }

    // Pending applicant card
    const displayName = worker
      ? `${worker.firstName} ${worker.lastName}`.trim() || 'Работник'
      : 'Работник';
    return (
      <View style={s.card}>
        <MatchStatus like={like} isWorker={false} />

        <TouchableOpacity
          style={s.workerRow}
          onPress={() => worker
            ? router.push({ pathname: '/user-profile', params: { userId: worker.id } })
            : null}
          activeOpacity={0.8}
        >
          {worker?.avatarUrl ? (
            <Image source={{ uri: worker.avatarUrl }} style={s.avatar} contentFit="cover" transition={150} />
          ) : (
            <View style={[s.avatar, { backgroundColor: workerColor, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={s.avatarTxt}>{getInitials(displayName)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.workerName}>{displayName}</Text>
            {worker?.age ? <Text style={s.profileSub}>{worker.age} лет</Text> : null}
            {worker?.metroStation ? <Text style={s.profileSub}>🚇 {worker.metroStation}</Text> : null}
            {!worker ? <Text style={s.profileSub}>Загрузка...</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={s.hiddenPhone}><Text style={s.hiddenPhoneTxt}>●●● ●●●</Text></View>
            {worker ? <Text style={s.profileArrow}>Профиль ›</Text> : null}
          </View>
        </TouchableOpacity>

        <Text style={s.vacLabel}>{vac.title} · {formatDate(vac.date)}</Text>

        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.rejectBtn, isDLoading && { opacity: 0.5 }]}
            onPress={() => dismiss(like)}
            disabled={!!actionLoading}
            activeOpacity={0.8}
          >
            {isDLoading
              ? <ActivityIndicator size="small" color={Colors.red} />
              : <Text style={s.rejectBtnTxt}>✕ Не подходит</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.acceptBtn, isLoading && { opacity: 0.5 }]}
            onPress={() => approve(like)}
            disabled={!!actionLoading}
            activeOpacity={0.8}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.acceptBtnTxt}>✅ Подходит!</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={s.title}>Мэтчи</Text>
        {needsConfirm > 0 ? (
          <View style={s.urgentBadge}>
            <Text style={s.urgentBadgeTxt}>⏰ {needsConfirm} ждут</Text>
          </View>
        ) : null}
        <NotifBell />
        <NotificationBell />
      </View>

      <View style={s.tabStrip}>
        {([
          { key: 'pending',   label: 'Отклики',    count: pending.length },
          { key: 'matched',   label: 'Мэтчи',      count: matched.length },
          { key: 'completed', label: 'Завершённые', count: completed.length },
        ] as const).map(t => (
          <TouchableOpacity
            key={t.key}
            style={s.tabItem}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabLabel, tab === t.key && s.tabLabelActive]}>
              {t.label}{t.count > 0 ? ` (${t.count})` : ''}
            </Text>
            {tab === t.key ? <View style={s.tabUnderline} /> : null}
          </TouchableOpacity>
        ))}
      </View>

      {shown.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 48 }}>{tab === 'pending' ? '📥' : tab === 'matched' ? '🤝' : '🏁'}</Text>
          <Text style={s.emptyTitle}>
            {tab === 'pending' ? 'Нет откликов' : tab === 'matched' ? 'Нет активных мэтчей' : 'Нет завершённых смен'}
          </Text>
          <Text style={s.emptySub}>
            {tab === 'pending'
              ? 'Когда работники откликнутся — они появятся здесь'
              : tab === 'matched'
              ? 'Мэтчи появятся после взаимного подтверждения'
              : 'Здесь будет история завершённых смен'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={l => l.id}
          contentContainerStyle={[s.list, { paddingBottom: tabBarHeight + 16 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}

export default function MatchesScreen() {
  const { currentUser } = useApp();
  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
  return currentUser.role === 'worker' ? <WorkerMatches /> : <EmployerMatches />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  urgentBadge: {
    backgroundColor: '#FEF3C7', borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#F59E0B',
  },
  urgentBadgeTxt: { color: '#92400E', fontSize: 12, fontWeight: '700' },
  tabStrip: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 14, fontWeight: '500', color: Colors.textMuted },
  tabLabelActive: { fontWeight: '700', color: Colors.textPrimary },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: '20%', right: '20%',
    height: 2, backgroundColor: Colors.primary, borderRadius: 1,
  },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.bg, borderRadius: Radius.lg, padding: 16, ...Shadow.card, gap: 10 },
  matchedCard: { borderWidth: 1.5, borderColor: Colors.green },
  completedCard: { borderWidth: 1.5, borderColor: Colors.blue, opacity: 0.8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  statusTxt: { fontSize: 13, fontWeight: '700' },
  jobTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, lineHeight: 22 },
  subText: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // Profile row (worker sees employer)
  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 10,
  },
  profileAvatar: { width: 36, height: 36, borderRadius: 18 },
  profileAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  profileAvatarInitials: { color: '#fff', fontSize: 13, fontWeight: '700' },
  profileName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  profileSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  profileArrow: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  // Worker row (employer sees worker)
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  workerName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  phoneTag: {
    backgroundColor: Colors.primaryLight, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  phoneTxt: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  hiddenPhone: {
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  hiddenPhoneTxt: { color: Colors.textMuted, fontSize: 13 },
  vacLabel: { fontSize: 13, color: Colors.textMuted },
  // Action row
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.red,
    borderRadius: 100, paddingVertical: 11, alignItems: 'center',
  },
  rejectBtnTxt: { color: Colors.red, fontSize: 14, fontWeight: '600' },
  acceptBtn: {
    flex: 1, backgroundColor: Colors.primary,
    borderRadius: 100, paddingVertical: 11, alignItems: 'center',
  },
  acceptBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  chatBtn: {
    flex: 1, backgroundColor: Colors.blue,
    borderRadius: 100, paddingVertical: 11, alignItems: 'center',
  },
  chatBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  confirmBtn: {
    flex: 2, backgroundColor: Colors.green,
    borderRadius: 100, paddingVertical: 11, alignItems: 'center',
  },
  confirmBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rateBtn: {
    flex: 2, backgroundColor: '#FBBF24',
    borderRadius: 100, paddingVertical: 11, alignItems: 'center',
  },
  rateBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  waitBtn: {
    flex: 2, backgroundColor: Colors.surface,
    borderRadius: 100, paddingVertical: 11, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.inputBorder,
  },
  waitBtnTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  // Confirm banner
  confirmBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#F59E0B',
  },
  confirmBannerIcon: { fontSize: 22 },
  confirmBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  confirmBannerSub: { fontSize: 11, color: '#B45309', marginTop: 2 },
  confirmBannerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center',
  },
  confirmBannerBtnTxt: { fontSize: 16, color: '#fff', fontWeight: '700' },
  // Confirmation dialog
  dialogOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  dialogCard: {
    backgroundColor: Colors.bg, borderRadius: Radius.xl,
    padding: 24, width: '100%', gap: 12,
  },
  dialogTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  dialogBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  dialogBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dialogCancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder,
    borderRadius: 100, paddingVertical: 12, alignItems: 'center',
  },
  dialogCancelTxt: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  dialogConfirmBtn: {
    flex: 1, backgroundColor: Colors.green,
    borderRadius: 100, paddingVertical: 12, alignItems: 'center',
  },
  dialogConfirmTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // Empty
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingBottom: 80,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
