import { useContext } from 'react';
import { AppContext } from '@/contexts/AppContext';

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    // Return safe defaults instead of throwing — prevents black screen on cold boot
    return {
      currentUser: null,
      setCurrentUser: () => {},
      users: [],
      refreshUsers: async () => {},
      vacancies: [],
      setVacancies: () => {},
      refreshVacancies: async () => {},
      likes: [],
      setLikes: () => {},
      refreshLikes: async (_u?: any) => {},
      chats: [],
      unreadCount: 0,
      refreshChats: async () => {},
      savedIds: [],
      optimisticAddSaved: () => {},
      optimisticRemoveSaved: () => {},
      refreshSaved: async () => {},
      optimisticUpdateLike: () => {},
      toast: null,
      showToast: () => {},
      refreshAll: async () => {},
      logout: async () => {},
      loading: false,
      permVacancies: [],
      refreshPermVacancies: async () => {},
      permApplications: [],
      refreshPermApplications: async () => {},
      permSavedIds: [],
      refreshPermSaved: async () => {},
      optimisticAddPermSaved: () => {},
      optimisticRemovePermSaved: () => {},
      vacancyStatsMap: {},
      refreshVacancyStats: async () => {},
      permVacancyViewsMap: {},
      refreshPermVacancyViews: async () => {},
    } as any;
  }
  return ctx;
}
