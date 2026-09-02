-- Универсальное ядро двусторонних партнёрских интеграций.
-- Конкретный Яндекс-адаптер будет переводить их API в эту стабильную модель.

alter table public.jm_ext_sources
  add column if not exists connector_kind text not null default 'redirect',
  add column if not exists integration_mode text not null default 'redirect',
  add column if not exists webhook_secret text,
  add column if not exists connector_config jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.jm_ext_sources add constraint jm_ext_sources_mode_chk
    check (integration_mode in ('redirect', 'embedded_test', 'embedded'));
exception when duplicate_object then null; end $$;

create table if not exists public.jm_partner_applications (
  id text primary key,
  source_id text not null,
  ext_vacancy_id text not null,
  worker_id text not null,
  partner_application_id text,
  status text not null default 'local_created',
  status_version integer not null default 1,
  consent_version text not null,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  partner_updated_at timestamptz,
  unique (source_id, ext_vacancy_id, worker_id),
  unique (source_id, partner_application_id)
);

do $$ begin
  alter table public.jm_partner_applications add constraint jm_partner_application_status_chk
    check (status in (
      'local_created', 'submitting', 'submitted', 'accepted', 'rejected',
      'booked', 'check_in_pending', 'checked_in', 'completed',
      'worker_cancelled', 'employer_cancelled', 'no_show',
      'disputed', 'failed'
    ));
exception when duplicate_object then null; end $$;

create index if not exists jm_partner_app_worker_idx
  on public.jm_partner_applications (worker_id, updated_at desc);
create index if not exists jm_partner_app_source_status_idx
  on public.jm_partner_applications (source_id, status, updated_at desc);

create table if not exists public.jm_partner_conversations (
  id text primary key,
  application_id text not null unique,
  source_id text not null,
  jobtoo_chat_id text,
  partner_chat_id text,
  last_partner_sequence bigint,
  status text not null default 'opening',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, partner_chat_id)
);

do $$ begin
  alter table public.jm_partner_conversations add constraint jm_partner_conversation_status_chk
    check (status in ('opening', 'open', 'locked', 'closed', 'failed'));
exception when duplicate_object then null; end $$;

create table if not exists public.jm_partner_messages (
  id text primary key,
  conversation_id text not null,
  jobtoo_message_id text,
  partner_message_id text,
  direction text not null,
  sender_role text not null,
  body text not null,
  delivery_status text not null default 'pending',
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  unique (conversation_id, idempotency_key),
  unique (conversation_id, partner_message_id)
);

do $$ begin
  alter table public.jm_partner_messages add constraint jm_partner_message_direction_chk
    check (direction in ('to_partner', 'from_partner'));
  alter table public.jm_partner_messages add constraint jm_partner_message_delivery_chk
    check (delivery_status in ('pending', 'sending', 'sent', 'delivered', 'failed', 'dead'));
  alter table public.jm_partner_messages add constraint jm_partner_message_sender_chk
    check (sender_role in ('worker', 'employer', 'system'));
exception when duplicate_object then null; end $$;

create index if not exists jm_partner_messages_conversation_time_idx
  on public.jm_partner_messages (conversation_id, occurred_at asc);

create table if not exists public.jm_partner_inbox (
  id text primary key,
  source_id text not null,
  partner_event_id text not null,
  event_kind text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (source_id, partner_event_id)
);

create index if not exists jm_partner_inbox_pending_idx
  on public.jm_partner_inbox (received_at)
  where processed_at is null;

create table if not exists public.jm_partner_outbox (
  id text primary key,
  source_id text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  event_kind text not null,
  idempotency_key text not null,
  payload jsonb not null,
  delivery_status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (source_id, idempotency_key)
);

do $$ begin
  alter table public.jm_partner_outbox add constraint jm_partner_outbox_status_chk
    check (delivery_status in ('pending', 'sending', 'delivered', 'failed', 'dead'));
exception when duplicate_object then null; end $$;

create index if not exists jm_partner_outbox_due_idx
  on public.jm_partner_outbox (next_attempt_at)
  where delivery_status in ('pending', 'failed');

create table if not exists public.jm_partner_rating_facts (
  id text primary key,
  source_id text not null,
  application_id text not null,
  worker_id text not null,
  fact_kind text not null,
  numeric_value numeric,
  evidence_event_id text not null,
  occurred_at timestamptz not null,
  disputed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_id, evidence_event_id, fact_kind)
);

do $$ begin
  alter table public.jm_partner_rating_facts add constraint jm_partner_rating_fact_chk
    check (fact_kind in (
      'shift_completed', 'on_time', 'late_minutes', 'no_show',
      'worker_cancelled', 'employer_cancelled'
    ));
exception when duplicate_object then null; end $$;

create index if not exists jm_partner_rating_worker_idx
  on public.jm_partner_rating_facts (worker_id, occurred_at desc)
  where disputed = false;

alter table public.jm_partner_applications enable row level security;
alter table public.jm_partner_conversations enable row level security;
alter table public.jm_partner_messages enable row level security;
alter table public.jm_partner_inbox enable row level security;
alter table public.jm_partner_outbox enable row level security;
alter table public.jm_partner_rating_facts enable row level security;

revoke all on public.jm_partner_applications from anon, authenticated;
revoke all on public.jm_partner_conversations from anon, authenticated;
revoke all on public.jm_partner_messages from anon, authenticated;
revoke all on public.jm_partner_inbox from anon, authenticated;
revoke all on public.jm_partner_outbox from anon, authenticated;
revoke all on public.jm_partner_rating_facts from anon, authenticated;

grant all on public.jm_partner_applications to service_role;
grant all on public.jm_partner_conversations to service_role;
grant all on public.jm_partner_messages to service_role;
grant all on public.jm_partner_inbox to service_role;
grant all on public.jm_partner_outbox to service_role;
grant all on public.jm_partner_rating_facts to service_role;

notify pgrst, 'reload schema';
