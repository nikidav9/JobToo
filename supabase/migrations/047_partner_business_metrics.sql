-- Доказательные бизнес-метрики партнёрского пилота.
-- Расходы вносятся отдельными фактами; неизвестное не превращается в ноль.
-- Признак нового для партнёра кандидата приходит только от самого партнёра.

alter table public.jm_ext_events
  add column if not exists new_candidate boolean;

create table if not exists public.jm_partner_costs (
  id text primary key,
  source_id text not null,
  amount_rub numeric(14,2) not null check (amount_rub > 0),
  incurred_at date not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists jm_partner_costs_source_date_idx
  on public.jm_partner_costs (source_id, incurred_at desc);

alter table public.jm_partner_costs enable row level security;
revoke all on public.jm_partner_costs from anon, authenticated;
grant all on public.jm_partner_costs to service_role;

notify pgrst, 'reload schema';
