/**
 * Permanent vacancy detail screen
 * Shows full info, employer contact (phone only after match), apply/save actions
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { getInitials, nameColorFromString } from '@/services/storage';
import {
  dbApplyPermVacancy,
  dbAddPermSaved,
  dbRemovePermSaved,
} from '@/services/db';
import { METRO_LINES } from '@/constants/metro';

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
  const [authModalDismissed, setAuthModalDismissed] = useState(false);

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

  const vacancy = permVacancies.find(v => v.id === vacancyId);
  const employer = vacancy ? users.find(u => u.id === vacancy.employerId) : null;

  const employerDisplayName = vacancy?.company?.trim()
    ? vacancy.company
    : employer
      ? `${employer.firstName ?? ''} ${employer.lastName ?? ''}`.trim() || 'Работодатель'
      : 'Работодатель';

  const employerColor = employer ? nameColorFromString(employer.id) : Colors.primary;
  const employerInitials = getInitials(employerDisplayName);

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
    <Modal
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
            <Text style={styles.authCloseTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.authEmoji}>👋</Text>
          <Text style={styles.authTitle}>Войдите, чтобы откликнуться</Text>
          <Text style={styles.authSub}>Зарегистрируйтесь или войдите — это бесплатно</Text>
          <TouchableOpacity style={styles.authBtnPrimary} onPress={() => router.push('/login')} activeOpacity={0.85}>
            <Text style={styles.authBtnPrimaryTxt}>Войти</Text>
          </TouchableOpacity>
          <View style={styles.authDivider}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerTxt}>или</Text>
            <View style={styles.authDividerLine} />
          </View>
          <TouchableOpacity style={styles.authBtnSecondary} onPress={() => router.push('/register-worker')} activeOpacity={0.85}>
            <Text style={styles.authBtnSecondaryTxt}>Ищу работу — Зарегистрироваться</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.authBtnSecondary, { marginTop: 8 }]} onPress={() => router.push('/register-employer')} activeOpacity={0.85}>
            <Text style={styles.authBtnSecondaryTxt}>Ищу сотрудников — Зарегистрироваться</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.backTxt}>← Назад</Text>
          </TouchableOpacity>
        </View>
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
        <View style={styles.emptyCenter}>
          <Text style={{ fontSize: 48 }}>🔍</Text>
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

  const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
    pending:  { label: '⏳ На рассмотрении', color: '#92400E', bg: '#FFF7ED' },
    approved: { label: '✅ Вы приглашены!',  color: Colors.green, bg: '#D1FAE5' },
    rejected: { label: '✕ Отказ',           color: Colors.red,   bg: '#FEE2E2' },
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
            <Text style={styles.saveHeaderIcon}>{isSaved ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {Platform.OS === 'web' && vacancyId && (
        <TouchableOpacity onPress={openInApp} style={styles.openAppBanner} activeOpacity={0.85}>
          <Text style={styles.openAppBannerTxt}>📱 Открыть в приложении</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        {/* Application status badge */}
        {appStatus ? (
          <View style={[styles.statusBadge, { backgroundColor: appStatus.bg }]}>
            <Text style={[styles.statusTxt, { color: appStatus.color }]}>{appStatus.label}</Text>
          </View>
        ) : null}

        {/* Permanent badge */}
        <View style={styles.permBadge}>
          <Text style={styles.permBadgeTxt}>💼 Постоянная работа</Text>
        </View>

        {/* Title + company */}
        <Text style={styles.jobTitle}>{vacancy.title}</Text>
        <Text style={styles.companyName}>{employerDisplayName}</Text>

        {/* Key info cards */}
        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardIcon}>💰</Text>
            <Text style={styles.infoCardLabel}>Зарплата</Text>
            <Text style={styles.infoCardValue}>{vacancy.salary.toLocaleString('ru-RU')} ₽/мес</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoCardIcon}>🗓</Text>
            <Text style={styles.infoCardLabel}>График</Text>
            <Text style={styles.infoCardValue}>{vacancy.schedule}</Text>
          </View>
        </View>

        {/* Location */}
        {(vacancy.metroStation || vacancy.address) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📍 Расположение</Text>
            {vacancy.metroStation ? (
              <View style={styles.locationRow}>
                {metroLine ? (
                  <View style={[styles.metroDot, { backgroundColor: metroLine.color }]} />
                ) : (
                  <Text style={styles.locationIcon}>🚇</Text>
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
                <Text style={styles.locationIcon}>📍</Text>
                <Text style={[styles.locationValue, { flex: 1 }]}>{vacancy.address}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Description */}
        {vacancy.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Описание вакансии</Text>
            <Text style={styles.descText}>{vacancy.description}</Text>
          </View>
        ) : null}

        {/* Employer info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏢 Работодатель</Text>
          <View style={styles.employerCard}>
            {employer?.avatarUrl ? (
              <Image
                source={{ uri: employer.avatarUrl }}
                style={styles.employerAvatar}
                contentFit="cover"
                transition={150}
              />
            ) : (
              <View style={[styles.employerAvatar, { backgroundColor: employerColor, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={styles.employerAvatarTxt}>{employerInitials}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.employerName}>{employerDisplayName}</Text>
              {employer?.metroStation ? (
                <Text style={styles.employerMeta}>🚇 {employer.metroStation}</Text>
              ) : null}
              {(employer?.avgRating ?? 0) > 0 ? (
                <Text style={styles.employerMeta}>
                  ⭐ {(employer?.avgRating ?? 0).toFixed(1)} ({employer?.ratingCount} отз.)
                </Text>
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
                <Text style={styles.phoneRevealLabel}>📞 Телефон работодателя</Text>
                <Text style={styles.phoneRevealNumber}>{employer.phone}</Text>
              </View>
              <View style={styles.phoneUnlocked}>
                <Text style={styles.phoneUnlockedTxt}>✅ Открыт</Text>
              </View>
            </View>
          ) : (
            <View style={styles.phoneLocked}>
              <Text style={styles.phoneLockedIcon}>🔒</Text>
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
            <Text style={[styles.saveBtnTxt, isSaved && { color: Colors.red }]}>
              {isSaved ? '❤️ Сохранено' : '🤍 Сохранить'}
            </Text>
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
            ) : (
              <Text style={[styles.applyBtnTxt, isApplied && { color: Colors.green }]}>
                {isApplied ? '✓ Отклик отправлен' : 'Откликнуться'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {authModalJSX}
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

  permBadge: {
    backgroundColor: '#EDE9FE', borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  permBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

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
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, padding: 12 },
  locationIcon: { fontSize: 16, marginTop: 1 },
  locationValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500', lineHeight: 20 },
  metroDot: { width: 14, height: 14, borderRadius: 7, marginTop: 3 },
  metroLineName: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },

  descText: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 22,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
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
