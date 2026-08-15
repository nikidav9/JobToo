#!/bin/bash
# Работает ли на этом сервере то, что приложение делает анонимным ключом.
#
# Через анонимный ключ идут ровно две вещи: загрузка фотографий и голосовых
# в бакет avatars и двенадцать живых подписок из contexts/AppContext.tsx.
# Всё остальное ходит через php-proxy сервисным ключом и здесь ни при чём.
#
# Проверять это надо ДО переключения приложения с облака. Обе вещи ломаются
# тихо: подписки просто перестают приносить обновления, а загрузка падает
# уже у человека в руках. Ни то, ни другое не видно по состоянию служб —
# контейнеры при этом совершенно здоровы.
#
# Отдельным файлом, а не строкой в отчёте: проверок пять, каждая со своей
# причиной, и разбираться в них придётся по отдельности.

set -u
cd /opt/jobtoo/infra 2>/dev/null || exit 0
set -a; . /opt/jobtoo-secrets/env; set +a

q() {
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    psql -tAq -U supabase_admin -d postgres -c "$1" 2>&1 | tr -d '"\n\r'
}

out=""

# 1. Публикация. Realtime раздаёт изменения только тех таблиц, что в неё
# включены. Нет публикации — нет ни одной живой подписки, при полностью
# исправном на вид Realtime.
pub=$(q "select count(*) from pg_publication_tables
          where pubname = 'supabase_realtime' and tablename like 'jm\\_%';")
out="$out публикация=${pub:-?}"

# 2. Права анонимной роли на чтение. Без них подписка подключится и не
# принесёт ничего: Realtime отдаёт строку только тому, кто имел бы право
# её прочитать.
gr=$(q "select count(distinct table_name) from information_schema.role_table_grants
         where grantee = 'anon' and table_schema = 'public'
           and privilege_type = 'SELECT' and table_name like 'jm\\_%';")
out="$out чтение_anon=${gr:-?}"

# 3. Сколько таблиц под построчной защитой. Если она включена, а политик
# для anon нет, получится то же самое молчание — но по другой причине,
# и лечится оно иначе.
rls=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname like 'jm\\_%' and c.relrowsecurity;")
out="$out под_защитой=${rls:-?}"

# 4. Чтение через PostgREST анонимным ключом — тем же путём, каким пойдёт
# приложение.
rc=$(curl -s -o /dev/null -m 10 -w '%{http_code}' \
     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
     "http://127.0.0.1:3000/jm_vacancies?select=id&limit=1" 2>/dev/null)
out="$out чтение=${rc:-нет}"

# 5. Загрузка файла анонимным ключом и уборка за собой. Именно так
# приложение кладёт аватар и вложения чата.
up=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X POST \
     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
     -H "Content-Type: text/plain" --data-binary 'jt' \
     "http://127.0.0.1:5000/object/avatars/jt-anon-probe.txt" 2>/dev/null)
out="$out загрузка=${up:-нет}"
curl -s -o /dev/null -m 10 -X DELETE \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  "http://127.0.0.1:5000/object/avatars/jt-anon-probe.txt" >/dev/null 2>&1

# 6. Само подключение подписки. Ответ 101 значит, что Realtime принял
# анонимный ключ и согласился говорить дальше; 403 — не принял.
ws=$(curl -s -o /dev/null -m 10 -w '%{http_code}' \
     -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     -H 'Host: realtime-dev.localhost' \
     "http://127.0.0.1:4000/socket/websocket?apikey=$ANON_KEY&vsn=1.0.0" 2>/dev/null)
out="$out подписка=${ws:-нет}"

echo "$(date +%H:%M)$out" > /var/lib/jt-anon-check
