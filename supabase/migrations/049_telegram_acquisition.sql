-- Сквозная атрибуция публикаций Telegram без персональных данных.
-- campaign_id генерируется для каждой публикации вакансии и проходит через
-- startapp-ссылку до просмотра и намерения откликнуться.

alter table public.jm_guest_events
  add column if not exists campaign_id text,
  add column if not exists channel text;

alter table public.jm_guest_events
  drop constraint if exists jm_guest_events_event_type_check;

alter table public.jm_guest_events
  add constraint jm_guest_events_event_type_check check (event_type in (
    'guest_started',
    'vacancy_impression',
    'apply_intent',
    'registration_started',
    'registration_completed',
    'external_click',
    'campaign_published',
    'campaign_open',
    'campaign_apply'
  ));

create index if not exists jm_guest_events_campaign_time_idx
  on public.jm_guest_events (campaign_id, occurred_at desc)
  where campaign_id is not null;

create index if not exists jm_guest_events_channel_time_idx
  on public.jm_guest_events (channel, occurred_at desc)
  where channel is not null;

comment on column public.jm_guest_events.campaign_id is
  'Неперсональный идентификатор публикации, переданный в Telegram startapp.';
comment on column public.jm_guest_events.channel is
  'Канал привлечения, например telegram_group или telegram_dm.';

notify pgrst, 'reload schema';
