-- Ключи для внешнего API.
--
-- До сих пор наружу смотрел один-единственный пропуск приложения, и он же
-- открывал все функции разом — включая смену паролей. Отдать такой партнёру
-- нельзя: это не «доступ к вакансиям», это доступ ко всему.
--
-- Отсюда отдельные ключи. У каждого своё имя, свои права и своя история: кто
-- ходил, когда последний раз и сколько раз за час. Отзыв — отметкой, а не
-- удалением: строка нужна, чтобы потом можно было ответить на вопрос «а кто
-- выгружал наши вакансии в марте».
--
-- Сам ключ не хранится. В базе только его отпечаток: утечка этой таблицы не
-- даёт доступа, а показать ключ второй раз мы и не должны уметь.

create table if not exists jm_api_keys (
    id            text primary key,
    name          text not null,
    key_hash      text not null unique,
    -- Права списком, а не одним уровнем: «читать вакансии» и «принимать
    -- отклики» — разные вещи, и второе появится позже.
    scopes        text[] not null default array['vacancies:read'],
    created_at    timestamptz not null default now(),
    revoked_at    timestamptz,
    last_used_at  timestamptz,
    -- Счётчик в пределах часа. Простой способ ограничить частоту, не заводя
    -- отдельного хранилища: час сменился — счётчик обнуляется.
    hour_bucket   text,
    hits          integer not null default 0,
    rate_limit    integer not null default 1000
);

create index if not exists jm_api_keys_hash_idx on jm_api_keys (key_hash) where revoked_at is null;

-- Таблица служебная: наружу через PostgREST её не показываем совсем.
revoke all on jm_api_keys from anon, authenticated;
