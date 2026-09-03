-- Органическая воронка «поделиться вакансией».
-- campaign_id остаётся случайным и не содержит user_id или иных данных человека.
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
    'campaign_apply',
    'campaign_shared'
  ));

comment on column public.jm_guest_events.channel is
  'Канал привлечения: telegram_group, telegram_dm или user_share.';

notify pgrst, 'reload schema';
