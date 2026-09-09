-- После исправления транспорта API «Работа в России» разрешаем источнику
-- запуститься сразу на следующем общем цикле ingest, не ожидая period_min
-- после предыдущей неудачной попытки.
update public.jm_ext_sources
set last_run_at = null,
    consecutive_failures = 0
where id = 'trudvsem';

notify pgrst, 'reload schema';
