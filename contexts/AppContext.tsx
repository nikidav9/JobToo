import React, { createContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getSupabaseClient } from '@/template';
import { User, Vacancy, Like, Chat, PermVacancy, PermApplication } from '@/constants/types';
import {
  getSessionUser,
  saveSessionUser,
  clearSessionUser,
  extractPhoneDigits,
  loadCache,
  saveCache,
  CACHE_KEYS,
} from '@/services/storage';
import {
  dbGetUsers,
  dbUpsertUser,
  dbGetUserByPhone,
  dbGetVacancies,
  dbGetLikes,
  dbGetLikesForUser,
  dbGetChats,
  dbGetSaved,
  dbGetPermVacancies,
  dbGetPermVacanciesByEmployer,
  dbGetPermApplications,
  dbGetPermSaved,
} from '@/services/db';
import { registerForPushNotifications } from '@/services/notifications';

// Polling interval for native (Realtime is primary, polling is fallback)
const NATIVE_POLL_INTERVAL = 15_000;

export interface ToastMessage { message: string; type: 'success' | 'error' | 'info' }

export interface AppContextValue {
  currentUser: User | null;
  loading: boolean;
  vacanciesLoading: boolean;
  toast: ToastMessage | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  users: User[];
  vacancies: Vacancy[];
  likes: Like[];
  chats: Chat[];
  unreadCount: number;
  permVacancies: PermVacancy[];
  permApplications: PermApplication[];
  savedWorkers: User[];
  permSavedWorkers: User[];
  savedIds: string[];
  optimisticAddSaved: (vacancyId: string) => void;
  optimisticRemoveSaved: (vacancyId: string) => void;
  optimisticAddVacancy: (v: Vacancy) => void;
  optimisticUpdateVacancy: (v: Vacancy) => void;
  optimisticAddPermVacancy: (v: PermVacancy) => void;
  optimisticUpdatePermVacancy: (v: PermVacancy) => void;
  optimisticAddChat: (c: Chat) => void;
  optimisticUpdateChat: (c: Chat) => void;
  optimisticAddLike: (l: Like) => void;
  optimisticUpdateLike: (l: Like) => void;
  registerUser: (u: User) => Promise<void>;
  loginUser: (phone: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshVacancies: () => Promise<void>;
  refreshLikes: (u?: User) => Promise<void>;
  refreshChats: (u?: User) => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshSaved: (u?: User) => Promise<void>;
  permSavedIds: string[];
  optimisticAddPermSaved: (vacancyId: string) => void;
  optimisticRemovePermSaved: (vacancyId: string) => void;
  refreshPermVacancies: (u?: User) => Promise<void>;
  refreshPermApplications: (u?: User) => Promise<void>;
  refreshPermSaved: (u?: User) => Promise<void>;
  updateUser: (u: User) => Promise<void>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, _setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [vacanciesLoading, setVacanciesLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const [users, setUsers] = useState<User[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [permVacancies, setPermVacancies] = useState<PermVacancy[]>([]);
  const [permApplications, setPermApplications] = useState<PermApplication[]>([]);
  const [savedWorkers] = useState<User[]>([]);
  const [permSavedWorkers] = useState<User[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [permSavedIds, setPermSavedIds] = useState<string[]>([]);

  const optimisticAddSaved = useCallback((vacancyId: string) => {
    setSavedIds(prev => prev.includes(vacancyId) ? prev : [...prev, vacancyId]);
  }, []);
  const optimisticRemoveSaved = useCallback((vacancyId: string) => {
    setSavedIds(prev => prev.filter(id => id !== vacancyId));
  }, []);
  const optimisticAddPermSaved = useCallback((vacancyId: string) => {
    setPermSavedIds(prev => prev.includes(vacancyId) ? prev : [...prev, vacancyId]);
  }, []);
  const optimisticRemovePermSaved = useCallback((vacancyId: string) => {
    setPermSavedIds(prev => prev.filter(id => id !== vacancyId));
  }, []);
  const optimisticAddVacancy = useCallback((v: Vacancy) => {
    setVacancies(prev => [v, ...prev.filter(x => x.id !== v.id)]);
  }, []);
  const optimisticUpdateVacancy = useCallback((v: Vacancy) => {
    setVacancies(prev => prev.map(x => x.id === v.id ? v : x));
  }, []);
  const optimisticAddPermVacancy = useCallback((v: PermVacancy) => {
    setPermVacancies(prev => [v, ...prev.filter(x => x.id !== v.id)]);
  }, []);
  const optimisticUpdatePermVacancy = useCallback((v: PermVacancy) => {
    setPermVacancies(prev => prev.map(x => x.id === v.id ? v : x));
  }, []);
  const optimisticAddChat = useCallback((c: Chat) => {
    setChats(prev => [c, ...prev.filter(x => x.id !== c.id)]);
  }, []);
  const optimisticUpdateChat = useCallback((c: Chat) => {
    setChats(prev => prev.map(x => x.id === c.id ? c : x));
  }, []);
  const optimisticAddLike = useCallback((l: Like) => {
    setLikes(prev => [l, ...prev.filter(x => x.id !== l.id)]);
  }, []);
  const optimisticUpdateLike = useCallback((l: Like) => {
    setLikes(prev => prev.map(x => x.id === l.id ? l : x));
  }, []);

  // ─── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        // Show splash for at least 1 second, then check session
        const [sessionUser] = await Promise.all([
          getSessionUser().catch(() => null),
          new Promise<void>(r => setTimeout(r, 1000)),
        ]);

        if (cancelled) return;

        if (sessionUser) {
          _setCurrentUser(sessionUser);

          // Restore cached data instantly
          const [cachedVac, cachedLikes, cachedChats, cachedPermVac, cachedPermApps] = await Promise.all([
            loadCache<Vacancy[]>(CACHE_KEYS.vacancies),
            loadCache<Like[]>(CACHE_KEYS.likes(sessionUser.id)),
            loadCache<Chat[]>(CACHE_KEYS.chats(sessionUser.id)),
            loadCache<PermVacancy[]>(CACHE_KEYS.permVac(sessionUser.id)),
            loadCache<PermApplication[]>(CACHE_KEYS.permApps(sessionUser.id)),
          ]);

          if (cancelled) return;
          if (cachedVac) setVacancies(cachedVac);
          if (cachedLikes) setLikes(cachedLikes);
          if (cachedChats) setChats(cachedChats);
          if (cachedPermVac) setPermVacancies(cachedPermVac);
          if (cachedPermApps) setPermApplications(cachedPermApps);

          // Refresh from Supabase in background — don't block loading
          setTimeout(() => {
            if (cancelled) return;
            Promise.all([
              refreshUsers(),
              refreshVacancies(),
              refreshLikes(sessionUser),
              refreshChats(sessionUser),
              refreshSaved(sessionUser),
              refreshPermVacancies(sessionUser),
              refreshPermApplications(sessionUser),
              refreshPermSaved(sessionUser),
            ]).catch(() => {});
          }, 100);
        }
      } catch (e) {
        console.warn('[AppContext] boot error', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Safety timeout — always unblock UI after 6 seconds
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 6000);

    boot().finally(() => clearTimeout(safetyTimer));

    return () => { cancelled = true; clearTimeout(safetyTimer); };
  }, []);

  // ─── Keep connection alive (web only) ─────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const interval = setInterval(() => {
      Promise.resolve(supabase.from('jm_users').select('id').limit(1)).catch(() => {});
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Realtime subscriptions ────────────────────────────────────────────────
  // Web: uses supabase-js directly.
  // Native: uses the singleton Supabase client from template/core/client.ts
  //         which has a stable WebSocket connection (bypasses the API proxy).

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!currentUser) return;

    const user = currentUser;
    const subs: ReturnType<typeof supabase.channel>[] = [];

    const safeSub = (ch: ReturnType<typeof supabase.channel>) => {
      try {
        subs.push(ch.subscribe());
      } catch (e) {
        console.warn('[AppContext] realtime subscription failed:', e);
      }
    };

    safeSub(supabase.channel('rt_vacancies').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_vacancies' }, () => refreshVacancies()));
    safeSub(supabase.channel('rt_chats').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_chats' }, () => refreshChats(user)));
    safeSub(supabase.channel('rt_messages_global').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jm_messages' }, () => refreshChats(user)));
    safeSub(supabase.channel('rt_likes').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_likes' }, () => refreshLikes(user)));
    safeSub(supabase.channel('rt_perm_vac').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_perm_vacancies' }, () => refreshPermVacancies(user)));
    safeSub(supabase.channel('rt_perm_apps').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_perm_applications' }, () => refreshPermApplications(user)));
    safeSub(supabase.channel('rt_users').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_users' }, () => refreshUsers()));
    safeSub(supabase.channel('rt_saved').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_saved' }, () => refreshSaved(user)));
    safeSub(supabase.channel('rt_perm_saved').on('postgres_changes', { event: '*', schema: 'public', table: 'jm_perm_saved' }, () => refreshPermSaved(user)));
    safeSub(supabase.channel('rt_ratings').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jm_ratings' }, () => refreshUsers()));

    return () => {
      subs.forEach(s => { try { s.unsubscribe(); } catch {} });
    };
  }, [currentUser?.id]);

  // ─── Polling fallback for native (fires when app comes to foreground) ──────
  // Realtime covers live updates; polling ensures consistency after reconnect.

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!currentUser) return;

    const user = currentUser;

    const poll = () => {
      Promise.all([
        refreshChats(user),
        refreshVacancies(),
        refreshLikes(user),
      ]).catch(() => {});
    };

    // Poll on interval
    const interval = setInterval(poll, NATIVE_POLL_INTERVAL);

    // Also poll immediately when app returns to foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') poll();
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [currentUser?.id]);

  // ─── Auth actions ──────────────────────────────────────────────────────────

  const registerUser = async (u: User) => {
    await dbUpsertUser(u);
    _setCurrentUser(u);
    await saveSessionUser(u);
    // Задержка нужна чтобы система успела обработать разрешения на уведомления
    setTimeout(() => { registerForPushNotifications(u.id).catch(() => {}); }, 2000);
    setTimeout(() => {
      Promise.all([
        refreshUsers(),
        refreshVacancies(),
        refreshLikes(u),
        refreshChats(u),
        refreshSaved(u),
        refreshPermVacancies(u),
        refreshPermApplications(u),
        refreshPermSaved(u),
      ]).catch(() => {});
    }, 300);
  };

  const loginUser = async (phone: string, password: string): Promise<User | null> => {
    const digits = extractPhoneDigits(phone);
    const found = await dbGetUserByPhone(digits);
    if (!found || found.password !== password) return null;
    _setCurrentUser(found);
    await saveSessionUser(found);
    registerForPushNotifications(found.id).catch(() => {});
    setTimeout(() => {
      Promise.all([
        refreshUsers(),
        refreshVacancies(),
        refreshLikes(found),
        refreshChats(found),
        refreshSaved(found),
        refreshPermVacancies(found),
        refreshPermApplications(found),
        refreshPermSaved(found),
      ]).catch(() => {});
    }, 300);
    return found;
  };

  const logout = async () => {
    _setCurrentUser(null);
    await clearSessionUser();
    setUsers([]);
    setVacancies([]);
    setLikes([]);
    setChats([]);
    setPermVacancies([]);
    setPermApplications([]);
    setSavedIds([]);
    setPermSavedIds([]);
  };

  const updateUser = async (u: User) => {
    _setCurrentUser(u);
    await saveSessionUser(u);
    await dbUpsertUser(u);
    await refreshUsers();
  };

  // ─── Refresh helpers ───────────────────────────────────────────────────────

  const refreshUsers = async () => {
    const data = await dbGetUsers();
    setUsers(data);
    _setCurrentUser(prev => {
      if (!prev) return prev;
      const fresh = data.find(u => u.id === prev.id);
      if (!fresh) return prev;
      saveSessionUser(fresh).catch(() => {});
      return fresh;
    });
  };

  const refreshVacancies = async () => {
    setVacanciesLoading(true);
    try {
      const data = await dbGetVacancies();
      setVacancies(data);
      saveCache(CACHE_KEYS.vacancies, data).catch(() => {});
    } finally {
      setVacanciesLoading(false);
    }
  };

  const refreshLikes = async (u?: User) => {
    const user = u ?? currentUser;
    if (!user) {
      const data = await dbGetLikes();
      setLikes(data);
      return;
    }
    const data = await dbGetLikesForUser(user.id, user.role);
    setLikes(data);
    saveCache(CACHE_KEYS.likes(user.id), data).catch(() => {});
  };

  const refreshChats = async (u?: User) => {
    const user = u ?? currentUser;
    if (!user) return;
    const data = await dbGetChats(user.id, user.role);
    setChats(data);
    saveCache(CACHE_KEYS.chats(user.id), data).catch(() => {});
  };

  const refreshAll = useCallback(async () => {
    if (!currentUser) return;
    const user = currentUser;
    await Promise.all([
      refreshUsers(),
      refreshVacancies(),
      refreshLikes(user),
      refreshPermVacancies(user),
      refreshChats(user),
    ]);
  }, [currentUser]);

  const refreshSaved = async (u?: User) => {
    const user = u ?? currentUser;
    if (!user) return;
    const ids = await dbGetSaved(user.id);
    setSavedIds(ids);
  };

  const refreshPermVacancies = async (u?: User) => {
    const user = u ?? currentUser;
    if (!user) return;
    const data = user.role === 'employer'
      ? await dbGetPermVacanciesByEmployer(user.id)
      : await dbGetPermVacancies();
    setPermVacancies(data);
    saveCache(CACHE_KEYS.permVac(user.id), data).catch(() => {});
  };

  const refreshPermApplications = async (u?: User) => {
    const user = u ?? currentUser;
    if (!user) return;
    const data = await dbGetPermApplications(user.id, user.role);
    setPermApplications(data);
    saveCache(CACHE_KEYS.permApps(user.id), data).catch(() => {});
  };

  const refreshPermSaved = async (u?: User) => {
    const user = u ?? currentUser;
    if (!user) return;
    const ids = await dbGetPermSaved(user.id);
    setPermSavedIds(ids);
  };

  const unreadCount = chats.reduce((sum, c) => {
    if (currentUser?.role === 'worker') return sum + (c.unreadWorker ?? 0);
    if (currentUser?.role === 'employer') return sum + (c.unreadEmployer ?? 0);
    return sum;
  }, 0);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        loading,
        vacanciesLoading,
        toast,
        showToast,
        users,
        vacancies,
        likes,
        chats,
        unreadCount,
        permVacancies,
        permApplications,
        savedWorkers,
        permSavedWorkers,
        savedIds,
        optimisticAddSaved,
        optimisticRemoveSaved,
        optimisticAddVacancy,
        optimisticUpdateVacancy,
        optimisticAddPermVacancy,
        optimisticUpdatePermVacancy,
        optimisticAddChat,
        optimisticUpdateChat,
        optimisticAddLike,
        optimisticUpdateLike,
        permSavedIds,
        optimisticAddPermSaved,
        optimisticRemovePermSaved,
        registerUser,
        loginUser,
        logout,
        refreshUsers,
        refreshVacancies,
        refreshLikes,
        refreshChats,
        refreshSaved,
        refreshPermVacancies,
        refreshPermApplications,
        refreshPermSaved,
        refreshAll,
        updateUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
