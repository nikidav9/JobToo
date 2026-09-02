-- Операционный статус партнёрских источников.
-- Секреты источника остаются в jm_ext_sources, но никогда не выдаются в браузер.
-- Эти поля позволяют отличить «одна случайная ошибка» от сломанной интеграции.

alter table public.jm_ext_sources
  add column if not exists last_success_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_duration_ms integer,
  add column if not exists last_pages integer,
  add column if not exists last_skipped integer,
  add column if not exists last_deactivated integer;

alter table public.jm_ext_ingest_runs
  add column if not exists duration_ms integer,
  add column if not exists pages integer,
  add column if not exists skipped integer,
  add column if not exists deactivated integer;

create index if not exists jm_ext_ingest_runs_success_time_idx
  on public.jm_ext_ingest_runs (success, ran_at desc);

notify pgrst, 'reload schema';
