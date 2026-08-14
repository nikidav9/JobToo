-- Базовая схема: то, чего не было в миграциях.
--
-- Файл 001 начинается с alter table jm_users — то есть все миграции
-- предполагают, что таблицы уже есть. Их когда-то завели руками в панели
-- Supabase, и в репозиторий это не попало. При переносе на свой сервер
-- выяснилось буквально: relation "jm_users" does not exist.
--
-- Описание снято с работающего облака через OpenAPI, который отдаёт
-- PostgREST: там перечислены все колонки с типами, обязательностью и
-- первичными ключами. Это надёжнее, чем восстанавливать схему по данным.
--
-- Внешние ключи здесь намеренно не воспроизводятся: в облаке их сняли
-- (см. 003_drop_employer_fk.sql), и возвращать их при переносе — значит
-- поменять поведение вместе с переездом. Одно за раз.

create table if not exists jm_users (
    id                           text,
    role                         text not null,
    phone                        text not null,
    password                     text,
    first_name                   text not null,
    last_name                    text not null,
    age                          integer,
    metro_line_id                text,
    metro_station                text,
    work_types                   text[],
    company                      text,
    bio                          text,
    avatar_url                   text,
    avg_rating                   numeric,
    rating_count                 integer,
    is_blocked                   boolean,
    created_at                   timestamptz not null,
    push_token                   text,
    telegram_id                  bigint,
    last_seen_at                 timestamptz,
    nudge_off                    boolean not null,
    primary key (id)
);

create table if not exists jm_vacancies (
    id                           text,
    employer_id                  text not null,
    company                      text not null,
    title                        text not null,
    work_type                    text not null,
    work_type_label              text not null,
    metro_line_id                text,
    metro_station                text,
    date                         text not null,
    time_start                   text not null,
    time_end                     text not null,
    salary                       numeric,
    norms_and_pay                text,
    address                      text,
    workers_needed               integer not null,
    workers_found                integer not null,
    is_urgent                    boolean,
    no_experience_needed         boolean,
    conditions                   text,
    status                       text not null,
    created_at                   timestamptz not null,
    lat                          double precision,
    lng                          double precision,
    updated_at                   timestamptz,
    primary key (id)
);

create table if not exists jm_perm_vacancies (
    id                           text,
    employer_id                  text not null,
    company                      text not null,
    title                        text not null,
    metro_line_id                text,
    metro_station                text,
    address                      text,
    salary                       numeric not null,
    schedule                     text not null,
    description                  text,
    status                       text not null,
    created_at                   timestamptz not null,
    work_type                    text,
    lat                          double precision,
    lng                          double precision,
    updated_at                   timestamptz,
    primary key (id)
);

create table if not exists jm_bulletins (
    id                           text,
    employer_id                  text not null,
    company                      text not null,
    work_type                    text not null,
    date                         text not null,
    time_start                   text not null,
    time_end                     text not null,
    metro                        text not null,
    address                      text not null,
    comment                      text,
    status                       text not null,
    created_at                   timestamptz not null,
    lat                          double precision,
    lng                          double precision,
    primary key (id)
);

create table if not exists jm_settings (
    key                          text,
    value                        text not null,
    updated_at                   timestamptz not null,
    primary key (key)
);

create table if not exists jm_likes (
    id                           text,
    vacancy_id                   text not null,
    worker_id                    text not null,
    employer_id                  text not null,
    worker_liked                 boolean,
    employer_liked               boolean,
    worker_skipped               boolean,
    is_match                     boolean,
    matched_at                   timestamptz,
    worker_confirmed             boolean,
    employer_confirmed           boolean,
    worker_rated                 boolean,
    employer_rated               boolean,
    shift_completed              boolean,
    created_at                   timestamptz not null,
    cancelled                    boolean not null,
    primary key (id)
);

create table if not exists jm_chats (
    id                           text,
    vacancy_id                   text not null,
    worker_id                    text not null,
    employer_id                  text not null,
    vac_title                    text not null,
    company_name                 text not null,
    unread_worker                integer,
    unread_employer              integer,
    created_at                   timestamptz not null,
    bulletin_id                  text,
    is_locked                    boolean not null,
    worker_slot_id               text,
    primary key (id)
);

create table if not exists jm_messages (
    id                           text,
    chat_id                      text not null,
    sender_id                    text not null,
    text                         text not null,
    created_at                   timestamptz not null,
    primary key (id)
);

create table if not exists jm_saved (
    id                           text,
    user_id                      text not null,
    vacancy_id                   text not null,
    created_at                   timestamptz not null,
    primary key (id)
);

create table if not exists jm_perm_saved (
    id                           text,
    user_id                      text not null,
    vacancy_id                   text not null,
    created_at                   timestamptz not null,
    primary key (id)
);

create table if not exists jm_perm_applications (
    id                           text,
    vacancy_id                   text not null,
    worker_id                    text not null,
    employer_id                  text not null,
    status                       text not null,
    created_at                   timestamptz not null,
    primary key (id)
);

create table if not exists jm_notifications (
    id                           text,
    user_id                      text not null,
    title                        text not null,
    body                         text not null,
    is_read                      boolean,
    created_at                   timestamptz,
    type                         text,
    payload                      jsonb,
    primary key (id)
);

create table if not exists jm_ratings (
    id                           text,
    from_user_id                 text not null,
    to_user_id                   text not null,
    vacancy_id                   text not null,
    like_id                      text not null,
    rating                       integer not null,
    role                         text not null,
    review_text                  text,
    created_at                   timestamptz not null,
    primary key (id)
);

create table if not exists jm_complaints (
    id                           text,
    reporter_id                  text not null,
    reporter_phone               text not null,
    reporter_company             text,
    target_id                    text not null,
    target_phone                 text not null,
    target_company               text,
    complaint_type               text not null,
    description                  text,
    created_at                   timestamptz not null,
    primary key (id)
);

create table if not exists jm_bot_messages (
    id                           text,
    user_id                      text,
    telegram_id                  bigint not null,
    name                         text,
    username                     text,
    text                         text not null,
    created_at                   timestamptz not null,
    answered                     boolean not null,
    direction                    text not null,
    topic                        text,
    primary key (id)
);

create table if not exists jm_support_messages (
    id                           text,
    user_id                      text not null,
    direction                    text not null,
    text                         text not null,
    created_at                   timestamptz not null,
    read_at                      timestamptz,
    primary key (id)
);

create table if not exists jm_support_threads (
    user_id                      text,
    closed_at                    timestamptz,
    updated_at                   timestamptz not null,
    primary key (user_id)
);

create table if not exists jm_web_push_subscriptions (
    user_id                      text,
    endpoint                     text not null,
    p256dh                       text,
    auth                         text,
    updated_at                   timestamptz,
    primary key (user_id)
);

create table if not exists jm_vacancy_views (
    vacancy_id                   text,
    worker_id                    text,
    viewed_at                    timestamptz,
    primary key (vacancy_id, worker_id)
);

create table if not exists jm_perm_vacancy_views (
    vacancy_id                   text,
    worker_id                    text,
    viewed_at                    timestamptz,
    primary key (vacancy_id, worker_id)
);

create table if not exists jm_worker_slots (
    id                           text,
    worker_id                    text not null,
    worker_name                  text not null,
    work_type                    text not null,
    date                         text not null,
    time_start                   text not null,
    time_end                     text not null,
    metro                        text not null,
    comment                      text,
    status                       text not null,
    created_at                   text not null,
    primary key (id)
);
