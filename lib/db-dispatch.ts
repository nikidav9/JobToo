import type { SupabaseClient } from '@supabase/supabase-js';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nowISO(): string {
  return new Date().toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatch(supabase: SupabaseClient, fn: string, args: any[]): Promise<unknown> {
  switch (fn) {
    // ─── Users ──────────────────────────────────────────────────────────────

    case 'dbGetUserById': {
      const [id] = args;
      const { data } = await supabase.from('jm_users').select('*').eq('id', id).maybeSingle();
      return data;
    }

    case 'dbGetUsers': {
      const { data, error } = await supabase
        .from('jm_users')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbUpsertUser': {
      const [row] = args;
      const { error } = await supabase.from('jm_users').upsert(row, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbDeleteUser': {
      const [id] = args;
      await supabase.from('jm_users').delete().eq('id', id);
      return null;
    }

    case 'dbCheckPhoneExists': {
      const [phone] = args;
      const { data } = await supabase
        .from('jm_users')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      return !!data;
    }

    case 'dbGetUserByPhone': {
      const [phone] = args;
      const { data, error } = await supabase
        .from('jm_users')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }

    // ─── Vacancies ───────────────────────────────────────────────────────────

    case 'dbGetVacancies': {
      const { data, error } = await supabase
        .from('jm_vacancies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbUpsertVacancy': {
      const [row] = args;
      const { error } = await supabase.from('jm_vacancies').upsert(row, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbUpdateVacancy': {
      const [id, patch] = args;
      const { error } = await supabase.from('jm_vacancies').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
      return null;
    }

    // ─── Likes ───────────────────────────────────────────────────────────────

    case 'dbGetLikes': {
      const { data, error } = await supabase.from('jm_likes').select('*');
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbGetLikesForUser': {
      const [userId, role] = args;
      const field = role === 'worker' ? 'worker_id' : 'employer_id';
      const { data, error } = await supabase.from('jm_likes').select('*').eq(field, userId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbGetLikesByVacancy': {
      const [vacancyId] = args;
      const { data, error } = await supabase
        .from('jm_likes')
        .select('*')
        .eq('vacancy_id', vacancyId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbGetLikeByVacancyWorker': {
      const [vacancyId, workerId] = args;
      const { data } = await supabase
        .from('jm_likes')
        .select('*')
        .eq('vacancy_id', vacancyId)
        .eq('worker_id', workerId)
        .maybeSingle();
      return data;
    }

    case 'dbUpsertLike': {
      const [vacancyId, workerId, employerId, updates] = args;
      const { data: existing } = await supabase
        .from('jm_likes')
        .select('*')
        .eq('vacancy_id', vacancyId)
        .eq('worker_id', workerId)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      const { data: written, error } = await supabase
        .from('jm_likes')
        .upsert(row, { onConflict: 'vacancy_id,worker_id' })
        .select();
      if (error) throw new Error(error.message);
      if (!written || written.length === 0) throw new Error('Like not saved: permission denied');
      return row;
    }

    case 'dbRemoveLike': {
      const [vacancyId, workerId] = args;
      const { error } = await supabase
        .from('jm_likes')
        .delete()
        .eq('vacancy_id', vacancyId)
        .eq('worker_id', workerId);
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbDeleteMatch': {
      const [likeId] = args;
      const { error } = await supabase.from('jm_likes').delete().eq('id', likeId);
      if (error) throw new Error(error.message);
      return null;
    }

    // ─── Messages ────────────────────────────────────────────────────────────

    case 'dbGetMessages': {
      const [chatId] = args;
      const { data, error } = await supabase
        .from('jm_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbInsertMessage': {
      const [chatId, senderId, text] = args;
      const msg = { id: uid(), chat_id: chatId, sender_id: senderId, text, created_at: nowISO() };
      const { error } = await supabase.from('jm_messages').insert(msg);
      if (error) throw new Error(error.message);
      return msg;
    }

    // ─── Chats ───────────────────────────────────────────────────────────────

    case 'dbGetChats': {
      const [userId, role] = args;
      const field = role === 'worker' ? 'worker_id' : 'employer_id';
      const { data, error } = await supabase
        .from('jm_chats')
        .select('*')
        .eq(field, userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      const chatRows = data ?? [];
      if (chatRows.length === 0) return [];

      const chatIds = chatRows.map((r: { id: string }) => r.id);
      const { data: allMsgs } = await supabase
        .from('jm_messages')
        .select('*')
        .in('chat_id', chatIds)
        .order('created_at', { ascending: false });

      const lastMsgByChat = new Map<string, unknown>();
      for (const msg of (allMsgs ?? []) as Array<{ chat_id: string }>) {
        if (!lastMsgByChat.has(msg.chat_id)) lastMsgByChat.set(msg.chat_id, msg);
      }

      return chatRows.map((row: { id: string }) => ({
        ...row,
        _last_msg: lastMsgByChat.get(row.id) ?? null,
      }));
    }

    case 'dbGetChatById': {
      const [chatId] = args;
      const { data } = await supabase
        .from('jm_chats')
        .select('*')
        .eq('id', chatId)
        .maybeSingle();
      if (!data) return null;
      const { data: msgs } = await supabase
        .from('jm_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      return { ...data, _messages: msgs ?? [] };
    }

    case 'dbCreateChat': {
      const [
        workerId,
        employerId,
        vacancyId,
        vacTitle,
        companyName,
        systemMessage,
        initialUnreadWorker,
        initialUnreadEmployer,
      ] = args;
      const { data: existing } = await supabase
        .from('jm_chats')
        .select('id')
        .eq('vacancy_id', vacancyId)
        .eq('worker_id', workerId)
        .maybeSingle();
      if (existing) return (existing as { id: string }).id;

      const chatId = uid();
      const { error } = await supabase.from('jm_chats').insert({
        id: chatId,
        vacancy_id: vacancyId,
        worker_id: workerId,
        employer_id: employerId,
        vac_title: vacTitle,
        company_name: companyName,
        unread_worker: initialUnreadWorker ?? 0,
        unread_employer: initialUnreadEmployer ?? 0,
        created_at: nowISO(),
      });
      if (error) throw new Error(error.message);

      if (systemMessage) {
        await supabase.from('jm_messages').insert({
          id: uid(),
          chat_id: chatId,
          sender_id: 'system',
          text: systemMessage,
          created_at: nowISO(),
        });
      }
      return chatId;
    }

    case 'dbMarkRead': {
      const [chatId, role] = args;
      const field = role === 'worker' ? 'unread_worker' : 'unread_employer';
      const { error } = await supabase.from('jm_chats').update({ [field]: 0 }).eq('id', chatId);
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbIncrementUnread': {
      const [chatId, forRole] = args;
      const { data } = await supabase
        .from('jm_chats')
        .select('unread_worker,unread_employer')
        .eq('id', chatId)
        .maybeSingle();
      if (!data) return null;
      const field = forRole === 'worker' ? 'unread_worker' : 'unread_employer';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const cur = forRole === 'worker' ? d.unread_worker : d.unread_employer;
      await supabase.from('jm_chats').update({ [field]: (cur ?? 0) + 1 }).eq('id', chatId);
      return null;
    }

    case 'dbDeleteChat': {
      const [chatId] = args;
      await supabase.from('jm_messages').delete().eq('chat_id', chatId);
      await supabase.from('jm_chats').delete().eq('id', chatId);
      return null;
    }

    // ─── Saved ───────────────────────────────────────────────────────────────

    case 'dbGetSaved': {
      const [userId] = args;
      const { data, error } = await supabase
        .from('jm_saved')
        .select('vacancy_id')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ vacancy_id: string }>).map((r) => r.vacancy_id);
    }

    case 'dbAddSaved': {
      const [userId, vacancyId] = args;
      const { error } = await supabase
        .from('jm_saved')
        .upsert({ user_id: userId, vacancy_id: vacancyId });
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbRemoveSaved': {
      const [userId, vacancyId] = args;
      const { error } = await supabase
        .from('jm_saved')
        .delete()
        .eq('user_id', userId)
        .eq('vacancy_id', vacancyId);
      if (error) throw new Error(error.message);
      return null;
    }

    // ─── Complaints ──────────────────────────────────────────────────────────

    case 'dbFileComplaint': {
      const [params] = args;
      const { error } = await supabase.from('jm_complaints').insert({
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
      });
      if (error) throw new Error(error.message);
      return null;
    }

    // ─── Match logic ─────────────────────────────────────────────────────────

    case 'dbCheckAndCreateMatch': {
      const [vacancyId, workerId] = args;
      const { data: likeRow } = await supabase
        .from('jm_likes')
        .select('*')
        .eq('vacancy_id', vacancyId)
        .eq('worker_id', workerId)
        .maybeSingle();

      if (!likeRow) return { matched: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const like = likeRow as any;
      if (like.is_match) {
        const { data: existingChat } = await supabase
          .from('jm_chats')
          .select('id')
          .eq('vacancy_id', vacancyId)
          .eq('worker_id', workerId)
          .maybeSingle();
        return { matched: false, chatId: (existingChat as { id?: string } | null)?.id };
      }
      if (!like.worker_liked || like.employer_liked !== true) return { matched: false };

      const [, { data: vac }] = await Promise.all([
        supabase
          .from('jm_likes')
          .update({ is_match: true, matched_at: nowISO() })
          .eq('vacancy_id', vacancyId)
          .eq('worker_id', workerId),
        supabase.from('jm_vacancies').select('*').eq('id', vacancyId).maybeSingle(),
      ]);

      const { data: existingChat2 } = await supabase
        .from('jm_chats')
        .select('id')
        .eq('vacancy_id', vacancyId)
        .eq('worker_id', workerId)
        .maybeSingle();

      const chatId = (existingChat2 as { id?: string } | null)?.id ?? uid();
      if (!existingChat2) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = vac as any;
        await supabase.from('jm_chats').insert({
          id: chatId,
          vacancy_id: vacancyId,
          worker_id: workerId,
          employer_id: like.employer_id,
          vac_title: v?.title ?? '',
          company_name: v?.company ?? '',
          unread_worker: 1,
          unread_employer: 1,
          created_at: nowISO(),
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = vac as any;
      const newWorkersFound = (v?.workers_found || 0) + 1;
      const newStatus = newWorkersFound >= (v?.workers_needed ?? 999) ? 'closed' : 'open';

      const matchMsg = '🎉 У вас мэтч! Вы подошли друг другу. Познакомьтесь и обсудите детали!';
      const safetyMsg =
        '🔒 Рекомендуем не переводить общение в сторонние мессенджеры или почту, а продолжить его в чате JobToo: так у мошенников будет меньше шансов вас обмануть.\n\nГде бы вы ни общались — не сообщайте свой CVV-код, код из SMS и не вводите данные карты по ссылке.';

      await Promise.all([
        supabase.from('jm_messages').insert({
          id: uid(), chat_id: chatId, sender_id: 'system', text: matchMsg, created_at: nowISO(),
        }),
        supabase.from('jm_messages').insert({
          id: uid(), chat_id: chatId, sender_id: 'system_safety', text: safetyMsg, created_at: nowISO(),
        }),
        vac
          ? supabase
              .from('jm_vacancies')
              .update({ workers_found: newWorkersFound, status: newStatus })
              .eq('id', vacancyId)
          : Promise.resolve(),
      ]);

      return { matched: true, chatId };
    }

    // ─── Permanent vacancies ─────────────────────────────────────────────────

    case 'dbGetPermVacancies': {
      const { data, error } = await supabase
        .from('jm_perm_vacancies')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbGetPermVacanciesByEmployer': {
      const [employerId] = args;
      const { data, error } = await supabase
        .from('jm_perm_vacancies')
        .select('*')
        .eq('employer_id', employerId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbUpsertPermVacancy': {
      const [row] = args;
      const { error } = await supabase.from('jm_perm_vacancies').upsert(row, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbClosePermVacancy': {
      const [id] = args;
      const { error } = await supabase
        .from('jm_perm_vacancies')
        .update({ status: 'closed' })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return null;
    }

    // ─── Permanent applications ───────────────────────────────────────────────

    case 'dbGetPermApplications': {
      const [userId, role] = args;
      const field = role === 'worker' ? 'worker_id' : 'employer_id';
      const { data, error } = await supabase
        .from('jm_perm_applications')
        .select('*')
        .eq(field, userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbGetPermApplicationsForVacancy': {
      const [vacancyId] = args;
      const { data, error } = await supabase
        .from('jm_perm_applications')
        .select('*')
        .eq('vacancy_id', vacancyId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    case 'dbApplyPermVacancy': {
      const [vacancyId, workerId, employerId] = args;
      const { error } = await supabase.from('jm_perm_applications').upsert(
        {
          id: uid(),
          vacancy_id: vacancyId,
          worker_id: workerId,
          employer_id: employerId,
          status: 'pending',
          created_at: nowISO(),
        },
        { onConflict: 'vacancy_id,worker_id' }
      );
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbSetPermApplicationStatus': {
      const [appId, status] = args;
      const { error } = await supabase
        .from('jm_perm_applications')
        .update({ status })
        .eq('id', appId);
      if (error) throw new Error(error.message);
      return null;
    }

    // ─── Permanent saved ─────────────────────────────────────────────────────

    case 'dbGetPermSaved': {
      const [userId] = args;
      const { data, error } = await supabase
        .from('jm_perm_saved')
        .select('vacancy_id')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ vacancy_id: string }>).map((r) => r.vacancy_id);
    }

    case 'dbAddPermSaved': {
      const [userId, vacancyId] = args;
      const { error } = await supabase
        .from('jm_perm_saved')
        .upsert({ user_id: userId, vacancy_id: vacancyId });
      if (error) throw new Error(error.message);
      return null;
    }

    case 'dbRemovePermSaved': {
      const [userId, vacancyId] = args;
      const { error } = await supabase
        .from('jm_perm_saved')
        .delete()
        .eq('user_id', userId)
        .eq('vacancy_id', vacancyId);
      if (error) throw new Error(error.message);
      return null;
    }

    // ─── Ratings ─────────────────────────────────────────────────────────────

    case 'dbGetRatingsForUser': {
      const [toUserId] = args;
      const { data, error } = await supabase
        .from('jm_ratings')
        .select('*')
        .eq('to_user_id', toUserId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    }

    // ─── Shift confirmation ───────────────────────────────────────────────────

    case 'dbConfirmShift': {
      const [likeId] = args;
      await supabase.from('jm_likes').update({
        employer_confirmed: true,
        worker_confirmed: true,
        shift_completed: true,
      }).eq('id', likeId);
      return { bothConfirmed: true };
    }

    // ─── Rating + match cleanup ───────────────────────────────────────────────

    case 'dbSubmitRatingAndMaybeDelete': {
      const [params] = args;
      const { likeId, fromUserId, toUserId, vacancyId, rating, role, reviewText } = params;

      await supabase.from('jm_ratings').insert({
        id: uid(),
        from_user_id: fromUserId,
        to_user_id: toUserId,
        vacancy_id: vacancyId,
        like_id: likeId,
        rating,
        role,
        review_text: reviewText ?? null,
        created_at: nowISO(),
      });

      const ratedField = role === 'worker' ? 'worker_rated' : 'employer_rated';
      await supabase.from('jm_likes').update({ [ratedField]: true }).eq('id', likeId);

      const { data: allRatings } = await supabase
        .from('jm_ratings')
        .select('rating')
        .eq('to_user_id', toUserId);
      if (allRatings && allRatings.length > 0) {
        const avg =
          (allRatings as Array<{ rating: number }>).reduce((s, r) => s + r.rating, 0) /
          allRatings.length;
        await supabase.from('jm_users').update({
          avg_rating: Math.round(avg * 100) / 100,
          rating_count: allRatings.length,
        }).eq('id', toUserId);
      }

      const { data: likeRow } = await supabase
        .from('jm_likes')
        .select('worker_rated,employer_rated')
        .eq('id', likeId)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lr = likeRow as any;
      return { bothRated: !!(lr?.worker_rated && lr?.employer_rated) };
    }

    // ─── Push tokens ─────────────────────────────────────────────────────────

    case 'dbSavePushToken': {
      const [userId, token] = args;
      await supabase.from('jm_users').update({ push_token: token }).eq('id', userId);
      return null;
    }

    case 'dbGetPushToken': {
      const [userId] = args;
      const { data } = await supabase
        .from('jm_users')
        .select('push_token')
        .eq('id', userId)
        .maybeSingle();
      return (data as { push_token?: string } | null)?.push_token ?? null;
    }

    case 'dbGetWorkerTokensByMetro': {
      const [metroStation] = args;
      const { data } = await supabase
        .from('jm_users')
        .select('id, push_token')
        .eq('role', 'worker')
        .eq('metro_station', metroStation)
        .not('push_token', 'is', null);
      return data ?? [];
    }

    default:
      throw new Error(`Unknown function: ${fn}`);
  }
}
