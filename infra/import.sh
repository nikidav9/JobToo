#!/bin/bash
# Переносит данные из облачного Supabase в свою базу.
#
# Забирает сервер сам, напрямую из облака: у него открыты все порты, а данные
# при этом нигде не задерживаются. Через репозиторий их не пронести — он
# публичный, а там переписка и телефоны 420 человек.
#
# Запускается один раз и сам себя останавливает: отметка в jm_migrations.
# Повторная заливка означала бы дубли, поэтому «пусть применяется каждую
# минуту» здесь не годится, в отличие от всего остального на этой машине.
#
# Порядок таблиц — по зависимостям, а не по алфавиту: сначала люди, потом их
# вакансии, потом отклики на эти вакансии.
set -u

REPO=${REPO:-/opt/jobtoo}
SECRETS=/opt/jobtoo-secrets/env
CLOUD=/opt/jobtoo-secrets/cloud
say() { echo "$(date -Is) [$1] $2" >> /var/log/jt-apply.log; }

[ -f "$CLOUD" ] || { say "перенос" "нет доступа к облаку, пропускаю"; exit 0; }
set -a; . "$SECRETS"; . "$CLOUD"; set +a

cd "$REPO/infra"
q() { docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
        psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }

# Уже переносили — второй раз не надо.
if q -tAc "select 1 from jm_migrations where name='__import__'" 2>/dev/null | grep -q 1; then
  exit 0
fi

ORDER="jm_settings jm_users jm_vacancies jm_perm_vacancies jm_bulletins
       jm_likes jm_chats jm_messages jm_saved jm_perm_saved jm_perm_applications
       jm_notifications jm_ratings jm_complaints jm_bot_messages
       jm_support_messages jm_support_threads jm_web_push_subscriptions
       jm_vacancy_views jm_perm_vacancy_views jm_worker_slots"

say "перенос" "начинаю"
report=""
for t in $ORDER; do
  off=0; got=0
  while :; do
    page=$(curl -s -m 120 "$SB_URL/rest/v1/$t?select=*&limit=1000&offset=$off" \
             -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY")
    # Таблицы может не быть в облаке — это не ошибка, просто пропускаем.
    case "$page" in
      '[]') break ;;
      '['*) ;;
      *) break ;;
    esac
    n=$(printf '%s' "$page" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    [ "$n" -eq 0 ] && break

    # Через jsonb_populate_recordset: он сам разложит поля по колонкам, и мне
    # не нужно знать ни их порядок, ни типы. Чужие ключи не помеха.
    printf '%s' "$page" | docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
      psql -q -U supabase_admin -d postgres \
      -c "create temp table _in (d jsonb);
          copy _in (d) from stdin csv quote e'\\x01' delimiter e'\\x02';
          insert into public.$t
            select * from jsonb_populate_recordset(null::public.$t, (select d from _in))
            on conflict do nothing;" >/dev/null 2>&1 \
      || { say "перенос" "СПОТКНУЛСЯ на $t (сдвиг $off)"; exit 1; }

    got=$((got+n)); off=$((off+1000))
    [ "$n" -lt 1000 ] && break
  done
  have=$(q -tAc "select count(*) from public.$t" 2>/dev/null | tr -d '[:space:]')
  report="$report $t=$have"
done

q -c "insert into jm_migrations (name) values ('__import__') on conflict do nothing" >/dev/null 2>&1
say "перенос" "готово:$report"
