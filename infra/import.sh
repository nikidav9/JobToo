#!/bin/bash
# Заливает выгруженные из облака данные в свою базу.
#
# Запускается вручную, не по таймеру: заливать данные повторно нельзя, а
# соблазн «пусть применяется само» здесь опасен — идемпотентность тут стоила
# бы либо потерянных строк, либо дублей.
#
# Данные приезжают отдельно, в /opt/jobtoo-import/, и в репозиторий не
# попадают: это персональные данные 420 человек, включая переписку.
#
# Порядок таблиц не алфавитный, а по зависимостям: сначала люди, потом их
# вакансии, потом отклики на эти вакансии. Иначе внешние ключи не сойдутся.
set -eu

REPO=${REPO:-/opt/jobtoo}
DATA=${DATA:-/opt/jobtoo-import}
NTFY=${NTFY:-https://ntfy.sh/jt-v4-m7q2z8}
say() {
  # В свой журнал, а не только наружу: сторонний канал перестал принимать
  # с адреса сервера, и все объяснения этого скрипта уходили в пустоту.
  echo "$(date -Is) [$1] $2" >> /var/log/jt-apply.log
  curl -s -m 10 -H "Title: $1" -d "$2" "$NTFY" >/dev/null 2>&1 || true
}

cd "$REPO/infra"
set -a; . /opt/jobtoo-secrets/env; set +a
q() { docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
        psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }

ORDER="jm_settings jm_users jm_vacancies jm_perm_vacancies jm_bulletins
       jm_likes jm_chats jm_messages jm_saved jm_perm_saved jm_perm_applications
       jm_notifications jm_ratings jm_complaints jm_bot_messages
       jm_support_messages jm_support_threads jm_web_push_subscriptions
       jm_vacancy_views jm_perm_vacancy_views jm_worker_slots"

report=""
for t in $ORDER; do
  f="$DATA/$t.json"
  [ -f "$f" ] || continue

  # Заливаем через json_populate_recordset: он сам разложит поля по колонкам
  # и не потребует от меня знать их порядок. Пропускаем то, что уже есть, —
  # на случай, если заливку придётся повторить после сбоя на середине.
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
    -c "create temp table _in (d jsonb);
        \\copy _in (d) from program 'cat' with (format csv, quote e'\\x01', delimiter e'\\x02');
        insert into public.$t select * from jsonb_populate_recordset(null::public.$t, (select d from _in))
        on conflict do nothing;" < "$f" >/dev/null 2>&1 || {
      say "заливка" "СПОТКНУЛАСЬ на $t"; exit 1; }

  n=$(q -tAc "select count(*) from public.$t" | tr -d '[:space:]')
  report="$report $t=$n"
done

say "заливка" "готово:$report"
echo "готово:$report"
