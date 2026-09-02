-- Изоляция партнёрских тестов от production-пользователей.
-- Sandbox-вакансии доступны только service_role и никогда не попадают
-- в публичную ленту, даже если клиент забудет добавить фильтр.

alter table public.jm_ext_sources
  add column if not exists environment text not null default 'production',
  add column if not exists notifications_enabled boolean not null default true;

do $$ begin
  alter table public.jm_ext_sources
    add constraint jm_ext_sources_environment_chk
    check (environment in ('production', 'sandbox'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.jm_ext_sources
    add constraint jm_ext_sources_sandbox_notifications_chk
    check (environment <> 'sandbox' or notifications_enabled = false);
exception when duplicate_object then null; end $$;

alter table public.jm_ext_vacancies
  add column if not exists environment text not null default 'production';

do $$ begin
  alter table public.jm_ext_vacancies
    add constraint jm_ext_vacancies_environment_chk
    check (environment in ('production', 'sandbox'));
exception when duplicate_object then null; end $$;

create or replace function public.jm_ext_vacancy_inherit_environment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare source_environment text;
begin
  select environment into source_environment
  from public.jm_ext_sources
  where id = new.source_id;

  if source_environment is null then
    raise exception 'Unknown partner source: %', new.source_id;
  end if;

  new.environment := source_environment;
  return new;
end;
$$;

drop trigger if exists jm_ext_vacancy_environment_trg on public.jm_ext_vacancies;
create trigger jm_ext_vacancy_environment_trg
before insert or update of source_id, environment
on public.jm_ext_vacancies
for each row execute function public.jm_ext_vacancy_inherit_environment();

update public.jm_ext_vacancies v
set environment = s.environment
from public.jm_ext_sources s
where s.id = v.source_id
  and v.environment is distinct from s.environment;

alter table public.jm_ext_vacancies enable row level security;
drop policy if exists jm_ext_vacancies_public_production on public.jm_ext_vacancies;
create policy jm_ext_vacancies_public_production
on public.jm_ext_vacancies
for select
to anon, authenticated
using (environment = 'production' and active = true);

create index if not exists jm_ext_vac_environment_active_idx
  on public.jm_ext_vacancies (environment, active, last_seen_at desc);

notify pgrst, 'reload schema';
