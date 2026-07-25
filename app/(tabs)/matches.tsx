import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { Like, Vacancy, PermApplication, PermVacancy, Chat } from '@/constants/types';
import { formatDate, getInitials, nameColorFromString } from '@/services/storage';
import {
  dbUpsertLike, dbCheckAndCreateMatch, dbConfirmShift, dbCancelShift,
  dbSetPermApplicationStatus, dbCreateChat,
} from '@/services/db';
import { TabHeader } from '@/components/ui/TabHeader';
import {
  notifyWorkerShiftConfirmedByEmployer,
  notifyWorkerShiftCancelled,
  notifyWorkerGotMatch,
  notifyWorkerPermApplicationApproved,
  notifyWorkerPermApplicationRejected,
} from '@/services/notifications';
import { Chip } from '@/components/ui/Chip';
import { VacancyDetailModal } from '@/components/feature/VacancyDetailModal';

// ─── Status badge ─────────────────────────────────────────────────────────────
function MatchStatus({ like, isWorker }: { like: Like; isWorker: boolean }) {
  if (like.cancelled) {
    return (
      <View style={[s.statusBadge, { backgroundColor: '#FEE2E2' }]}>
        <Ionicons name="close-circle" size={14} color={Colors.red} />
        <Text style={[s.statusTxt, { color: Colors.red }]}>Смена отменена</Text>
      </View>
    );
  }
  if (like.shiftCompleted) {
    return (
      <View style={[s.statusBadge, { backgroundColor: '#D1FAE5' }]}>
        <Ionicons name="checkmark-circle" size={14} color={Colors.green} />
        <Text style={[s.statusTxt, { color: Colors.green }]}>Смена завершена</Text>
      </View>
    );
  }
  if (like.isMatch) {
    if (isWorker) {
      if (like.shiftCompleted && !like.workerRated)
        return (
          <View style={[s.statusBadge, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="star" size={14} color="#92400E" />
            <Text style={[s.statusTxt, { color: '#92400E' }]}>Оставьте отзыв о работодателе!</Text>
          </View>
        );
    } else {
      if (!like.employerConfirmed)
        return (
          <View style={[s.statusBadge, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="time-outline" size={14} color={Colors.primary} />
            <Text style={[s.statusTxt, { color: Colors.primary }]}>Подтвердите смену</Text>
          </View>
        );
      if (like.employerConfirmed && !like.employerRated)
        return (
          <View style={[s.statusBadge, { backgroundColor: '#FFF7ED' }]}>
            <Ionicons name="star" size={14} color="#92400E" />
            <Text style={[s.statusTxt, { color: '#92400E' }]}>Оцените работника!</Text>
          </View>
        );
    }
    return (
      <View style={[s.statusBadge, { backgroundColor: Colors.primaryLight }]}>
        <Ionicons name="heart" size={14} color={Colors.primary} />
        <Text style={[s.statusTxt, { color: Colors.primary }]}>Мэтч!</Text>
      </View>
    );
  }
  if (like.employerLiked === false) {
    return (
      <View style={[s.statusBadge, { backgroundColor: '#FEE2E2' }]}>
        <Ionicons name="close-circle" size={14} color={Colors.red} />
        <Text style={[s.statusTxt, { color: Colors.red }]}>Отказ</Text>
      </View>
    );
  }
  return (
    <View style={[s.statusBadge, { backgroundColor: Colors.surface }]}>
      <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
      <Text style={[s.statusTxt, { color: Colors.textMuted }]}>На рассмотрении</Text>
    </View>
  );
}

// ─── Confirm shift banner (employer only) with confirmation dialog ─────────────
function ConfirmBanner({ onConfirm, onCancelShift, loading }: {
  onConfirm: () => void;
  onCancelShift: () => void;
  loading: boolean;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  return (
    <>
      <View style={s.confirmBanner}>
        <Ionicons name="time-outline" size={22} color="#92400E" />
        <View style={{ flex: 1 }}>
          <Text style={s.confirmBannerTitle}>Подтвердите смену</Text>
          <Text style={s.confirmBannerSub}>Смена состоялась — подтвердите, или отмените, если сорвалась</Text>
        </View>
        <TouchableOpacity
          style={s.cancelBannerBtn}
          onPress={() => setShowCancel(true)}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={18} color={Colors.red} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.confirmBannerBtn}
          onPress={() => setShowDialog(true)}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark" size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>

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
                <Text style={s.dialogCancelTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.dialogConfirmBtn}
                onPress={() => { setShowDialog(false); onConfirm(); }}
                activeOpacity={0.8}
              >
                <Text style={s.dialogConfirmTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Подтвердить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {showCancel ? (
        <View style={s.dialogOverlay}>
          <View style={s.dialogCard}>
            <Text style={s.dialogTitle}>Отменить смену?</Text>
            <Text style={s.dialogBody}>
              Смена уйдёт в «Завершённые» со статусом «Отменена». Работник получит
              уведомление об отмене. Оценивать никого не нужно.
            </Text>
            <View style={s.dialogBtns}>
              <TouchableOpacity
                style={s.dialogCancelBtn}
                onPress={() => setShowCancel(false)}
                activeOpacity={0.8}
              >
                <Text style={s.dialogCancelTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Назад</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.dialogDangerBtn}
                onPress={() => { setShowCancel(false); onCancelShift(); }}
                activeOpacity={0.8}
              >
                <Text style={s.dialogConfirmTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Отменить</Text>
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
  const { currentUser, likes, vacancies, users, chats, refreshAll, showToast } = useApp();
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

  const activeItems = myLikes.filter(l => !l.shiftCompleted && !l.cancelled && l.employerLiked !== false);
  const rejectedItems = myLikes.filter(l => l.employerLiked === false);
  const completedItems = myLikes.filter(l => l.shiftCompleted || l.cancelled);

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
    const isCancelled = like.cancelled;
    const isFinished = isCompleted || isCancelled;
    const canRate = isCompleted && !like.workerRated;

    return (
      <View style={[s.card, isMatch && !isFinished && s.matchedCard, isFinished && s.completedCard]}>
        <MatchStatus like={like} isWorker={true} />

        {/* Что карточку можно раскрыть, по одному заголовку не догадаться —
            справа стоит явная кнопка, нажимается по-прежнему весь блок */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => setDetailVacancy(vac)} style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.jobTitle}>{vac.title}</Text>
            <View style={s.metroRow}>
              <Text style={s.subText}>{vac.company}</Text>
              <Text style={s.subText}> · </Text>
              <Ionicons name="subway-outline" size={13} color={Colors.textMuted} />
              <Text style={s.subText}> {vac.metroStation}</Text>
            </View>
          </View>
          <View style={s.detailsBtn}>
            <Text style={s.detailsBtnTxt}>Подробнее</Text>
            <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
          </View>
        </TouchableOpacity>

        <View style={s.chipsRow}>
          <Chip label={formatDate(vac.date)} variant="date" icon="calendar-outline" />
          <Chip label={`${vac.timeStart}–${vac.timeEnd}`} variant="time" icon="time-outline" />
        </View>

        {/* Адрес — то, ради чего иначе приходится открывать карточку смены */}
        {vac.address ? (
          <View style={s.addressRow}>
            <Ionicons name="location-outline" size={14} color="#92400E" style={{ marginTop: 1 }} />
            <Text style={s.addressTxt}>{vac.address}</Text>
          </View>
        ) : null}

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
                <View style={s.ratingRow}>
                  <Ionicons name="star" size={12} color="#FBBF24" />
                  <Text style={s.profileSub}> {(employer.avgRating ?? 0).toFixed(1)} ({employer.ratingCount} отз.)</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.profileArrow}>Профиль ›</Text>
          </TouchableOpacity>
        ) : null}

        {isMatch ? (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.chatBtn}
              onPress={() => {
                const c = chats.find(c => c.vacancyId === like.vacancyId && c.workerId === currentUser.id);
                if (c) router.push({ pathname: '/chat-room', params: { chatId: c.id } });
                else router.push({ pathname: '/(tabs)/chats' });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={15} color="#fff" />
              <Text style={s.chatBtnTxt}>Чат</Text>
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
                <Ionicons name="star-outline" size={15} color="#fff" />
                <Text style={s.rateBtnTxt}>Оставить отзыв</Text>
              </TouchableOpacity>
            ) : isCompleted && like.workerRated ? (
              <View style={s.waitBtn}>
                <Ionicons name="checkmark" size={14} color={Colors.textMuted} />
                <Text style={s.waitBtnTxt}>Отзыв оставлен</Text>
              </View>
            ) : isCancelled ? (
              <View style={s.waitBtn}>
                <Ionicons name="close-circle-outline" size={14} color={Colors.red} />
                <Text style={[s.waitBtnTxt, { color: Colors.red }]}>Смена отменена</Text>
              </View>
            ) : !isFinished ? (
              <View style={s.waitBtn}>
                <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                <Text style={s.waitBtnTxt}>Ждём подтверждения</Text>
              </View>
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

  const emptyIcon: Record<typeof tab, React.ComponentProps<typeof Ionicons>['name']> = {
    active: 'clipboard-outline',
    rejected: 'happy-outline',
    completed: 'flag-outline',
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <TabHeader title="Мои отклики" />

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
          <Ionicons name={emptyIcon[tab]} size={56} color={Colors.textMuted} />
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
type EmployerMatchItem = { kind: 'like'; like: Like } | { kind: 'permApp'; app: PermApplication };

function EmployerMatches() {
  const router = useRouter();
  const {
    currentUser, likes, vacancies, users, chats, refreshAll, showToast,
    permApplications, permVacancies, refreshPermApplications, refreshChats,
  } = useApp();
  const [actionLoading, setLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'matched' | 'completed'>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();
  const tabTouched = useRef(false);
  const autoSwitched = useRef(false);

  // Если новых откликов нет, а одобренные кандидаты есть — открываем сразу «Мэтчи»,
  // иначе директор видит пустые «Отклики» и думает, что кандидатов нет вовсе
  useEffect(() => {
    if (!currentUser || tabTouched.current || autoSwitched.current) return;
    const myIds = vacancies.filter((v: Vacancy) => v.employerId === currentUser.id).map((v: Vacancy) => v.id);
    const myLikes = likes.filter((l: Like) => myIds.includes(l.vacancyId) && l.workerLiked);
    const pendingCount =
      myLikes.filter((l: Like) => !l.isMatch && l.employerLiked !== false).length +
      permApplications.filter((a: PermApplication) => a.employerId === currentUser.id && a.status === 'pending').length;
    const matchedCount =
      myLikes.filter((l: Like) => l.isMatch && !l.shiftCompleted).length +
      permApplications.filter((a: PermApplication) => a.employerId === currentUser.id && a.status === 'approved').length;
    if (pendingCount === 0 && matchedCount > 0) {
      autoSwitched.current = true;
      setTab('matched');
    }
  }, [likes, permApplications, vacancies, currentUser]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  const myVacIds = vacancies.filter(v => v.employerId === currentUser.id).map(v => v.id);
  const allLikes = likes.filter(l => myVacIds.includes(l.vacancyId) && l.workerLiked);

  const pending = allLikes.filter(l => !l.isMatch && l.employerLiked !== false);
  const matched = allLikes.filter(l => l.isMatch && !l.shiftCompleted && !l.cancelled);
  const completed = allLikes.filter(l => l.isMatch && (l.shiftCompleted || l.cancelled));

  // Отклики на постоянные вакансии — тоже сюда, а не только на карточку вакансии
  const myPermApps: PermApplication[] = permApplications.filter((a: PermApplication) => a.employerId === currentUser.id);
  const permPending = myPermApps.filter(a => a.status === 'pending');
  const permApproved = myPermApps.filter(a => a.status === 'approved');

  const needsConfirm = matched.filter(l => !l.employerConfirmed).length;
  const shown: EmployerMatchItem[] =
    tab === 'pending'
      ? [
          ...permPending.map(app => ({ kind: 'permApp' as const, app })),
          ...pending.map((like: Like) => ({ kind: 'like' as const, like })),
        ]
      : tab === 'matched'
      ? [
          ...permApproved.map(app => ({ kind: 'permApp' as const, app })),
          ...matched.map((like: Like) => ({ kind: 'like' as const, like })),
        ]
      : completed.map((like: Like) => ({ kind: 'like' as const, like }));

  const getVacancy = (id: string) => vacancies.find(v => v.id === id);
  const getWorker = (id: string) => users.find(u => u.id === id);

  const approve = async (like: Like) => {
    setLoading(like.id);
    try {
      const vac = getVacancy(like.vacancyId);
      const worker = getWorker(like.workerId);
      const workerName = worker ? `${worker.firstName} ${worker.lastName}` : 'Работник';

      await dbUpsertLike(like.vacancyId, like.workerId, currentUser.id, { employerLiked: true });

      let result: { matched: boolean; chatId?: string } = { matched: false };
      result = await dbCheckAndCreateMatch(like.vacancyId, like.workerId);
      if (!result.matched && !result.chatId) {
        await new Promise(r => setTimeout(r, 400));
        result = await dbCheckAndCreateMatch(like.vacancyId, like.workerId);
      }

      refreshAll().catch(() => {});

      if (result.matched) {
        notifyWorkerGotMatch(like.workerId, vac?.company ?? currentUser.company ?? '', vac?.title ?? '').catch(() => {});
      }
      if (result.matched || result.chatId) {
        showToast(`Мэтч с ${workerName}!`, 'success');
        router.push({ pathname: '/chat-room', params: { chatId: result.chatId } });
      } else {
        showToast('Подтверждено — ждём создания чата', 'info');
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

      if (worker && vac) {
        notifyWorkerShiftConfirmedByEmployer(worker.id, company, vac.title).catch(() => {});
      }

      showToast('Смена подтверждена! Оцените работника', 'success');

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

  const cancelShift = async (like: Like) => {
    const key = like.id + '_shift';
    setLoading(key);
    try {
      await dbCancelShift(like.id);
      refreshAll().catch(() => {});
      const worker = getWorker(like.workerId);
      const vac = getVacancy(like.vacancyId);
      const company = currentUser.company ?? `${currentUser.firstName} ${currentUser.lastName}`;
      if (worker && vac) {
        notifyWorkerShiftCancelled(worker.id, company, vac.title).catch(() => {});
      }
      showToast('Смена отменена', 'success');
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setLoading(null);
    }
  };

  const approvePermApp = async (app: PermApplication) => {
    const vacancy = permVacancies.find((v: PermVacancy) => v.id === app.vacancyId);
    if (!vacancy) return;
    setLoading(app.id);
    try {
      await dbSetPermApplicationStatus(app.id, 'approved');
      notifyWorkerPermApplicationApproved(app.workerId, vacancy.company, vacancy.title).catch(() => {});
      const chatId = await dbCreateChat(
        app.workerId,
        currentUser.id,
        app.vacancyId,
        vacancy.title,
        vacancy.company,
        `🎉 Поздравляем! Вы одобрены на вакансию «${vacancy.title}». Свяжитесь с кандидатом для уточнения деталей.`,
        1,
        0,
      );
      await refreshPermApplications();
      await refreshChats(currentUser);
      showToast('Одобрено! Чат открыт 🎉', 'match');
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setLoading(null);
    }
  };

  const rejectPermApp = async (app: PermApplication) => {
    const vacancy = permVacancies.find((v: PermVacancy) => v.id === app.vacancyId);
    setLoading(app.id + '_d');
    try {
      await dbSetPermApplicationStatus(app.id, 'rejected');
      if (vacancy) {
        notifyWorkerPermApplicationRejected(app.workerId, vacancy.company, vacancy.title).catch(() => {});
      }
      await refreshPermApplications();
      showToast('Отклонено', 'success');
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setLoading(null);
    }
  };

  const renderPermApp = (app: PermApplication) => {
    const vacancy = permVacancies.find((v: PermVacancy) => v.id === app.vacancyId);
    const worker = getWorker(app.workerId);
    const workerName = worker
      ? `${worker.firstName} ${worker.lastName}`.trim() || 'Работник'
      : 'Работник';
    const workerColor = nameColorFromString(worker?.id ?? app.workerId);
    const isLoading = actionLoading === app.id;
    const isDLoading = actionLoading === app.id + '_d';
    const isApproved = app.status === 'approved';

    return (
      <View style={[s.card, isApproved && s.matchedCard]}>
        <View style={[s.statusBadge, { backgroundColor: isApproved ? '#D1FAE5' : '#EEF2FF' }]}>
          <Ionicons
            name={isApproved ? 'checkmark-circle' : 'briefcase-outline'}
            size={14}
            color={isApproved ? Colors.green : '#4F46E5'}
          />
          <Text style={[s.statusTxt, { color: isApproved ? Colors.green : '#4F46E5' }]}>
            {isApproved ? 'Одобрен на вакансию' : 'Отклик на вакансию'}
          </Text>
        </View>

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
            {worker?.age ? <Text style={s.profileSub}>{worker.age} лет</Text> : null}
            {worker?.metroStation ? (
              <View style={s.metroRow}>
                <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
                <Text style={s.profileSub}> {worker.metroStation}</Text>
              </View>
            ) : null}
            {(worker?.avgRating ?? 0) > 0 ? (
              <View style={s.ratingRow}>
                <Ionicons name="star" size={12} color="#FBBF24" />
                <Text style={s.profileSub}> {(worker?.avgRating ?? 0).toFixed(1)} ({worker?.ratingCount} отз.)</Text>
              </View>
            ) : null}
            {!worker ? <Text style={s.profileSub}>Загрузка…</Text> : null}
          </View>
          {isApproved && worker?.phone ? (
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View style={s.phoneTag}><Text style={s.phoneTxt}>{worker.phone}</Text></View>
              <Text style={s.profileArrow}>Профиль ›</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {worker ? <Text style={s.profileArrow}>Профиль ›</Text> : null}
            </View>
          )}
        </TouchableOpacity>

        <Text style={s.vacLabel}>{vacancy?.title ?? 'Вакансия'} · Постоянная работа</Text>

        {isApproved ? (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={s.chatBtn}
              onPress={() => {
                const c = chats.find((c: Chat) => c.vacancyId === app.vacancyId && c.workerId === app.workerId);
                if (c) router.push({ pathname: '/chat-room', params: { chatId: c.id } });
                else router.push({ pathname: '/(tabs)/chats' });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={15} color="#fff" />
              <Text style={s.chatBtnTxt}>Чат</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.rejectBtn, isDLoading && { opacity: 0.5 }]}
              onPress={() => rejectPermApp(app)}
              disabled={!!actionLoading}
              activeOpacity={0.8}
            >
              {isDLoading
                ? <ActivityIndicator size="small" color={Colors.red} />
                : (
                  <>
                    <Ionicons name="close" size={15} color={Colors.red} />
                    <Text style={s.rejectBtnTxt}>Не подходит</Text>
                  </>
                )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.acceptBtn, isLoading && { opacity: 0.5 }]}
              onPress={() => approvePermApp(app)}
              disabled={!!actionLoading}
              activeOpacity={0.8}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                    <Text style={s.acceptBtnTxt}>Подходит!</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderLike = (like: Like) => {
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
        <View style={[s.card, (like.shiftCompleted || like.cancelled) ? s.completedCard : s.matchedCard]}>
          <MatchStatus like={like} isWorker={false} />

          {!like.shiftCompleted && !like.cancelled && !like.employerConfirmed ? (
            <ConfirmBanner
              onConfirm={() => confirmShift(like)}
              onCancelShift={() => cancelShift(like)}
              loading={isShiftLoading}
            />
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
                <View style={s.metroRow}>
                  <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
                  <Text style={s.profileSub}> {worker.metroStation}</Text>
                </View>
              ) : null}
              {(worker?.avgRating ?? 0) > 0 ? (
                <View style={s.ratingRow}>
                  <Ionicons name="star" size={12} color="#FBBF24" />
                  <Text style={s.profileSub}> {(worker?.avgRating ?? 0).toFixed(1)} ({worker?.ratingCount} отз.)</Text>
                </View>
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
              onPress={() => {
                const c = chats.find(c => c.vacancyId === like.vacancyId && c.workerId === like.workerId);
                if (c) router.push({ pathname: '/chat-room', params: { chatId: c.id } });
                else router.push({ pathname: '/(tabs)/chats' });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={15} color="#fff" />
              <Text style={s.chatBtnTxt}>Чат</Text>
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
                <Ionicons name="star-outline" size={15} color="#fff" />
                <Text style={s.rateBtnTxt}>Оценить</Text>
              </TouchableOpacity>
            ) : like.shiftCompleted && like.employerRated ? (
              <View style={s.waitBtn}>
                <Ionicons name="checkmark" size={14} color={Colors.textMuted} />
                <Text style={s.waitBtnTxt}>Оценка оставлена</Text>
              </View>
            ) : null}
          </View>
        </View>
      );
    }

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
            {worker?.metroStation ? (
              <View style={s.metroRow}>
                <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
                <Text style={s.profileSub}> {worker.metroStation}</Text>
              </View>
            ) : null}
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
              : (
                <>
                  <Ionicons name="close" size={15} color={Colors.red} />
                  <Text style={s.rejectBtnTxt}>Не подходит</Text>
                </>
              )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.acceptBtn, isLoading && { opacity: 0.5 }]}
            onPress={() => approve(like)}
            disabled={!!actionLoading}
            activeOpacity={0.8}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                  <Text style={s.acceptBtnTxt}>Подходит!</Text>
                </>
              )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: EmployerMatchItem }) =>
    item.kind === 'permApp' ? renderPermApp(item.app) : renderLike(item.like);

  const emptyIcon: Record<typeof tab, React.ComponentProps<typeof Ionicons>['name']> = {
    pending: 'inbox-outline',
    matched: 'people-outline',
    completed: 'flag-outline',
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <TabHeader
        title="Мэтчи"
        badge={needsConfirm > 0 ? (
          <View style={s.urgentBadge}>
            <Ionicons name="time-outline" size={13} color="#92400E" />
            <Text style={s.urgentBadgeTxt}>{needsConfirm} ждут</Text>
          </View>
        ) : null}
      />

      <View style={s.tabStrip}>
        {([
          { key: 'pending',   label: 'Отклики',    count: permPending.length + pending.length },
          { key: 'matched',   label: 'Мэтчи',      count: permApproved.length + matched.length },
          { key: 'completed', label: 'Завершённые', count: completed.length },
        ] as const).map(t => (
          <TouchableOpacity
            key={t.key}
            style={s.tabItem}
            onPress={() => { tabTouched.current = true; setTab(t.key); }}
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
          <Ionicons name={emptyIcon[tab]} size={56} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>
            {tab === 'pending' ? 'Нет откликов' : tab === 'matched' ? 'Нет активных мэтчей' : 'Нет завершённых смен'}
          </Text>
          <Text style={s.emptySub}>
            {tab === 'pending'
              ? (permApproved.length + matched.length > 0
                  ? 'Новых откликов нет. Одобренные кандидаты — во вкладке «Мэтчи»'
                  : 'Когда работники откликнутся — они появятся здесь')
              : tab === 'matched'
              ? 'Мэтчи появятся после взаимного подтверждения'
              : 'Здесь будет история завершённых смен'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={item => item.kind === 'permApp' ? item.app.id : item.like.id}
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
    flexDirection: 'row', alignItems: 'center', gap: 4,
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
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
  },
  statusTxt: { fontSize: 13, fontWeight: '700' },
  jobTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, lineHeight: 22 },
  subText: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  metroRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1, borderColor: Colors.primaryBorder,
    borderRadius: 100, paddingLeft: 12, paddingRight: 9, paddingVertical: 7,
    marginTop: 2,
  },
  detailsBtnTxt: { fontSize: 12.5, fontWeight: '700', color: Colors.primary },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#FFFBEB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  addressTxt: { flex: 1, fontSize: 12.5, color: '#92400E', lineHeight: 17 },
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
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1.5, borderColor: Colors.red,
    borderRadius: 100, paddingVertical: 11,
  },
  rejectBtnTxt: { color: Colors.red, fontSize: 14, fontWeight: '600' },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: Colors.primary,
    borderRadius: 100, paddingVertical: 11,
  },
  acceptBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  chatBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.blue,
    borderRadius: 100, paddingVertical: 11,
  },
  chatBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rateBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#FBBF24',
    borderRadius: 100, paddingVertical: 11,
  },
  rateBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  waitBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: Colors.surface,
    borderRadius: 100, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.inputBorder,
  },
  waitBtnTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  confirmBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#F59E0B',
  },
  confirmBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  confirmBannerSub: { fontSize: 11, color: '#B45309', marginTop: 2 },
  confirmBannerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center',
  },
  cancelBannerBtn: {
    width: 36, height: 36, borderRadius: 18, marginRight: 8,
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA',
    alignItems: 'center', justifyContent: 'center',
  },
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
  // Кнопкам нужны боковые поля и центрирование по обеим осям: без них
  // длинная подпись («Отменить смену») вылезала за пределы овала.
  dialogCancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder,
    borderRadius: 100, paddingVertical: 12, paddingHorizontal: 10,
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  dialogCancelTxt: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
  dialogConfirmBtn: {
    flex: 1, backgroundColor: Colors.green,
    borderRadius: 100, paddingVertical: 12, paddingHorizontal: 10,
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  dialogConfirmTxt: { fontSize: 14, fontWeight: '700', color: '#fff', textAlign: 'center' },
  dialogDangerBtn: {
    flex: 1, backgroundColor: Colors.red,
    borderRadius: 100, paddingVertical: 12, paddingHorizontal: 10,
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingBottom: 80,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySub: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});
