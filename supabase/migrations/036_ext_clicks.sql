-- Переходы на чужие вакансии.
--
-- Чужую вакансию мы только показываем: отклик происходит на той стороне, и
-- всё, что мы о ней узнаём, — это что человек нажал «Открыть». Без такой
-- записи агрегатор работает вслепую: непонятно, какой источник вообще нужен
-- людям, какие профессии смотрят, и есть ли смысл держать фид, который
-- никто не открывает.
--
-- И вторая причина, менее очевидная сегодня и главная завтра: комиссия за
-- переход или за найм считается по переходам. Если их не писать с самого
-- начала, первый же разговор о деньгах с партнёром придётся начинать с
-- «мы не знаем, сколько людей вам отправили».
--
-- Пишем факт, а не человека: user_id может быть пустым (гость), и это
-- нормально — счётчику он не нужен.

create table if not exists jm_ext_clicks (
    id         text primary key,
    -- Строка из jm_ext_vacancies. Внешним ключом не связываем: вакансия
    -- у источника пропадает, строку чистит сборщик, а переход был и в
    -- статистике остаться должен.
    ext_id     text not null,
    source_id  text not null,
    user_id    text,
    clicked_at timestamptz not null default now()
);

create index if not exists jm_ext_clicks_source_idx on jm_ext_clicks (source_id, clicked_at desc);
create index if not exists jm_ext_clicks_ext_idx    on jm_ext_clicks (ext_id);

alter table jm_ext_clicks enable row level security;
revoke all on jm_ext_clicks from anon, authenticated;
grant select, insert on jm_ext_clicks to service_role;
