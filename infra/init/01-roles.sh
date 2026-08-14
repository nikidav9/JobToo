#!/bin/bash
# Пароли служебным ролям и схемы для служб.
#
# Образ supabase/postgres уже заводит роли anon, authenticated, service_role,
# authenticator и supabase_storage_admin — заново создавать их не нужно и
# вредно. Нужно другое: задать им пароль, который знают наши контейнеры,
# и создать схемы, которых в голом образе нет.
#
# Скриптом, а не SQL-файлом, потому что пароль приходит переменной окружения,
# а SQL их не видит.
#
# Запускается один раз, при первом создании базы.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  alter role authenticator            with login password '${POSTGRES_PASSWORD}';
  alter role supabase_storage_admin   with login password '${POSTGRES_PASSWORD}';
  alter role supabase_admin           with login password '${POSTGRES_PASSWORD}';

  -- Realtime держит здесь своё хозяйство: тенанты и слоты репликации.
  create schema if not exists _realtime;
  alter schema _realtime owner to supabase_admin;

  -- Storage создаёт свои таблицы сам при первом запуске, ему нужна лишь схема.
  create schema if not exists storage;
  alter schema storage owner to supabase_storage_admin;

  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables    in schema public to service_role;
  grant all on all sequences in schema public to service_role;
  alter default privileges in schema public grant all on tables    to service_role;
  alter default privileges in schema public grant all on sequences to service_role;
EOSQL

echo "роли и схемы готовы"
