/**
 * Permanent vacancy detail screen
 * Shows full info, employer contact (phone only after match), apply/save actions
 */
import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { normalizeCompany } from '@/services/storage';
import { LavkaLogo } from '@/components/ui/LavkaLogo';
import {
  dbApplyPermVacancy,
  dbAddPermSaved,
  dbRemovePermSaved,
  dbGetPermVacancies,
} from '@/services/db';
import { METRO_LINES } from '@/constants/metro';
import { notifyEmployerNewPermApplicant } from '@/services/notifications';

export default function PermVacancyDetailScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { vacancyId } = useLocalSearchParams<{ vacancyId: string }>();
  const {
    currentUser, loading, users, permVacancies, permApplications,
    permSavedIds, optimisticAddPermSaved, optimisticRemovePermSaved,
    refreshPermApplications, refreshPermSaved,
    showToast,
  } = useApp();

  const [applying, setApplying] = useState(false);
  const [authModalDismissed, setAuthModalDismissed] = useState(Platform.OS === 'web');
  const [guestVacancy, setGuestVacancy] = useState<any>(null);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const openInApp = () => {
    if (Platform.OS !== 'web' || !vacancyId) return;
    window.location.href = `onspaceapp://perm-vacancy-detail?vacancyId=${vacancyId}`;
  };

  const isGuest = !currentUser && !loading;
  const showAuthModal = isGuest && !authModalDismissed;

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace('/');
    }
  };

  const vacancy = permVacancies.find(v => v.id === vacancyId) ?? guestVacancy;

  useEffect(() => {
    if (!vacancyId || vacancy || currentUser || loading) return;
    dbGetPermVacancies().then(list => {
      const found = list.find((v: any) => v.id === vacancyId);
      if (found) setGuestVacancy(found);
    }).catch(() => {});
  }, [vacancyId, vacancy, currentUser, loading]);
  const employer = vacancy ? users.find(u => u.id === vacancy.employerId) : null;

  const employerDisplayName = normalizeCompany();


  const myApp = useMemo(() => {
    if (!currentUser || !vacancy) return null;
    return permApplications.find(a => a.vacancyId === vacancy.id && a.workerId === currentUser.id) ?? null;
  }, [permApplications, currentUser, vacancy]);

  const isApplied = !!myApp;
  const isApproved = myApp?.status === 'approved';
  const isSaved = vacancy ? permSavedIds.includes(vacancy.id) : false;

  const metroLine = vacancy?.metroStation
    ? METRO_LINES.find(l => l.stations.includes(vacancy.metroStation!)) ?? null
    : null;

  const authModalJSX = (
    <Modal statusBarTranslucent navigationBarTranslucent
      visible={showAuthModal}
      transparent
      animationType="slide"
      onRequestClose={() => setAuthModalDismissed(true)}
    >
      <View style={styles.authOverlay}>
        <View style={styles.authSheet}>
          <TouchableOpacity
            style={styles.authClose}
            onPress={() => setAuthModalDismissed(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
          <Ionicons name="hand-left-outline" size={36} color={Colors.primary} style={{ marginBottom: 10, marginTop: 4 }} />
          <Text style={styles.authTitle}>Войдите, чтобы откликнуться</Text>
          <Text style={styles.authSub}>Зарегистрируйтесь или войдите — это бесплатно</Text>
          <TouchableOpacity style={styles.authBtnPrimary} onPress={() => router.push({ pathname: '/login', params: { returnTo: `perm-vacancy-detail?vacancyId=${vacancyId}` } })} activeOpacity={0.85}>
            <Text style={styles.authBtnPrimaryTxt}>Войти</Text>
          </TouchableOpacity>
          <View style={styles.authDivider}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerTxt}>или</Text>
            <View style={styles.authDividerLine} />
          </View>
          <TouchableOpacity style={styles.authBtnSecondary} onPress={() => router.push({ pathname: '/register-worker', params: { returnTo: `perm-vacancy-detail?vacancyId=${vacancyId}` } })} activeOpacity={0.85}>
            <Text style={styles.authBtnSecondaryTxt}>Ищу работу — Зарегистрироваться</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.authBtnSecondary, { marginTop: 8 }]} onPress={() => router.push('/register-employer')} activeOpacity={0.85}>
            <Text style={styles.authBtnSecondaryTxt}>Ищу сотрудников — Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const openAppBannerJSX = Platform.OS === 'web' && vacancyId ? (
    <TouchableOpacity onPress={openInApp} style={styles.openAppBanner} activeOpacity={0.85}>
      <Text style={styles.openAppBannerTxt}>Открыть в приложении</Text>
    </TouchableOpacity>
  ) : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backTxt}>← Назад</Text>
          </TouchableOpacity>
        </View>
        {openAppBannerJSX}
        <View style={styles.emptyCenter}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
        {authModalJSX}
      </SafeAreaView>
    );
  }

  if (!vacancy) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backTxt}>← Назад</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>
        {openAppBannerJSX}
        <View style={styles.emptyCenter}>
          <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Вакансия не найдена</Text>
        </View>
        {authModalJSX}
      </SafeAreaView>
    );
  }

  const applyTo = async () => {
    if (!currentUser || isApplied || applying) return;
    setApplying(true);
    try {
      await dbApplyPermVacancy(vacancy.id, currentUser.id, vacancy.employerId);
      await refreshPermApplications();
      notifyEmployerNewPermApplicant(
        vacancy.employerId,
        `${currentUser.firstName} ${currentUser.lastName}`,
        vacancy.title,
        currentUser.id,
        vacancy.id,
      ).catch(() => {});
      showToast('Отклик отправлен! 📨', 'success');
    } catch {
      showToast('Ошибка при отклике', 'error');
    } finally {
      setApplying(false);
    }
  };

  const toggleSave = async () => {
    if (!currentUser) return;
    if (isSaved) {
      optimisticRemovePermSaved(vacancy.id);
      dbRemovePermSaved(currentUser.id, vacancy.id).catch(() => {});
      showToast('Удалено из избранного', 'success');
    } else {
      optimisticAddPermSaved(vacancy.id);
      dbAddPermSaved(currentUser.id, vacancy.id).catch(() => {});
      showToast('Сохранено ❤️', 'success');
    }
  };

  const STATUS_MAP: Record<string, { label: string; icon: string; color: string; bg: string }> = {
    pending:  { label: 'На рассмотрении', icon: 'time-outline',             color: '#92400E', bg: '#FFF7ED' },
    approved: { label: 'Вы приглашены!',  icon: 'checkmark-circle-outline', color: Colors.green, bg: '#D1FAE5' },
    rejected: { label: 'Отказ',           icon: 'close-circle-outline',     color: Colors.red,   bg: '#FEE2E2' },
  };

  const appStatus = myApp ? STATUS_MAP[myApp.status] : null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backTxt}>← Назад</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {currentUser?.role === 'worker' ? (
          <TouchableOpacity
            onPress={toggleSave}
            style={styles.saveHeaderBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={24} color={isSaved ? Colors.red : Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {openAppBannerJSX}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        {/* Application status badge */}
        {appStatus ? (
          <View style={[styles.statusBadge, { backgroundColor: appStatus.bg, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <Ionicons name={appStatus.icon as any} size={14} color={appStatus.color} />
            <Text style={[styles.statusTxt, { color: appStatus.color }]}>{appStatus.label}</Text>
          </View>
        ) : null}

        {/* Title + company */}
        <Text style={styles.jobTitle}>{vacancy.title}</Text>
        <Text style={styles.companyName}>{employerDisplayName}</Text>

        {/* Key info cards */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Ionicons name="cash-outline" size={22} color={Colors.primary} />
            <Text style={styles.infoCardLabel}>Зарплата</Text>
            <Text style={styles.infoCardValue}>{vacancy.salary.toLocaleString('ru-RU')} ₽/мес</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="calendar-outline" size={22} color={Colors.primary} />
            <Text style={styles.infoCardLabel}>График</Text>
            <Text style={styles.infoCardValue}>{vacancy.schedule}</Text>
          </View>
        </View>

        {/* Location */}
        {(vacancy.metroStation || vacancy.address) ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
            <Ionicons name="location-outline" size={16} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>Расположение</Text>
          </View>
            {vacancy.metroStation ? (
              <View style={styles.locationRow}>
                {metroLine ? (
                  <View style={[styles.metroDot, { backgroundColor: metroLine.color }]} />
                ) : (
                  <Ionicons name="subway-outline" size={16} color={Colors.textMuted} style={{ marginTop: 1 }} />
                )}
                <View style={{ flex: 1 }}>
                  {metroLine ? (
                    <Text style={styles.metroLineName}>{metroLine.name}</Text>
                  ) : null}
                  <Text style={styles.locationValue}>{vacancy.metroStation}</Text>
                </View>
              </View>
            ) : null}
            {vacancy.address ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={16} color={Colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={[styles.locationValue, { flex: 1 }]}>{vacancy.address}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Description */}
        {vacancy.description ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="document-text-outline" size={16} color={Colors.textPrimary} />
              <Text style={styles.sectionTitle}>Описание вакансии</Text>
            </View>
            <Text style={styles.descText}>{vacancy.description}</Text>
          </View>
        ) : null}

        {/* Employer info */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="business-outline" size={16} color={Colors.textPrimary} />
            <Text style={styles.sectionTitle}>Работодатель</Text>
          </View>
          <View style={styles.employerCard}>
            <LavkaLogo size={48} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.employerName}>{employerDisplayName}</Text>
              {employer?.metroStation ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
                  <Text style={styles.employerMeta}>{employer.metroStation}</Text>
                </View>
              ) : null}
              {(employer?.avgRating ?? 0) > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.employerMeta}>
                    {(employer?.avgRating ?? 0).toFixed(1)} ({employer?.ratingCount} отз.)
                  </Text>
                </View>
              ) : null}
            </View>
            {employer ? (
              <TouchableOpacity
                style={styles.profileBtn}
                onPress={() => router.push({ pathname: '/user-profile', params: { userId: employer.id } })}
                activeOpacity={0.8}
              >
                <Text style={styles.profileBtnTxt}>Профиль →</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Phone — only if approved */}
          {isApproved && employer ? (
            <View style={styles.phoneReveal}>
              <View style={styles.phoneRevealLeft}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="call-outline" size={14} color={Colors.green} />
                  <Text style={styles.phoneRevealLabel}>Телефон работодателя</Text>
                </View>
                <Text style={styles.phoneRevealNumber}>{employer.phone}</Text>
              </View>
              <View style={styles.phoneUnlocked}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="checkmark-circle" size={14} color="#fff" />
                  <Text style={styles.phoneUnlockedTxt}>Открыт</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.phoneLocked}>
              <Ionicons name="lock-closed-outline" size={22} color={Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.phoneLockedTitle}>Телефон скрыт</Text>
                <Text style={styles.phoneLockedSub}>
                  {isApplied
                    ? 'Откроется после одобрения вашего отклика'
                    : 'Откликнитесь на вакансию, чтобы получить контакт'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Spacer for bottom buttons */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom action bar — worker only */}
      {currentUser?.role === 'worker' ? (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.saveBtn, isSaved && styles.saveBtnActive]}
            onPress={toggleSave}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={16} color={isSaved ? Colors.red : Colors.textSecondary} />
              <Text style={[styles.saveBtnTxt, isSaved && { color: Colors.red }]}>
                {isSaved ? 'Сохранено' : 'Сохранить'}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.applyBtn,
              isApplied && styles.applyBtnDone,
              applying && { opacity: 0.6 },
            ]}
            onPress={applyTo}
            disabled={isApplied || applying}
            activeOpacity={0.8}
          >
            {applying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isApplied ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark" size={16} color={Colors.green} />
                <Text style={[styles.applyBtnTxt, { color: Colors.green }]}>Отклик отправлен</Text>
              </View>
            ) : (
              <Text style={styles.applyBtnTxt}>Откликнуться</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {authModalJSX}

      {isGuest && Platform.OS === 'web' && (
        <View style={styles.guestBar}>
          <TouchableOpacity
            style={styles.guestBtnPrimary}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/login', params: { returnTo: `perm-vacancy-detail?vacancyId=${vacancyId}` } })}
          >
            <Text style={styles.guestBtnPrimaryTxt}>Войти</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.guestBtnSecondary}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/register-worker', params: { returnTo: `perm-vacancy-detail?vacancyId=${vacancyId}` } })}
          >
            <Text style={styles.guestBtnSecondaryTxt}>Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backTxt: { fontSize: 15, color: Colors.textSecondary, fontWeight: '500' },
  saveHeaderBtn: { padding: 4 },
  saveHeaderIcon: { fontSize: 24 },

  openAppBanner: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openAppBannerTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },

  body: { padding: 20, gap: 16 },

  statusBadge: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' },
  statusTxt: { fontSize: 13, fontWeight: '700' },

  jobTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, lineHeight: 32 },
  companyName: { fontSize: 14, color: Colors.textMuted, marginTop: -8 },

  infoGrid: { flexDirection: 'row', gap: 12 },
  infoCard: {
    flex: 1, backgroundColor: Colors.surface,
    borderRadius: Radius.md, padding: 14,
    alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.divider,
  },
  infoCardIcon: { fontSize: 22 },
  infoCardLabel: { fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  infoCardValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },

  section: { gap: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, padding: 12 },
  locationIcon: { fontSize: 16, marginTop: 1 },
  locationValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500', lineHeight: 20 },
  metroDot: { width: 14, height: 14, borderRadius: 7, marginTop: 3 },
  metroLineName: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },

  descText: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 22,
  },

  employerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
  },
  employerAvatar: { width: 48, height: 48, borderRadius: 24 },
  employerAvatarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  employerName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  employerMeta: { fontSize: 12, color: Colors.textMuted },
  profileBtn: {
    backgroundColor: Colors.primaryLight, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  profileBtnTxt: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  phoneReveal: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#D1FAE5', borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: Colors.green,
    gap: 12,
  },
  phoneRevealLeft: { flex: 1 },
  phoneRevealLabel: { fontSize: 12, color: Colors.green, fontWeight: '600' },
  phoneRevealNumber: { fontSize: 18, fontWeight: '800', color: '#065F46', marginTop: 2 },
  phoneUnlocked: { backgroundColor: Colors.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  phoneUnlockedTxt: { fontSize: 12, color: '#fff', fontWeight: '700' },

  phoneLocked: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: Colors.divider,
    opacity: 0.85,
  },
  phoneLockedIcon: { fontSize: 22 },
  phoneLockedTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  phoneLockedSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },

  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },

  bottomBar: {
    flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 24,
    borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.bg,
  },
  saveBtn: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.inputBorder,
    borderRadius: 100, paddingVertical: 14, alignItems: 'center',
  },
  saveBtnActive: { borderColor: Colors.red, backgroundColor: '#FFF5F5' },
  saveBtnTxt: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  applyBtn: {
    flex: 2, backgroundColor: '#7C3AED',
    borderRadius: 100, paddingVertical: 14, alignItems: 'center',
  },
  applyBtnDone: { backgroundColor: '#D1FAE5' },
  applyBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  guestBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  guestBtnPrimary: {
    flex: 1, backgroundColor: Colors.primary,
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  guestBtnPrimaryTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  guestBtnSecondary: {
    flex: 1, backgroundColor: Colors.primaryLight,
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
  },
  guestBtnSecondaryTxt: { color: Colors.primary, fontSize: 15, fontWeight: '600' },

  authOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  authSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
    alignItems: 'center', gap: 0,
  },
  authClose: {
    position: 'absolute', top: 16, right: 20,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  authCloseTxt: { fontSize: 14, color: Colors.textMuted },
  authEmoji: { fontSize: 36, marginBottom: 10, marginTop: 4 },
  authTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  authSub: {
    fontSize: 14, color: Colors.textMuted, textAlign: 'center',
    marginTop: 6, marginBottom: 20, lineHeight: 20,
  },
  authBtnPrimary: {
    width: '100%', backgroundColor: Colors.primary,
    borderRadius: 100, paddingVertical: 15, alignItems: 'center',
  },
  authBtnPrimaryTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  authDivider: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginVertical: 14, width: '100%',
  },
  authDividerLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  authDividerTxt: { fontSize: 13, color: Colors.textMuted },
  authBtnSecondary: {
    width: '100%', borderWidth: 1.5, borderColor: Colors.inputBorder,
    borderRadius: 100, paddingVertical: 14, alignItems: 'center',
    backgroundColor: Colors.bg,
  },
  authBtnSecondaryTxt: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
});
