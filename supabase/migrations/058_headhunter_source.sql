-- hh.ru: официальный публичный поиск, Москва. Сначала выключен для ручной
-- проверки объёма и качества выдачи перед добавлением в пользовательскую ленту.

insert into public.jm_ext_sources (
  id, name, url, enabled, period_min, environment,
  connector_kind, integration_mode
) values (
  'headhunter',
  'hh.ru',
  'https://jobtoo.ru/api/headhunter.php',
  false,
  120,
  'production',
  'headhunter',
  'redirect'
)
on conflict (id) do update
set name = excluded.name,
    url = excluded.url,
    period_min = excluded.period_min,
    environment = excluded.environment,
    connector_kind = excluded.connector_kind;

notify pgrst, 'reload schema';
