import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { dbSavePushToken, dbGetPushToken, dbGetWorkerTokensByMetro } from '@/services/db';

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

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[push] Permission denied: cannot register Expo push token.');
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
    await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// ─── Internal helper ──────────────────────────────────────────────────────────

async function pushTo(
  recipientUserId: string,
  title: string,
  body: string,
  type: string,
  channelId = 'default',
  data: Record<string, unknown> = {},
): Promise<void> {
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

export async function notifyWorkersNearVacancy(params: {
  metroStation: string;
  title: string;
  company: string;
  type: 'shift' | 'permanent';
}): Promise<void> {
  try {
    const { metroStation, title, company, type } = params;
    const workers = await dbGetWorkerTokensByMetro(metroStation);
    if (workers.length === 0) return;

    const notifTitle = type === 'permanent'
      ? '💼 Новая постоянная вакансия рядом!'
      : '⚡ Новая подработка рядом!';
    const body = `${company} ищет сотрудника на «${title}» — м. ${metroStation}`;

    const messages = workers.map(w => ({
      to: w.push_token,
      title: notifTitle,
      body,
      sound: 'default',
      channelId: 'vacancies',
      priority: 'normal',
      data: { type: type === 'permanent' ? 'nearby_perm' : 'nearby_shift' },
    }));

    // Expo Push API accepts batches of up to 100
    for (let i = 0; i < messages.length; i += 100) {
      await sendExpoPush(messages.slice(i, i + 100));
    }
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
