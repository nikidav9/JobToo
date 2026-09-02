-- Биллинг партнёрского пилота: тарифы, оплачиваемые события и сверка.
-- Таблицы закрыты для клиентских ролей; изменения выполняются только backend/service_role.

create table if not exists public.jm_partner_tariffs (
  id text primary key,
  source_id text not null,
  name text not null,
  billing_model text not null,
  amount_rub numeric(14,2) not null check (amount_rub >= 0),
  fixed_monthly_rub numeric(14,2) not null default 0 check (fixed_monthly_rub >= 0),
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  terms_version text not null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (source_id, effective_from, terms_version)
);

do $$ begin
  alter table public.jm_partner_tariffs add constraint jm_partner_tariff_model_chk
    check (billing_model in ('first_completed_shift', 'completed_shift', 'qualified_application', 'fixed_monthly', 'hybrid'));
exception when duplicate_object then null; end $$;

create index if not exists jm_partner_tariffs_active_idx
  on public.jm_partner_tariffs (source_id, active, effective_from desc);

create table if not exists public.jm_partner_billable_events (
  id text primary key,
  source_id text not null,
  application_id text,
  worker_id text not null,
  ext_vacancy_id text,
  partner_event_id text,
  event_kind text not null,
  occurred_at timestamptz not null,
  tariff_id text not null references public.jm_partner_tariffs(id),
  amount_rub numeric(14,2) not null check (amount_rub >= 0),
  currency text not null default 'RUB',
  status text not null default 'pending',
  dedupe_key text not null,
  partner_status text,
  rejection_reason text,
  invoice_period date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, dedupe_key),
  unique (source_id, partner_event_id)
);

do $$ begin
  alter table public.jm_partner_billable_events add constraint jm_partner_billable_kind_chk
    check (event_kind in ('first_completed_shift', 'completed_shift', 'qualified_application', 'fixed_monthly'));
  alter table public.jm_partner_billable_events add constraint jm_partner_billable_status_chk
    check (status in ('pending', 'approved', 'rejected', 'invoiced', 'paid', 'void'));
  alter table public.jm_partner_billable_events add constraint jm_partner_billable_currency_chk
    check (currency = 'RUB');
exception when duplicate_object then null; end $$;

-- Главная защита от двойной оплаты: первая завершённая смена конкретного
-- кандидата у одного источника может стать оплачиваемой только один раз.
create unique index if not exists jm_partner_first_shift_once_idx
  on public.jm_partner_billable_events (source_id, worker_id)
  where event_kind = 'first_completed_shift' and status <> 'void';

create index if not exists jm_partner_billable_period_idx
  on public.jm_partner_billable_events (source_id, occurred_at desc, status);

create table if not exists public.jm_partner_reconciliation_issues (
  id text primary key,
  source_id text not null,
  billable_event_id text references public.jm_partner_billable_events(id),
  application_id text,
  local_status text not null,
  partner_status text not null,
  reason_code text not null,
  reason_text text,
  resolution_status text not null default 'open',
  resolution_note text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, billable_event_id, local_status, partner_status)
);

do $$ begin
  alter table public.jm_partner_reconciliation_issues add constraint jm_partner_reconciliation_status_chk
    check (resolution_status in ('open', 'accepted_local', 'accepted_partner', 'corrected', 'cancelled'));
exception when duplicate_object then null; end $$;

create index if not exists jm_partner_reconciliation_open_idx
  on public.jm_partner_reconciliation_issues (source_id, detected_at desc)
  where resolution_status = 'open';

create table if not exists public.jm_partner_report_runs (
  id text primary key,
  source_id text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'generated',
  event_count integer not null default 0,
  amount_rub numeric(14,2) not null default 0,
  approved_count integer not null default 0,
  rejected_count integer not null default 0,
  discrepancy_count integer not null default 0,
  checksum_sha256 text not null,
  generated_at timestamptz not null default now(),
  unique (source_id, period_start, period_end),
  check (period_end >= period_start)
);

create table if not exists public.jm_partner_data_consents (
  id text primary key,
  source_id text not null,
  worker_id text not null,
  ext_vacancy_id text not null,
  application_id text,
  recipient_name text not null,
  data_categories text[] not null,
  purpose text not null,
  consent_version text not null,
  accepted_at timestamptz not null,
  revoked_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  unique (source_id, worker_id, ext_vacancy_id, consent_version)
);

create index if not exists jm_partner_consent_worker_idx
  on public.jm_partner_data_consents (worker_id, accepted_at desc);

alter table public.jm_partner_tariffs enable row level security;
alter table public.jm_partner_billable_events enable row level security;
alter table public.jm_partner_reconciliation_issues enable row level security;
alter table public.jm_partner_report_runs enable row level security;
alter table public.jm_partner_data_consents enable row level security;

revoke all on public.jm_partner_tariffs from anon, authenticated;
revoke all on public.jm_partner_billable_events from anon, authenticated;
revoke all on public.jm_partner_reconciliation_issues from anon, authenticated;
revoke all on public.jm_partner_report_runs from anon, authenticated;
revoke all on public.jm_partner_data_consents from anon, authenticated;

grant all on public.jm_partner_tariffs to service_role;
grant all on public.jm_partner_billable_events to service_role;
grant all on public.jm_partner_reconciliation_issues to service_role;
grant all on public.jm_partner_report_runs to service_role;
grant all on public.jm_partner_data_consents to service_role;

notify pgrst, 'reload schema';
