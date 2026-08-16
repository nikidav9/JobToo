-- Удаление аккаунта, которое действительно удаляет.
--
-- До этого кнопка «Удалить аккаунт» делала ровно одно:
--     delete from jm_users where id = ...
-- Одну строку. Человек видел «Аккаунт удалён» и уходил, а в базе оставались
-- его переписка, фотографии и голосовые из чатов, отклики, отзывы, жалобы,
-- обращения в поддержку, уведомления и просмотры вакансий.
--
-- При этом оба документа, которые он подписал при регистрации, обещают
-- обратное: «данные хранятся до момента удаления аккаунта», а отозвать
-- согласие предлагают именно этой кнопкой.
--
-- Каскадов, на которые можно было бы положиться, в базе нет ни одного.
-- Единственный `on delete cascade` описан в 004_jm_notifications.sql, но не
-- существует: таблица уже была заведена в 000_base_schema.sql — без внешнего
-- ключа и с типом text вместо uuid, — поэтому `create table if not exists`
-- прошла мимо, ничего не сделав и ни на что не пожаловавшись.
--
-- ── Что происходит здесь ──────────────────────────────────────────────────
--
-- Своё — стирается. Чужое — обезличивается.
--
-- Стереть можно то, что принадлежит человеку целиком: закладки, уведомления,
-- просмотры, подписку на уведомления, переписку с ботом, обращения в
-- поддержку. Никто, кроме него, этого не видел.
--
-- А вот переписка в чате, отклик на смену, отзыв о работодателе и сама
-- выложенная смена — это уже общая история. Стереть её значит забрать чужое:
-- у второй стороны пропадёт разговор, у работодателя — рейтинг, у работника —
-- подтверждение, что он эту смену отработал. Поэтому строки остаются, но
-- перестают указывать на человека: имя, фамилия, телефон, фотография и
-- профиль исчезают, и на их месте появляется «Удалённый пользователь».
--
-- Сама строка в jm_users не удаляется, а обнуляется. Так надёжнее: удали её —
-- и все ссылки на неё повиснут в пустоту, а приложение начнёт показывать
-- пустые имена там, где раньше был собеседник. Оставшаяся строка не содержит
-- персональных данных, то есть это уже не данные о человеке.
--
-- Телефон освобождается: по нему можно зарегистрироваться заново, и это будет
-- новый человек с новым идентификатором.

create or replace function jm_delete_account(uid text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    stamp text := 'deleted:' || uid;
    wiped jsonb;
begin
    if uid is null or uid = '' then
        raise exception 'jm_delete_account: нужен идентификатор';
    end if;

    if not exists (select 1 from jm_users where id = uid) then
        return jsonb_build_object('удалён', false, 'причина', 'нет такого пользователя');
    end if;

    -- ── Своё: стираем ────────────────────────────────────────────────────
    delete from jm_notifications          where user_id   = uid;
    delete from jm_saved                  where user_id   = uid;
    delete from jm_perm_saved             where user_id   = uid;
    delete from jm_vacancy_views          where worker_id = uid;
    delete from jm_perm_vacancy_views     where worker_id = uid;
    delete from jm_web_push_subscriptions where user_id   = uid;
    delete from jm_bot_messages           where user_id   = uid;
    delete from jm_support_messages       where user_id   = uid;
    delete from jm_support_threads        where user_id   = uid;

    -- Запись о согласии уходит вместе с человеком: согласие отозвано, и
    -- хранить его дальше не на что.
    --
    -- Через to_regclass, потому что таблицу заводит следующая миграция, 033.
    -- Тело функции проверяется не при создании, а при вызове, так что прямая
    -- ссылка прошла бы молча — и сломалась бы ровно в тот момент, когда 033
    -- почему-либо не докатилась, а человек нажал «удалить».
    if to_regclass('public.jm_consents') is not null then
        execute 'delete from jm_consents where user_id = $1' using uid;
    end if;

    -- Свободные слоты — предложение выйти на смену, которого больше нет.
    -- Имя работника скопировано прямо в строку, так что стираем целиком.
    delete from jm_worker_slots           where worker_id = uid;

    -- ── Чужое: обезличиваем ──────────────────────────────────────────────

    -- В жалобах телефоны скопированы в саму строку и через профиль не
    -- подтянутся — их нужно затирать отдельно. Сами жалобы остаются:
    -- это история модерации, и по ней разбираются с обеими сторонами.
    update jm_complaints set reporter_phone = stamp where reporter_id = uid;
    update jm_complaints set target_phone   = stamp where target_id   = uid;

    -- Остальное указывает на человека через jm_users, поэтому обезличивается
    -- само, как только обнулится строка ниже: сообщения, чаты, отклики,
    -- заявки, отзывы, вакансии и смены.

    -- ── Сам человек ──────────────────────────────────────────────────────
    update jm_users set
        first_name    = 'Удалённый',
        last_name     = 'пользователь',
        -- Телефон обязателен и уникален, поэтому не пустой, а помеченный.
        -- Прежний номер освобождается для повторной регистрации.
        phone         = stamp,
        password      = null,
        age           = null,
        metro_line_id = null,
        metro_station = null,
        work_types    = null,
        company       = null,
        bio           = null,
        avatar_url    = null,
        push_token    = null,
        telegram_id   = null,
        last_seen_at  = null,
        -- Заблокирован, чтобы обезличенная строка не всплывала в ленте и
        -- поиске как живой человек, которому можно написать.
        is_blocked    = true,
        nudge_off     = true
    where id = uid;

    select jsonb_build_object(
        'удалён', true,
        'осталось_обезличенным', jsonb_build_object(
            'сообщений',  (select count(*) from jm_messages          where sender_id   = uid),
            'откликов',   (select count(*) from jm_likes             where worker_id   = uid
                                                                        or employer_id = uid),
            'заявок',     (select count(*) from jm_perm_applications where worker_id   = uid
                                                                        or employer_id = uid),
            'отзывов',    (select count(*) from jm_ratings           where from_user_id = uid
                                                                        or to_user_id   = uid),
            'вакансий',   (select count(*) from jm_vacancies         where employer_id = uid)
                        + (select count(*) from jm_perm_vacancies    where employer_id = uid)
        )
    ) into wiped;

    return wiped;
end;
$$;

comment on function jm_delete_account(text) is
    'Удаление аккаунта: своё стирает, чужое обезличивает. См. миграцию 032.';

-- Вызывать может только служебная роль: под ней ходит php-proxy, а он
-- проверяет, что человек удаляет именно себя. Отдавать эту функцию anon
-- нельзя — по чужому идентификатору она стёрла бы чужой аккаунт.
revoke all on function jm_delete_account(text) from public, anon, authenticated;
grant execute on function jm_delete_account(text) to service_role;

notify pgrst, 'reload schema';
