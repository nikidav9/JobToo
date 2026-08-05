-- Ящик для того, что люди пишут боту.
--
-- До сих пор бот на любое человеческое сообщение в личке отвечал «Все смены
-- и вакансии — в приложении 👇» и выбрасывал его. Сколько людей нам что-то
-- писали и не были услышаны, мы не знаем — записей не осталось вовсе.
--
-- Всплыло, когда понадобилось спросить работников, почему они заходят и не
-- откликаются: спрашивать через бота было бессмысленно, ответы утекали в
-- никуда.
--
-- Заодно таблица настроек: в ней лежит chat id администратора, чтобы
-- пересылать ему входящие. Держать его в переменной окружения значило бы
-- ходить на хостинг ради одной строки — а так админ говорит боту кодовое
-- слово, и бот запоминает сам.

create table if not exists jm_bot_messages (
    id           text primary key,
    user_id      text,                      -- если телеграм привязан к аккаунту
    telegram_id  bigint      not null,
    name         text,
    username     text,
    text         text        not null,
    created_at   timestamptz not null default now(),
    answered     boolean     not null default false
);

create index if not exists jm_bot_messages_created_idx on jm_bot_messages (created_at desc);

create table if not exists jm_settings (
    key        text primary key,
    value      text        not null,
    updated_at timestamptz not null default now()
);

-- Как и все остальные таблицы: наружу закрыто, ходит только прокси под
-- сервисным ключом (см. 013_lock_down_rls.sql).
alter table jm_bot_messages enable row level security;
alter table jm_settings     enable row level security;

revoke all on jm_bot_messages from anon, authenticated;
revoke all on jm_settings     from anon, authenticated;
