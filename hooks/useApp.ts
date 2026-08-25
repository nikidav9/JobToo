import { useContext } from 'react';
import { AppContext, AppContextValue } from '@/contexts/AppContext';

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp должен использоваться внутри AppProvider');
  }
  return ctx;
}
