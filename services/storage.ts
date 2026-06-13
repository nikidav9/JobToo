import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Vacancy } from '@/constants/types';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const nowISO = () => new Date().toISOString();

const KEY_CURRENT = 'jm_currentUser';

// ─── Session (current user in AsyncStorage for fast boot) ────────────────────

export async function getSessionUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CURRENT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveSessionUser(u: User): Promise<void> {
  await AsyncStorage.setItem(KEY_CURRENT, JSON.stringify(u));
}

export async function clearSessionUser(): Promise<void> {
  await AsyncStorage.removeItem(KEY_CURRENT);
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function normalizeCompany(_raw?: string | null): string {
  return 'Лавка';
}

export function nameColorFromString(str: string): string {
  const colors = ['#FF6B1A', '#2563EB', '#16A34A', '#7C3AED', '#DC2626', '#0CACCA'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return `${days[d.getDay()]} ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * Returns the "virtual start date" for the date strip.
 * After 21:00, today is considered closed — the strip starts from tomorrow.
 */
/** Format a Date object to YYYY-MM-DD using LOCAL date components (not UTC). */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getVirtualStartDate(): Date {
  const now = new Date();
  if (now.getHours() >= 21) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Returns ISO date strings for the next 14 days starting from the virtual start date.
 * Before 21:00: today + 13 more days.
 * After  21:00: tomorrow + 13 more days.
 * Always exactly 14 days — auto-updates daily.
 */
export function getTodayDates(): string[] {
  const start = getVirtualStartDate();
  const dates: string[] = [];
  const cur = new Date(start);
  for (let i = 0; i < 14; i++) {
    dates.push(localDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Priority-based vacancy scoring:
 * 1. Same metro station → 100
 * 2. Same metro line   → 60
 * 3. Everything else   → 20
 */
export function scoreVacancy(vacancy: Vacancy, user: User): number {
  if (user.metroStation && user.metroStation === vacancy.metroStation) return 100;
  if (user.metroLineId && user.metroLineId === vacancy.metroLineId) return 60;
  return 20;
}

// ─── Phone helpers ────────────────────────────────────────────────────────────

export function isPhoneComplete(formatted: string): boolean {
  const digits = formatted.replace(/\D/g, '');
  const local = digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits;
  return local.length === 10;
}

export function extractPhoneDigits(formatted: string): string {
  const digits = formatted.replace(/\D/g, '');
  if (digits.startsWith('7') || digits.startsWith('8')) return '7' + digits.slice(1, 11);
  return '7' + digits.slice(0, 10);
}

// ─── AsyncStorage cache (stale-while-revalidate) ──────────────────────────────

export const CACHE_KEYS = {
  vacancies:  'jm_c1_vac',
  likes:      (uid: string) => `jm_c1_likes_${uid}`,
  chats:      (uid: string) => `jm_c1_chats_${uid}`,
  permVac:    (uid: string) => `jm_c1_pvac_${uid}`,
  permApps:   (uid: string) => `jm_c1_papps_${uid}`,
};

export async function loadCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {}
}
