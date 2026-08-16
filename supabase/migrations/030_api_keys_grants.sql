-- Права на таблицу ключей и толчок PostgREST.
--
-- Миграция 029 создала таблицу, но PostgREST о ней не узнал: он держит
-- устройство базы в памяти и перечитывает её только по сигналу. Снаружи это
-- выглядело как «Could not find the table in the schema cache» — то есть как
-- ошибка кода, хотя таблица была на месте.
--
-- Заодно явные права. Общая раздача в bootstrap.sh проходит по всем таблицам
-- сразу, но полагаться на порядок двух независимых скриптов не стоит: здесь
-- сказано ровно то, что нужно этой таблице.

grant select, insert, update on jm_api_keys to service_role;
revoke all on jm_api_keys from anon, authenticated;

notify pgrst, 'reload schema';
