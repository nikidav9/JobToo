-- SuperJob подключается выключенным: официальный API требует Secret key
-- зарегистрированного приложения. После установки SUPERJOB_SECRET_KEY
-- источник можно включить в дашборде и сначала запустить вручную.

insert into public.jm_ext_sources (
  id, name, url, enabled, period_min, environment,
  connector_kind, integration_mode
) values (
  'superjob',
  'SuperJob',
  'https://jobtoo.ru/api/superjob.php',
  false,
  120,
  'production',
  'superjob',
  'redirect'
)
on conflict (id) do update
set name = excluded.name,
    url = excluded.url,
    period_min = excluded.period_min,
    environment = excluded.environment,
    connector_kind = excluded.connector_kind;

notify pgrst, 'reload schema';
