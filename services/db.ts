import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { User, Vacancy, Like, Chat, Message, PermVacancy, PermApplication, PermApplicationStatus } from '@/constants/types';
import { uid, nowISO } from '@/services/storage';

const DB_TIMEOUT = 12_000;

// ─── Native API proxy ────────────────────────────────────────────────────────
// On Android/iOS the supabase-js client has connectivity issues.
// All DB calls go through the web API endpoint instead.

const IS_NATIVE = Platform.OS !== 'web';
const API_BASE = IS_NATIVE ? (process.env.EXPO_PUBLIC_API_URL ?? '') : '';

async function proxy<T>(fn: string, args: unknown[] = []): Promise<T> {
  const res = await fetch(`${API_BASE}/api/db`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fn, args }),
  });
  const body = await res.json() as { data?: T; error?: string };
  if (body.error) throw new Error(body.error);
  return body.data as T;
}

function withTimeout<T>(promise: PromiseLike<T>, ms = DB_TIMEOUT): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Нет ответа от сервера. Проверьте соединение.')), ms)
    ),
  ]);
}

function throwOnError(label: string, error: any): never {
  const msg = error?.message ?? String(error);
  console.error(`[db] ${label}:`, msg);
  throw new Error(msg);
}

// ─── Users ────────────────────────────────────────────────────────────────────

function rowToUser(r: any): User {
  return {
    id: r.id,
    role: r.role,
    phone: r.phone,
    lastName: r.last_name,
    firstName: r.first_name,
    age: r.age ?? undefined,
    metroLineId: r.metro_line_id ?? undefined,
    metroStation: r.metro_station ?? undefined,
    workTypes: r.work_types ?? [],
    company: r.company ?? undefined,
    createdAt: r.created_at,
    isBlocked: r.is_blocked ?? false,
    avatarUrl: r.avatar_url ?? undefined,
    avgRating: r.avg_rating ?? 0,
    ratingCount: r.rating_count ?? 0,
    password: r.password ?? '',
    bio: r.bio ?? undefined,
  };
}

function userToRow(u: User) {
  return {
    id: u.id,
    role: u.role,
    phone: u.phone,
    last_name: u.lastName,
    first_name: u.firstName,
    age: u.age ?? null,
    metro_line_id: u.metroLineId ?? null,
    metro_station: u.metroStation ?? null,
    work_types: u.workTypes ?? [],
    company: u.company ?? null,
    created_at: u.createdAt,
    is_blocked: u.isBlocked ?? false,
    avatar_url: u.avatarUrl ?? null,
    avg_rating: u.avgRating ?? 0,
    rating_count: u.ratingCount ?? 0,
    password: u.password ?? '',
    bio: u.bio ?? null,
  };
}

export async function dbGetUserById(id: string): Promise<User | null> {
  if (IS_NATIVE) { const d = await proxy<any>('dbGetUserById', [id]); return d ? rowToUser(d) : null; }
  const { data } = await withTimeout(
    supabase.from('jm_users').select('*').eq('id', id).maybeSingle()
  );
  return data ? rowToUser(data) : null;
}

export async function dbGetUsers(): Promise<User[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetUsers'); return d.map(rowToUser); }
  const { data, error } = await withTimeout(
    supabase.from('jm_users').select('*').order('created_at', { ascending: true })
  );
  if (error) throwOnError('dbGetUsers', error);
  return (data ?? []).map(rowToUser);
}

export async function dbUpsertUser(u: User): Promise<void> {
  const { avg_rating, rating_count, ...row } = userToRow(u);
  if (IS_NATIVE) { await proxy('dbUpsertUser', [row]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_users').upsert(row, { onConflict: 'id' })
  );
  if (error) throwOnError('dbUpsertUser', error);
}

export async function dbDeleteUser(id: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbDeleteUser', [id]); return; }
  const { error } = await supabase.from('jm_users').delete().eq('id', id);
  if (error) console.error('dbDeleteUser', error.message);
}

export function dbWarmup(): void {
  if (IS_NATIVE) return; // skip on native — connection warmup not needed for API proxy
  withTimeout(
    supabase.from('jm_users').select('id').limit(1),
    20_000
  ).catch(() => {});
}

export async function dbCheckPhoneExists(phone: string): Promise<boolean> {
  if (IS_NATIVE) {
    try { return await proxy<boolean>('dbCheckPhoneExists', [phone]); } catch { return false; }
  }
  try {
    const { data } = await withTimeout(
      supabase.from('jm_users').select('id').eq('phone', phone).maybeSingle(),
      8_000
    );
    return !!data;
  } catch {
    return false;
  }
}

export async function dbGetUserByPhone(phone: string): Promise<User | null> {
  if (IS_NATIVE) { const d = await proxy<any>('dbGetUserByPhone', [phone]); return d ? rowToUser(d) : null; }
  const { data, error } = await withTimeout(
    supabase.from('jm_users').select('*').eq('phone', phone).maybeSingle()
  );
  if (error) throwOnError('dbGetUserByPhone', error);
  return data ? rowToUser(data) : null;
}

// ─── Vacancies ────────────────────────────────────────────────────────────────

function rowToVacancy(r: any): Vacancy {
  return {
    id: r.id,
    employerId: r.employer_id,
    company: r.company,
    title: r.title,
    workType: r.work_type,
    workTypeLabel: r.work_type_label,
    metroLineId: r.metro_line_id ?? '',
    metroStation: r.metro_station ?? '',
    date: r.date,
    timeStart: r.time_start ?? '',
    timeEnd: r.time_end ?? '',
    salary: r.salary,
    normsAndPay: r.norms_and_pay ?? '',
    address: r.address ?? '',
    workersNeeded: r.workers_needed,
    workersFound: r.workers_found,
    isUrgent: r.is_urgent,
    noExperienceNeeded: r.no_experience_needed,
    conditions: r.conditions ?? '',
    status: r.status,
    createdAt: r.created_at,
  };
}

function vacancyToRow(v: Vacancy) {
  return {
    id: v.id,
    employer_id: v.employerId,
    company: v.company,
    title: v.title,
    work_type: v.workType,
    work_type_label: v.workTypeLabel,
    metro_line_id: v.metroLineId || null,
    metro_station: v.metroStation || null,
    date: v.date,
    time_start: v.timeStart,
    time_end: v.timeEnd,
    salary: v.salary,
    norms_and_pay: v.normsAndPay || null,
    address: v.address || null,
    workers_needed: v.workersNeeded,
    workers_found: v.workersFound,
    is_urgent: v.isUrgent,
    no_experience_needed: v.noExperienceNeeded,
    conditions: v.conditions || null,
    status: v.status,
    created_at: v.createdAt,
  };
}

export async function dbGetVacancies(): Promise<Vacancy[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetVacancies'); return d.map(rowToVacancy); }
  const { data, error } = await withTimeout(
    supabase.from('jm_vacancies').select('*').order('created_at', { ascending: false })
  );
  if (error) throwOnError('dbGetVacancies', error);
  return (data ?? []).map(rowToVacancy);
}

export async function dbUpsertVacancy(v: Vacancy): Promise<void> {
  if (IS_NATIVE) { await proxy('dbUpsertVacancy', [vacancyToRow(v)]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_vacancies').upsert(vacancyToRow(v), { onConflict: 'id' })
  );
  if (error) throwOnError('dbUpsertVacancy', error);
}

export async function dbUpdateVacancy(id: string, patch: Partial<{ status: string; workers_found: number }>): Promise<void> {
  if (IS_NATIVE) { await proxy('dbUpdateVacancy', [id, patch]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_vacancies').update(patch).eq('id', id)
  );
  if (error) throwOnError('dbUpdateVacancy', error);
}

// ─── Likes ────────────────────────────────────────────────────────────────────

function rowToLike(r: any): Like {
  return {
    id: r.id,
    vacancyId: r.vacancy_id,
    workerId: r.worker_id,
    employerId: r.employer_id,
    workerLiked: r.worker_liked,
    employerLiked: r.employer_liked,
    workerSkipped: r.worker_skipped,
    isMatch: r.is_match,
    matchedAt: r.matched_at ?? undefined,
    workerConfirmed: r.worker_confirmed ?? false,
    employerConfirmed: r.employer_confirmed ?? false,
    workerRated: r.worker_rated ?? false,
    employerRated: r.employer_rated ?? false,
    shiftCompleted: r.shift_completed ?? false,
  };
}

export async function dbGetLikes(): Promise<Like[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetLikes'); return d.map(rowToLike); }
  const { data, error } = await withTimeout(supabase.from('jm_likes').select('*'));
  if (error) throwOnError('dbGetLikes', error);
  return (data ?? []).map(rowToLike);
}

export async function dbGetLikesForUser(userId: string, role: 'worker' | 'employer'): Promise<Like[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetLikesForUser', [userId, role]); return d.map(rowToLike); }
  const field = role === 'worker' ? 'worker_id' : 'employer_id';
  const { data, error } = await withTimeout(
    supabase.from('jm_likes').select('*').eq(field, userId)
  );
  if (error) throwOnError('dbGetLikesForUser', error);
  return (data ?? []).map(rowToLike);
}

export async function dbGetLikesByVacancy(vacancyId: string): Promise<Like[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetLikesByVacancy', [vacancyId]); return d.map(rowToLike); }
  const { data, error } = await withTimeout(
    supabase.from('jm_likes').select('*').eq('vacancy_id', vacancyId)
  );
  if (error) throwOnError('dbGetLikesByVacancy', error);
  return (data ?? []).map(rowToLike);
}

export async function dbGetLikeByVacancyWorker(vacancyId: string, workerId: string): Promise<Like | null> {
  if (IS_NATIVE) { const d = await proxy<any>('dbGetLikeByVacancyWorker', [vacancyId, workerId]); return d ? rowToLike(d) : null; }
  const { data } = await withTimeout(
    supabase.from('jm_likes').select('*').eq('vacancy_id', vacancyId).eq('worker_id', workerId).maybeSingle()
  );
  return data ? rowToLike(data) : null;
}

export async function dbUpsertLike(
  vacancyId: string,
  workerId: string,
  employerId: string,
  updates: Partial<Like>
): Promise<Like> {
  if (IS_NATIVE) { const d = await proxy<any>('dbUpsertLike', [vacancyId, workerId, employerId, updates]); return rowToLike(d); }
  const { data: existing } = await withTimeout(
    supabase.from('jm_likes').select('*').eq('vacancy_id', vacancyId).eq('worker_id', workerId).maybeSingle()
  );

  const base: any = existing ?? {
    id: uid(),
    vacancy_id: vacancyId,
    worker_id: workerId,
    employer_id: employerId,
    worker_liked: false,
    employer_liked: null,
    worker_skipped: false,
    is_match: false,
    matched_at: null,
    worker_confirmed: false,
    employer_confirmed: false,
    worker_rated: false,
    employer_rated: false,
    shift_completed: false,
  };

  const row = {
    ...base,
    worker_liked: updates.workerLiked ?? base.worker_liked,
    employer_liked: updates.employerLiked ?? base.employer_liked,
    worker_skipped: updates.workerSkipped ?? base.worker_skipped,
    is_match: updates.isMatch ?? base.is_match,
    matched_at: updates.matchedAt ?? base.matched_at,
    worker_confirmed: updates.workerConfirmed ?? base.worker_confirmed,
    employer_confirmed: updates.employerConfirmed ?? base.employer_confirmed,
    worker_rated: updates.workerRated ?? base.worker_rated,
    employer_rated: updates.employerRated ?? base.employer_rated,
    shift_completed: updates.shiftCompleted ?? base.shift_completed,
  };

  const { data: written, error } = await withTimeout(
    supabase.from('jm_likes').upsert(row, { onConflict: 'vacancy_id,worker_id' }).select()
  );
  if (error) throwOnError('dbUpsertLike', error);
  if (!written || written.length === 0) {
    throw new Error('Like not saved: permission denied');
  }
  return rowToLike(row);
}

export async function dbRemoveLike(vacancyId: string, workerId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbRemoveLike', [vacancyId, workerId]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_likes').delete().eq('vacancy_id', vacancyId).eq('worker_id', workerId)
  );
  if (error) throwOnError('dbRemoveLike', error);
}

export async function dbDeleteMatch(likeId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbDeleteMatch', [likeId]); return; }
  const { error } = await withTimeout(supabase.from('jm_likes').delete().eq('id', likeId));
  if (error) throwOnError('dbDeleteMatch', error);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function rowToMessage(r: any): Message {
  return {
    id: r.id,
    senderId: r.sender_id,
    text: r.text,
    timestamp: r.created_at,
  };
}

export async function dbGetMessages(chatId: string): Promise<Message[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetMessages', [chatId]); return d.map(rowToMessage); }
  const { data, error } = await withTimeout(
    supabase.from('jm_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true })
  );
  if (error) throwOnError('dbGetMessages', error);
  return (data ?? []).map(rowToMessage);
}

export async function dbInsertMessage(chatId: string, senderId: string, text: string): Promise<Message> {
  if (IS_NATIVE) { const d = await proxy<any>('dbInsertMessage', [chatId, senderId, text]); return rowToMessage(d); }
  const msg = { id: uid(), chat_id: chatId, sender_id: senderId, text, created_at: nowISO() };
  const { error } = await withTimeout(supabase.from('jm_messages').insert(msg));
  if (error) throwOnError('dbInsertMessage', error);
  return rowToMessage(msg);
}

// ─── Chats ────────────────────────────────────────────────────────────────────

function rowToChat(r: any, messages: Message[] = []): Chat {
  return {
    id: r.id,
    vacancyId: r.vacancy_id,
    workerId: r.worker_id,
    employerId: r.employer_id,
    vacTitle: r.vac_title ?? '',
    companyName: r.company_name ?? '',
    messages,
    unreadWorker: r.unread_worker ?? 0,
    unreadEmployer: r.unread_employer ?? 0,
    createdAt: r.created_at,
  };
}

export async function dbGetChats(userId: string, role: 'worker' | 'employer'): Promise<Chat[]> {
  if (IS_NATIVE) {
    const rows = await proxy<any[]>('dbGetChats', [userId, role]);
    return rows.map(row => {
      const last = row._last_msg;
      return rowToChat(row, last ? [rowToMessage(last)] : []);
    });
  }
  const field = role === 'worker' ? 'worker_id' : 'employer_id';
  const { data, error } = await withTimeout(
    supabase.from('jm_chats').select('*').eq(field, userId).order('created_at', { ascending: false })
  );
  if (error) throwOnError('dbGetChats', error);

  const chatRows = data ?? [];
  if (chatRows.length === 0) return [];

  const chatIds = chatRows.map((r: any) => r.id);
  const { data: allMsgs } = await withTimeout(
    supabase.from('jm_messages').select('*').in('chat_id', chatIds).order('created_at', { ascending: false })
  );

  const lastMsgByChat = new Map<string, any>();
  for (const msg of (allMsgs ?? [])) {
    if (!lastMsgByChat.has(msg.chat_id)) lastMsgByChat.set(msg.chat_id, msg);
  }

  return chatRows.map((row: any) => {
    const lastMsg = lastMsgByChat.get(row.id);
    return rowToChat(row, lastMsg ? [rowToMessage(lastMsg)] : []);
  });
}

export async function dbGetChatById(chatId: string): Promise<Chat | null> {
  if (IS_NATIVE) {
    const result = await proxy<any>('dbGetChatById', [chatId]);
    if (!result) return null;
    const { _messages, ...row } = result;
    return rowToChat(row, (_messages ?? []).map(rowToMessage));
  }
  const { data } = await withTimeout(
    supabase.from('jm_chats').select('*').eq('id', chatId).maybeSingle()
  );
  if (!data) return null;
  const msgs = await dbGetMessages(chatId);
  return rowToChat(data, msgs);
}

export async function dbCreateChat(
  workerId: string,
  employerId: string,
  vacancyId: string,
  vacTitle: string,
  companyName: string,
  systemMessage?: string,
  initialUnreadWorker = 0,
  initialUnreadEmployer = 0
): Promise<string> {
  if (IS_NATIVE) {
    return proxy<string>('dbCreateChat', [
      workerId, employerId, vacancyId, vacTitle, companyName,
      systemMessage, initialUnreadWorker, initialUnreadEmployer,
    ]);
  }
  const { data: existing } = await withTimeout(
    supabase.from('jm_chats').select('id').eq('vacancy_id', vacancyId).eq('worker_id', workerId).maybeSingle()
  );
  if (existing) return existing.id;

  const chatId = uid();
  const row = {
    id: chatId,
    vacancy_id: vacancyId,
    worker_id: workerId,
    employer_id: employerId,
    vac_title: vacTitle,
    company_name: companyName,
    unread_worker: initialUnreadWorker,
    unread_employer: initialUnreadEmployer,
    created_at: nowISO(),
  };
  const { error } = await withTimeout(supabase.from('jm_chats').insert(row));
  if (error) throwOnError('dbCreateChat', error);

  if (systemMessage) {
    await dbInsertMessage(chatId, 'system', systemMessage);
  }

  return chatId;
}

export async function dbMarkRead(chatId: string, role: 'worker' | 'employer'): Promise<void> {
  if (IS_NATIVE) { await proxy('dbMarkRead', [chatId, role]); return; }
  const field = role === 'worker' ? 'unread_worker' : 'unread_employer';
  const { error } = await withTimeout(
    supabase.from('jm_chats').update({ [field]: 0 }).eq('id', chatId)
  );
  if (error) throwOnError('dbMarkRead', error);
}

export async function dbIncrementUnread(chatId: string, forRole: 'worker' | 'employer'): Promise<void> {
  if (IS_NATIVE) { await proxy('dbIncrementUnread', [chatId, forRole]); return; }
  const { data } = await withTimeout(
    supabase.from('jm_chats').select('unread_worker,unread_employer').eq('id', chatId).maybeSingle()
  );
  if (!data) return;
  const field = forRole === 'worker' ? 'unread_worker' : 'unread_employer';
  const cur = forRole === 'worker' ? data.unread_worker : data.unread_employer;
  await withTimeout(supabase.from('jm_chats').update({ [field]: (cur ?? 0) + 1 }).eq('id', chatId));
}

export async function dbDeleteChat(chatId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbDeleteChat', [chatId]); return; }
  await withTimeout(supabase.from('jm_messages').delete().eq('chat_id', chatId));
  await withTimeout(supabase.from('jm_chats').delete().eq('id', chatId));
}

// ─── Saved ────────────────────────────────────────────────────────────────────

export async function dbGetSaved(userId: string): Promise<string[]> {
  if (IS_NATIVE) { return proxy<string[]>('dbGetSaved', [userId]); }
  const { data, error } = await withTimeout(
    supabase.from('jm_saved').select('vacancy_id').eq('user_id', userId)
  );
  if (error) throwOnError('dbGetSaved', error);
  return (data ?? []).map((r: any) => r.vacancy_id);
}

export async function dbAddSaved(userId: string, vacancyId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbAddSaved', [userId, vacancyId]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_saved').upsert({ user_id: userId, vacancy_id: vacancyId })
  );
  if (error) throwOnError('dbAddSaved', error);
}

export async function dbRemoveSaved(userId: string, vacancyId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbRemoveSaved', [userId, vacancyId]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_saved').delete().eq('user_id', userId).eq('vacancy_id', vacancyId)
  );
  if (error) throwOnError('dbRemoveSaved', error);
}

// ─── Complaints ───────────────────────────────────────────────────────────────

export async function dbFileComplaint(params: {
  reporterId: string;
  reporterPhone: string;
  reporterCompany?: string;
  targetId: string;
  targetPhone: string;
  targetCompany?: string;
  complaintType: 'worker' | 'employer';
  description?: string;
}): Promise<void> {
  if (IS_NATIVE) { await proxy('dbFileComplaint', [params]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_complaints').insert({
      id: uid(),
      reporter_id: params.reporterId,
      reporter_phone: params.reporterPhone,
      reporter_company: params.reporterCompany ?? null,
      target_id: params.targetId,
      target_phone: params.targetPhone,
      target_company: params.targetCompany ?? null,
      complaint_type: params.complaintType,
      description: params.description ?? null,
      created_at: nowISO(),
    })
  );
  if (error) throwOnError('dbFileComplaint', error);
}

// ─── Match logic ──────────────────────────────────────────────────────────────

export async function dbCheckAndCreateMatch(
  vacancyId: string,
  workerId: string
): Promise<{ matched: boolean; chatId?: string }> {
  if (IS_NATIVE) { return proxy<{ matched: boolean; chatId?: string }>('dbCheckAndCreateMatch', [vacancyId, workerId]); }
  const { data: likeRow } = await withTimeout(
    supabase.from('jm_likes').select('*').eq('vacancy_id', vacancyId).eq('worker_id', workerId).maybeSingle()
  );

  if (!likeRow) return { matched: false };
  if (likeRow.is_match) {
    const { data: existingChat } = await withTimeout(
      supabase.from('jm_chats').select('id').eq('vacancy_id', vacancyId).eq('worker_id', workerId).maybeSingle()
    );
    return { matched: false, chatId: existingChat?.id };
  }
  if (!likeRow.worker_liked || likeRow.employer_liked !== true) return { matched: false };

  const [, { data: vac }] = await Promise.all([
    withTimeout(supabase.from('jm_likes').update({ is_match: true, matched_at: nowISO() }).eq('vacancy_id', vacancyId).eq('worker_id', workerId)),
    withTimeout(supabase.from('jm_vacancies').select('*').eq('id', vacancyId).maybeSingle()),
  ]);

  const matchMsg = '🎉 У вас мэтч! Вы подошли друг другу. Познакомьтесь и обсудите детали!';
  const safetyMsg = '🔒 Рекомендуем не переводить общение в сторонние мессенджеры или почту, а продолжить его в чате JobToo: так у мошенников будет меньше шансов вас обмануть.\n\nГде бы вы ни общались — не сообщайте свой CVV-код, код из SMS и не вводите данные карты по ссылке.';

  const chatId = await dbCreateChat(
    workerId,
    likeRow.employer_id,
    vacancyId,
    vac?.title ?? '',
    vac?.company ?? '',
    undefined,
    1,
    1
  );

  const newWorkersFound = (vac?.workers_found || 0) + 1;
  const newStatus = newWorkersFound >= (vac?.workers_needed ?? 999) ? 'closed' : 'open';
  await Promise.all([
    dbInsertMessage(chatId, 'system', matchMsg),
    dbInsertMessage(chatId, 'system_safety', safetyMsg),
    vac
      ? withTimeout(supabase.from('jm_vacancies').update({ workers_found: newWorkersFound, status: newStatus }).eq('id', vacancyId))
      : Promise.resolve(),
  ]);

  return { matched: true, chatId };
}

// ─── Permanent vacancies ─────────────────────────────────────────────────────

function rowToPermVacancy(r: any): PermVacancy {
  return {
    id: r.id,
    employerId: r.employer_id,
    company: r.company,
    title: r.title,
    workType: r.work_type ?? undefined,
    metroLineId: r.metro_line_id ?? undefined,
    metroStation: r.metro_station ?? undefined,
    address: r.address ?? undefined,
    salary: r.salary,
    schedule: r.schedule ?? '',
    description: r.description ?? undefined,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function dbGetPermVacancies(): Promise<PermVacancy[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetPermVacancies'); return d.map(rowToPermVacancy); }
  const { data, error } = await withTimeout(
    supabase.from('jm_perm_vacancies').select('*').eq('status', 'open').order('created_at', { ascending: false })
  );
  if (error) throwOnError('dbGetPermVacancies', error);
  return (data ?? []).map(rowToPermVacancy);
}

export async function dbGetPermVacanciesByEmployer(employerId: string): Promise<PermVacancy[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetPermVacanciesByEmployer', [employerId]); return d.map(rowToPermVacancy); }
  const { data, error } = await withTimeout(
    supabase.from('jm_perm_vacancies').select('*').eq('employer_id', employerId).order('created_at', { ascending: false })
  );
  if (error) throwOnError('dbGetPermVacanciesByEmployer', error);
  return (data ?? []).map(rowToPermVacancy);
}

export async function dbUpsertPermVacancy(v: PermVacancy): Promise<void> {
  const permRow = {
    id: v.id, employer_id: v.employerId, company: v.company, title: v.title,
    work_type: v.workType ?? null, metro_line_id: v.metroLineId ?? null,
    metro_station: v.metroStation ?? null, address: v.address ?? null,
    salary: v.salary, schedule: v.schedule, description: v.description ?? null,
    status: v.status, created_at: v.createdAt,
  };
  if (IS_NATIVE) { await proxy('dbUpsertPermVacancy', [permRow]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_perm_vacancies').upsert(permRow, { onConflict: 'id' })
  );
  if (error) throwOnError('dbUpsertPermVacancy', error);
}

export async function dbClosePermVacancy(id: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbClosePermVacancy', [id]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_perm_vacancies').update({ status: 'closed' }).eq('id', id)
  );
  if (error) throwOnError('dbClosePermVacancy', error);
}

// ─── Permanent applications ───────────────────────────────────────────────────

function rowToPermApp(r: any): PermApplication {
  return {
    id: r.id,
    vacancyId: r.vacancy_id,
    workerId: r.worker_id,
    employerId: r.employer_id,
    status: r.status as PermApplicationStatus,
    createdAt: r.created_at,
  };
}

export async function dbGetPermApplications(userId: string, role: 'worker' | 'employer'): Promise<PermApplication[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetPermApplications', [userId, role]); return d.map(rowToPermApp); }
  const field = role === 'worker' ? 'worker_id' : 'employer_id';
  const { data, error } = await withTimeout(
    supabase.from('jm_perm_applications').select('*').eq(field, userId).order('created_at', { ascending: false })
  );
  if (error) throwOnError('dbGetPermApplications', error);
  return (data ?? []).map(rowToPermApp);
}

export async function dbGetPermApplicationsForVacancy(vacancyId: string): Promise<PermApplication[]> {
  if (IS_NATIVE) { const d = await proxy<any[]>('dbGetPermApplicationsForVacancy', [vacancyId]); return d.map(rowToPermApp); }
  const { data, error } = await withTimeout(
    supabase.from('jm_perm_applications').select('*').eq('vacancy_id', vacancyId).order('created_at', { ascending: false })
  );
  if (error) throwOnError('dbGetPermApplicationsForVacancy', error);
  return (data ?? []).map(rowToPermApp);
}

export async function dbApplyPermVacancy(vacancyId: string, workerId: string, employerId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbApplyPermVacancy', [vacancyId, workerId, employerId]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_perm_applications').upsert({
      id: uid(),
      vacancy_id: vacancyId,
      worker_id: workerId,
      employer_id: employerId,
      status: 'pending',
      created_at: nowISO(),
    }, { onConflict: 'vacancy_id,worker_id' })
  );
  if (error) throwOnError('dbApplyPermVacancy', error);
}

export async function dbSetPermApplicationStatus(appId: string, status: PermApplicationStatus): Promise<void> {
  if (IS_NATIVE) { await proxy('dbSetPermApplicationStatus', [appId, status]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_perm_applications').update({ status }).eq('id', appId)
  );
  if (error) throwOnError('dbSetPermApplicationStatus', error);
}

// ─── Permanent saved ──────────────────────────────────────────────────────────

export async function dbGetPermSaved(userId: string): Promise<string[]> {
  if (IS_NATIVE) { return proxy<string[]>('dbGetPermSaved', [userId]); }
  const { data, error } = await withTimeout(
    supabase.from('jm_perm_saved').select('vacancy_id').eq('user_id', userId)
  );
  if (error) throwOnError('dbGetPermSaved', error);
  return (data ?? []).map((r: any) => r.vacancy_id);
}

export async function dbAddPermSaved(userId: string, vacancyId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbAddPermSaved', [userId, vacancyId]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_perm_saved').upsert({ user_id: userId, vacancy_id: vacancyId })
  );
  if (error) throwOnError('dbAddPermSaved', error);
}

export async function dbRemovePermSaved(userId: string, vacancyId: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbRemovePermSaved', [userId, vacancyId]); return; }
  const { error } = await withTimeout(
    supabase.from('jm_perm_saved').delete().eq('user_id', userId).eq('vacancy_id', vacancyId)
  );
  if (error) throwOnError('dbRemovePermSaved', error);
}

// ─── Ratings ──────────────────────────────────────────────────────────────────

export interface UserRating {
  id: string;
  fromUserId: string;
  rating: number;
  reviewText?: string;
  role: 'worker' | 'employer';
  createdAt: string;
  vacancyId: string;
}

export async function dbGetRatingsForUser(toUserId: string): Promise<UserRating[]> {
  if (IS_NATIVE) {
    const d = await proxy<any[]>('dbGetRatingsForUser', [toUserId]);
    return d.map((r: any) => ({ id: r.id, fromUserId: r.from_user_id, rating: r.rating, reviewText: r.review_text ?? undefined, role: r.role, createdAt: r.created_at, vacancyId: r.vacancy_id }));
  }
  const { data, error } = await withTimeout(
    supabase.from('jm_ratings').select('*').eq('to_user_id', toUserId).order('created_at', { ascending: false })
  );
  if (error) throwOnError('dbGetRatingsForUser', error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    rating: r.rating,
    reviewText: r.review_text ?? undefined,
    role: r.role,
    createdAt: r.created_at,
    vacancyId: r.vacancy_id,
  }));
}

// ─── Shift confirmation ───────────────────────────────────────────────────────

export async function dbConfirmShift(likeId: string, _role: 'employer'): Promise<{ bothConfirmed: boolean }> {
  if (IS_NATIVE) { return proxy<{ bothConfirmed: boolean }>('dbConfirmShift', [likeId]); }
  await withTimeout(
    supabase.from('jm_likes').update({
      employer_confirmed: true,
      worker_confirmed: true,
      shift_completed: true,
    }).eq('id', likeId)
  );
  return { bothConfirmed: true };
}

// ─── Rating & match deletion ──────────────────────────────────────────────────

export async function dbSubmitRatingAndMaybeDelete(params: {
  likeId: string;
  fromUserId: string;
  toUserId: string;
  vacancyId: string;
  rating: number;
  role: 'worker' | 'employer';
  reviewText?: string;
}): Promise<{ bothRated: boolean }> {
  if (IS_NATIVE) { return proxy<{ bothRated: boolean }>('dbSubmitRatingAndMaybeDelete', [params]); }
  const { likeId, fromUserId, toUserId, vacancyId, rating, role, reviewText } = params;

  await withTimeout(
    supabase.from('jm_ratings').insert({
      id: uid(),
      from_user_id: fromUserId,
      to_user_id: toUserId,
      vacancy_id: vacancyId,
      like_id: likeId,
      rating,
      role,
      review_text: reviewText ?? null,
      created_at: nowISO(),
    })
  );

  const ratedField = role === 'worker' ? 'worker_rated' : 'employer_rated';
  await withTimeout(supabase.from('jm_likes').update({ [ratedField]: true }).eq('id', likeId));

  const { data: allRatings } = await withTimeout(
    supabase.from('jm_ratings').select('rating').eq('to_user_id', toUserId)
  );
  if (allRatings && allRatings.length > 0) {
    const avg = allRatings.reduce((s: number, r: any) => s + r.rating, 0) / allRatings.length;
    await withTimeout(
      supabase.from('jm_users').update({
        avg_rating: Math.round(avg * 100) / 100,
        rating_count: allRatings.length,
      }).eq('id', toUserId)
    );
  }

  const { data: likeRow } = await withTimeout(
    supabase.from('jm_likes').select('worker_rated,employer_rated').eq('id', likeId).maybeSingle()
  );

  return { bothRated: !!(likeRow?.worker_rated && likeRow?.employer_rated) };
}

// ─── Push tokens ──────────────────────────────────────────────────────────────

export async function dbSavePushToken(userId: string, token: string): Promise<void> {
  if (IS_NATIVE) { await proxy('dbSavePushToken', [userId, token]); return; }
  await withTimeout(supabase.from('jm_users').update({ push_token: token }).eq('id', userId));
}

export async function dbGetPushToken(userId: string): Promise<string | null> {
  if (IS_NATIVE) { return proxy<string | null>('dbGetPushToken', [userId]); }
  const { data } = await withTimeout(
    supabase.from('jm_users').select('push_token').eq('id', userId).maybeSingle()
  );
  return data?.push_token ?? null;
}

export async function dbGetWorkerTokensByMetro(metroStation: string): Promise<{ id: string; push_token: string }[]> {
  if (IS_NATIVE) { return proxy<{ id: string; push_token: string }[]>('dbGetWorkerTokensByMetro', [metroStation]); }
  const { data } = await withTimeout(
    supabase
      .from('jm_users')
      .select('id, push_token')
      .eq('role', 'worker')
      .eq('metro_station', metroStation)
      .not('push_token', 'is', null)
  );
  return (data ?? []) as { id: string; push_token: string }[];
}
