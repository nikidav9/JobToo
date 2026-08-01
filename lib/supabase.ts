import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const storage =
  Platform.OS === 'web'
    ? {
        getItem: (key: string) =>
          Promise.resolve(
            typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
          ),
        setItem: (key: string, value: string) => {
          if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
          return Promise.resolve();
        },
        removeItem: (key: string) => {
          if (typeof window !== 'undefined') window.localStorage.removeItem(key);
          return Promise.resolve();
        },
      }
    : AsyncStorage;

// Этим клиентом остались две вещи: живые обновления чата (channel) и загрузка
// файлов в Storage. Всё остальное ходит через db.php — см. IS_NATIVE в
// services/db.ts.
//
// Ключ берём только из окружения. Запасного значения в коде нет намеренно:
// прежнее пережило смену ключей и продолжало бы работать втихую, а забытый
// в коде ключ — ровно то, из-за чего пришлось всё это переделывать.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '[supabase] Не заданы EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Живые обновления чата и загрузка файлов работать не будут.'
  );
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      storage,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);
