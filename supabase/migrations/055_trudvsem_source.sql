-- Официальный источник «Работа в России» (trudvsem.ru).
-- Адаптер php-proxy/trudvsem.php забирает только Москву и нормализует
-- вакансии в формат JobToo. Все записи считаются permanent: поэтому они
-- показываются в разделе «Работа», а сменные/гибкие/частичные дополнительно
-- попадают в «Подработка → Регулярная» по клиентской классификации.

insert into public.jm_ext_sources (id, name, url, enabled, period_min, environment)
values (
    'trudvsem',
    'Работа в России',
    'https://jobtoo.ru/api/trudvsem.php',
    true,
    120,
    'production'
)
on conflict (id) do update
set name = excluded.name,
    url = excluded.url,
    enabled = true,
    period_min = excluded.period_min,
    environment = excluded.environment;

notify pgrst, 'reload schema';
