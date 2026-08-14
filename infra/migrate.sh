#!/bin/bash
# Накатывает миграции из supabase/migrations на свою базу.
#
# Идемпотентен: помнит применённое в таблице jm_migrations и второй раз то же
# самое не выполняет. Это важно, потому что вызывается он из bootstrap.sh,
# а тот запускается по таймеру каждую минуту.
#
# Порядок не случаен. Миграция 015 правит storage.buckets, а эту таблицу
# создаёт служба Storage при первом запуске — не раньше. Поэтому сначала
# ждём Storage, потом заводим бакет avatars, и только потом катим по списку.
set -u

REPO=${REPO:-/opt/jobtoo}
NTFY=${NTFY:-https://ntfy.sh/jt-v4-m7q2z8}
say() { curl -s -m 20 -H "Title: $1" -d "$2" "$NTFY" >/dev/null || true; }

cd "$REPO/infra"
# Пароль нужен даже локально: образ supabase/postgres не пускает по доверию,
# и без него psql молча не соединяется, а выглядит это как «база не отвечает».
set -a; . /opt/jobtoo-secrets/env; set +a
q() { docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
        psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }

# ── Ждём базу ─────────────────────────────────────────────────────────────
for i in $(seq 1 30); do
  if q -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 5
done
q -c 'select 1' >/dev/null 2>&1 || { say "миграции" "база не отвечает"; exit 1; }

# ── Журнал применённого ───────────────────────────────────────────────────
q -c "create table if not exists jm_migrations (
        name text primary key,
        applied_at timestamptz not null default now())" >/dev/null

# ── Бакет для файлов ──────────────────────────────────────────────────────
# Storage заводит свои таблицы сам; если их ещё нет — выйдем и попробуем на
# следующем запуске таймера, через минуту. Спешить некуда.
if ! q -c "select 1 from storage.buckets limit 1" >/dev/null 2>&1; then
  say "миграции" "storage ещё не готов, отложено"
  exit 0
fi

# Бакет заводим сами: Storage создаёт таблицы, но не наши бакеты.
# Ошибку показываем, а не глотаем — молчащий сбой здесь стоил получаса.
if ! q -c "insert into storage.buckets (id, name, public)
           values ('avatars', 'avatars', true)
           on conflict (id) do nothing" >/tmp/jt-bucket.log 2>&1; then
  say "миграции" "бакет: $(tail -3 /tmp/jt-bucket.log | tr '\n' ' ' | cut -c1-250)"
  exit 1
fi

# ── Сами миграции, строго по порядку имён ─────────────────────────────────
applied=0
for f in $(ls "$REPO"/supabase/migrations/*.sql | sort); do
  name=$(basename "$f")
  if q -tAc "select 1 from jm_migrations where name = '$name'" 2>/dev/null | grep -q 1; then
    continue
  fi
  if q < "$f" >/tmp/jt-mig.log 2>&1; then
    q -c "insert into jm_migrations (name) values ('$name')" >/dev/null 2>&1
    applied=$((applied+1))
  else
    say "миграции" "СПОТКНУЛАСЬ на $name: $(grep -a -m2 ERROR /tmp/jt-mig.log | tr '\n' ' ' | cut -c1-250)"
    exit 1
  fi
done

if [ "$applied" -gt 0 ]; then
  tables=$(q -tAc "select count(*) from information_schema.tables
                   where table_schema='public' and table_name like 'jm_%'")
  say "миграции" "применено $applied, таблиц jm_*: $tables"
fi
