-- Привязка аккаунта SuperJob к конкретному соискателю JobToo.
-- Токены храним только в зашифрованном виде; браузер их никогда не получает.

create table if not exists public.jm_superjob_oauth_states (
  state_hash text primary key,
  worker_id text not null,
  return_url text not null default 'https://jobtoo.ru/',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists jm_superjob_oauth_states_worker_idx
  on public.jm_superjob_oauth_states (worker_id, created_at desc);

create table if not exists public.jm_superjob_connections (
  worker_id text primary key,
  superjob_user_id text,
  resume_id text,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);

alter table public.jm_superjob_oauth_states enable row level security;
alter table public.jm_superjob_connections enable row level security;
revoke all on public.jm_superjob_oauth_states from anon, authenticated;
revoke all on public.jm_superjob_connections from anon, authenticated;
grant all on public.jm_superjob_oauth_states to service_role;
grant all on public.jm_superjob_connections to service_role;

notify pgrst, 'reload schema';
