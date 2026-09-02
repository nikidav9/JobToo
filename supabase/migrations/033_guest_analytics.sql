-- Privacy-minimal analytics for vacancy browsing without registration.
-- anon_id is a random app identifier; no phone, name, IP or fingerprint is stored.

create table if not exists public.jm_guest_events (
  id text primary key,
  anon_id text not null check (char_length(anon_id) between 1 and 128),
  event_type text not null check (event_type in (
    'guest_started',
    'vacancy_impression',
    'apply_intent',
    'registration_started',
    'registration_completed',
    'external_click'
  )),
  vacancy_id text,
  vacancy_kind text check (vacancy_kind is null or vacancy_kind in ('shift', 'permanent', 'external')),
  source_id text,
  platform text,
  occurred_at timestamptz not null default now()
);

create index if not exists jm_guest_events_occurred_at_idx
  on public.jm_guest_events (occurred_at desc);
create index if not exists jm_guest_events_event_time_idx
  on public.jm_guest_events (event_type, occurred_at desc);
create index if not exists jm_guest_events_anon_time_idx
  on public.jm_guest_events (anon_id, occurred_at desc);

alter table public.jm_guest_events enable row level security;
revoke all on public.jm_guest_events from anon, authenticated;
grant all on public.jm_guest_events to service_role;

comment on table public.jm_guest_events is
  'Guest vacancy funnel. Contains only random anon_id and technical event context; server-only access.';
