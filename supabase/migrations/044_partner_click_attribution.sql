-- Непрозрачная атрибуция партнёрского перехода.
-- click_id не содержит user_id и безопасно передаётся в URL источника.

alter table public.jm_ext_events
  add column if not exists attribution_id text;

create index if not exists jm_ext_events_attribution_idx
  on public.jm_ext_events (attribution_id)
  where attribution_id is not null;

-- Один партнёрский event_id уже идемпотентен в рамках source_id.
-- Связь с кликом нужна для сверки воронки, но не открывается anon-клиенту.
notify pgrst, 'reload schema';
