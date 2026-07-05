import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { dbSavePushToken, dbGetPushToken, dbGetWebPushSubscription, dbSaveNotification } from '@/services/db';

const APP_SECRET = process.env.EXPO_PUBLIC_APP_SECRET || 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6';
const DASHBOARD_URL = process.env.EXPO_PUBLIC_DASHBOARD_URL || '';
const PROXY_URL = process.env.EXPO_PUBLIC_API_URL
  ? `${process.env.EXPO_PUBLIC_API_URL}/api/db.php`
  : 'https://jobtoo.ru/api/db.php';

// Show alerts and play sound for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Android notification channels ───────────────────────────────────────────

export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync('messages', {
      name: 'Сообщения',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('matches', {
      name: 'Мэтчи',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('vacancies', {
      name: 'Новые вакансии',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('default', {
      name: 'Общие',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    }),
  ]);
}

// ─── Token registration ───────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function getExpoProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId
    ?? undefined
  );
}

export async function registerForPushNotifications(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!Device.isDevice) {
    console.info('[push] Skipped push token registration: simulator/emulator detected.');
    return;
  }

  // Never trigger the OS permission dialog here — boot-time calls must stay
  // silent. The dialog is requested only from NotificationPermissionSheet.
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    console.info('[push] Permission not granted yet: skipping token registration.');
    return;
  }

  await setupAndroidChannels();

  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn('[push] Missing EAS projectId. Build with EAS and keep expo.extra.eas.projectId in app config.');
    return;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await dbSavePushToken(userId, token);
    console.info('[push] Expo push token saved for user:', userId);
  } catch (error) {
    console.warn('[push] Failed to register Expo push token:', error);
  }
}


type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  priority: 'default' | 'normal' | 'high';
  data: Record<string, unknown>;
  ttl?: number;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (Platform.OS === 'web') {
    // exp.host blocks cross-origin requests from browsers — route through server proxy
    const tokens = messages.map(m => m.to);
    const first = messages[0];
    await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SECRET },
      body: JSON.stringify({
        fn: 'sendPushNotification',
        args: [
          tokens.length === 1 ? tokens[0] : tokens,
          first.title,
          first.body,
          { channelId: first.channelId, ...first.data },
        ],
      }),
    }).catch(e => console.warn('[push] Server proxy error:', e));
    return;
  }

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn('[push] Expo API HTTP error:', response.status, text);
    return;
  }

  const payload = await response.json().catch(() => null) as { data?: ExpoPushTicket[] | ExpoPushTicket; errors?: unknown } | null;
  if (!payload) {
    console.warn('[push] Expo API returned unreadable JSON payload.');
    return;
  }

  if (payload.errors) {
    console.warn('[push] Expo API top-level errors:', payload.errors);
  }

  const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  tickets.forEach((ticket) => {
    if (ticket.status === 'error') {
      console.warn('[push] Expo push ticket error:', ticket.details?.error ?? ticket.message ?? 'unknown_error');
    }
  });
}

// ─── Web Push helper ──────────────────────────────────────────────────────────

async function sendWebPushTo(
  recipientUserId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (!DASHBOARD_URL) return;
  try {
    const sub = await dbGetWebPushSubscription(recipientUserId);
    if (!sub) return;
    await fetch(`${DASHBOARD_URL}/api/webpush/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-secret': APP_SECRET,
      },
      body: JSON.stringify({
        subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        title,
        body,
        data,
      }),
    });
  } catch {
    // Never crash due to web push failure
  }
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function pushTo(
  recipientUserId: string,
  title: string,
  body: string,
  type: string,
  channelId = 'default',
  data: Record<string, unknown> = {},
): Promise<void> {
  // Save in-app notification so the bell always shows it
  dbSaveNotification(recipientUserId, title, body).catch(() => {});
  // Fire-and-forget web push alongside Expo push
  sendWebPushTo(recipientUserId, title, body, { type, ...data }).catch(() => {});
  try {
    const token = await dbGetPushToken(recipientUserId);
    if (!token) return;
    await sendExpoPush([{
      to: token,
      title,
      body,
      sound: 'default',
      channelId,
      data: { type, ...data },
      priority: 'high',
      ...(channelId === 'messages' ? { ttl: 60 } : {}),
    }]);
  } catch {
    // Never crash the app due to a notification failure
  }
}

// ─── Employer notifications ───────────────────────────────────────────────────

export async function notifyEmployerNewApplicant(
  employerId: string,
  workerName: string,
  vacancyTitle: string,
): Promise<void> {
  await pushTo(
    employerId,
    '📥 Новый отклик!',
    `${workerName} хочет выйти на смену «${vacancyTitle}». Посмотрите кандидата!`,
    'new_applicant',
    'matches',
  );
}

export async function notifyEmployerGotMatch(
  employerId: string,
  workerName: string,
  vacancyTitle: string,
): Promise<void> {
  await pushTo(
    employerId,
    '🎉 Мэтч!',
    `${workerName} готов выйти на смену «${vacancyTitle}». Откройте чат!`,
    'match_employer',
    'matches',
  );
}

export async function notifyEmployerNewMessage(
  employerId: string,
  senderName: string,
  preview: string,
  chatId?: string,
): Promise<void> {
  await pushTo(
    employerId,
    `💬 ${senderName}`,
    preview.slice(0, 100),
    'message',
    'messages',
    chatId ? { chatId } : {},
  );
}

// ─── Worker notifications ─────────────────────────────────────────────────────

export async function notifyWorkerGotMatch(
  workerId: string,
  companyName: string,
  vacancyTitle: string,
): Promise<void> {
  await pushTo(
    workerId,
    '🎉 Мэтч! Вас хотят взять!',
    `${companyName} подтвердили ваш отклик на «${vacancyTitle}». Откройте чат!`,
    'match_worker',
    'matches',
  );
}

export async function notifyWorkerShiftConfirmedByEmployer(
  workerId: string,
  companyName: string,
  vacancyTitle: string,
): Promise<void> {
  await pushTo(
    workerId,
    '✅ Смена подтверждена работодателем',
    `${companyName} подтвердил смену «${vacancyTitle}». Хотите оставить отзыв?`,
    'shift_confirmed_by_employer',
    'default',
  );
}

export async function notifyWorkerNewMessage(
  workerId: string,
  senderName: string,
  preview: string,
  chatId?: string,
): Promise<void> {
  await pushTo(
    workerId,
    `💬 ${senderName}`,
    preview.slice(0, 100),
    'message',
    'messages',
    chatId ? { chatId } : {},
  );
}

// ─── Nearby vacancy broadcast ─────────────────────────────────────────────────

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function formatDateRu(iso?: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${MONTHS_RU[m - 1]}`;
}

export async function notifyWorkersNearVacancy(params: {
  metroStation: string;
  title: string;
  company: string;
  type: 'shift' | 'permanent';
  date?: string;       // ISO, для смен
  daysCount?: number;  // если смена на несколько дней
  timeStart?: string;
  timeEnd?: string;
  salary?: number;
  schedule?: string;   // для постоянных
}): Promise<void> {
  try {
    const { metroStation, title, company, type, date, daysCount, timeStart, timeEnd, salary, schedule } = params;

    const dateLabel = formatDateRu(date) + (daysCount && daysCount > 1 ? ` (+${daysCount - 1} дн.)` : '');
    const timeLabel = timeStart ? `${timeStart}${timeEnd ? `–${timeEnd}` : ''}` : '';
    const salaryLabel = salary && salary > 0
      ? `${salary.toLocaleString('ru-RU')} ₽${type === 'permanent' ? '/мес' : ''}`
      : '';

    // Broadcast to ALL workers (small user base — reach beats geo-precision).
    // Server sends Expo push + Telegram bot messages + bell + web push.
    const notifTitle = type === 'permanent'
      ? '💼 Новая постоянная вакансия!'
      : '⚡ Новая подработка!';
    const body = `${title} — ${company}`
      + (dateLabel ? `, ${dateLabel}` : '')
      + (timeLabel ? ` ${timeLabel}` : '')
      + (metroStation ? `, м. ${metroStation}` : '')
      + (salaryLabel ? `, ${salaryLabel}` : '')
      + '. Открой и откликнись!';

    const detailsHtml = `\n\n👷 ${title} — ${company}`
      + (dateLabel ? `\n📅 ${dateLabel}${timeLabel ? `, ${timeLabel}` : ''}` : (timeLabel ? `\n🕐 ${timeLabel}` : ''))
      + (schedule ? `\n🗓 ${schedule}` : '')
      + (metroStation ? `\n🚇 м. ${metroStation}` : '')
      + (salaryLabel ? `\n💰 ${salaryLabel}` : '');

    const headHtml = type === 'permanent' ? '💼 <b>Новая постоянная вакансия!</b>' : '⚡ <b>Новая подработка!</b>';
    const tgHtml = headHtml + detailsHtml + '\n\nУспей откликнуться 👇';
    // Пост в группу «ПОДРАБОТКИ» — тот же формат + напоминание про приложение
    const groupHtml = headHtml + detailsHtml
      + '\n\n⚡ В приложении смены появляются раньше — откликайся первым 👇';

    await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SECRET },
      body: JSON.stringify({
        fn: 'dbNotifyAllWorkersNewVacancy',
        args: [notifTitle, body, tgHtml, type === 'permanent' ? 'nearby_perm' : 'nearby_shift', groupHtml],
      }),
    });
  } catch {
    // Never crash the app due to a notification failure
  }
}

// ─── Permanent vacancy notifications ─────────────────────────────────────────

export async function notifyEmployerNewPermApplicant(
  employerId: string,
  workerName: string,
  vacancyTitle: string,
): Promise<void> {
  await pushTo(
    employerId,
    '📥 Новая заявка!',
    `${workerName} откликнулся на вакансию «${vacancyTitle}». Посмотрите кандидата!`,
    'new_perm_applicant', 'matches',
  );
}

export async function notifyWorkerPermApplicationApproved(
  workerId: string,
  companyName: string,
  vacancyTitle: string,
): Promise<void> {
  await pushTo(
    workerId,
    '✅ Заявка одобрена!',
    `${companyName} одобрили вашу заявку на «${vacancyTitle}». Свяжитесь с работодателем!`,
    'perm_approved', 'matches',
  );
}

export async function notifyWorkerPermApplicationRejected(
  workerId: string,
  companyName: string,
  vacancyTitle: string,
): Promise<void> {
  await pushTo(
    workerId,
    '❌ Заявка отклонена',
    `${companyName} отклонили вашу заявку на «${vacancyTitle}».`,
    'perm_rejected', 'matches',
  );
}

// ─── Bulletin broadcast ───────────────────────────────────────────────────────

export async function notifyAllWorkersNewBulletin(params: {
  company: string;
  workType: string;
  date: string;
  metro: string;
}): Promise<void> {
  try {
    const { company, workType, date, metro } = params;
    // Route through server proxy so push is sent server-side (reliable on all platforms)
    await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SECRET },
      body: JSON.stringify({
        fn: 'dbNotifyAllWorkersNewBulletin',
        args: [company, workType, date, metro],
      }),
    });
  } catch {
    // Never crash due to notification failure
  }
}
