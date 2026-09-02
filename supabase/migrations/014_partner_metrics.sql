-- Partner funnel and feed reliability metrics.
-- Raw events stay server-only; dashboard reads them through the admin API.

create table if not exists public.jm_ext_events (
  id text primary key,
  ext_id text not null,
  source_id text not null,
  event_type text not null check (event_type in ('impression', 'click', 'conversion')),
  user_id text,
  partner_event_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists jm_ext_events_source_time_idx
  on public.jm_ext_events (source_id, occurred_at desc);
create index if not exists jm_ext_events_type_time_idx
  on public.jm_ext_events (event_type, occurred_at desc);
create unique index if not exists jm_ext_events_partner_event_uidx
  on public.jm_ext_events (source_id, partner_event_id)
  where partner_event_id is not null;

create table if not exists public.jm_ext_ingest_runs (
  id text primary key,
  source_id text not null,
  success boolean not null,
  received integer not null default 0,
  status text not null,
  ran_at timestamptz not null default now()
);

create index if not exists jm_ext_ingest_runs_source_time_idx
  on public.jm_ext_ingest_runs (source_id, ran_at desc);

alter table public.jm_ext_events enable row level security;
alter table public.jm_ext_ingest_runs enable row level security;
revoke all on public.jm_ext_events from anon, authenticated;
revoke all on public.jm_ext_ingest_runs from anon, authenticated;
grant all on public.jm_ext_events to service_role;
grant all on public.jm_ext_ingest_runs to service_role;
