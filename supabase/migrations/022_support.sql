-- Поддержка: переписка человека с нами прямо в приложении.
--
-- До сих пор написать нам было некуда. Забыл пароль — в форме входа адрес
-- почты, на которую никто не смотрит. Непонятно, как откликнуться, — некому
-- сказать. Обманули на смене — тем более. Часть людей нашла бота и написала
-- туда, но это случайность: бот заводился для уведомлений.
--
-- Тред один на человека, как переписка: заводить «тикеты» с номерами значит
-- заставлять человека объяснять всё заново каждый раз.

create table if not exists jm_support_messages (
    id         text        primary key,
    user_id    text        not null,
    direction  text        not null default 'in',   -- 'in' — от человека, 'out' — от нас
    text       text        not null,
    created_at timestamptz not null default now(),
    read_at    timestamptz                          -- когда прочитано получателем
);

create index if not exists jm_support_user_idx
  on jm_support_messages (user_id, created_at desc);

create index if not exists jm_support_created_idx
  on jm_support_messages (created_at desc);

-- Как и все остальные таблицы: наружу закрыто, ходит только прокси под
-- сервисным ключом (см. 013_lock_down_rls.sql).
alter table jm_support_messages enable row level security;
revoke all on jm_support_messages from anon, authenticated;
