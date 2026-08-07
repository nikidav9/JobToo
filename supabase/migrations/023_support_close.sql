-- Закрытие обращения в поддержку.
--
-- Пока список обращений был короткий, «отвечено» хватало: последнее сообщение
-- наше — значит разобрались. Но ответ и закрытие — разные вещи. На «а когда
-- смена?» отвечают и разговор продолжается; на «спасибо, разобрался» отвечать
-- нечего, но обращение должно уйти из списка, иначе оно вечно висит и мешает
-- видеть тех, кто правда ждёт.
--
-- Состояние храним отдельной таблицей, а не полем в переписке: сообщения —
-- это то, что человек видит, а закрытие — служебная отметка. Смешивать их
-- значит однажды показать человеку строку, которая ему не адресована.
--
-- Тред один на человека, поэтому и ключ — человек.

create table if not exists jm_support_threads (
    user_id   text        primary key,
    closed_at timestamptz,                       -- null — обращение открыто
    updated_at timestamptz not null default now()
);

-- Открытые ищем чаще всего, и их мало: индекс по частичному условию.
create index if not exists jm_support_threads_open_idx
  on jm_support_threads (updated_at desc) where closed_at is null;

-- Как и все остальные таблицы: наружу закрыто, ходит только прокси под
-- сервисным ключом (см. 013_lock_down_rls.sql).
alter table jm_support_threads enable row level security;
revoke all on jm_support_threads from anon, authenticated;
