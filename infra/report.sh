#!/bin/bash
# Отчёт о состоянии сервера.
#
# Кладём файлом, который отдаёт свой же nginx. Никаких сторонних сервисов:
# предыдущая версия слала в ntfy.sh, и тот перестал принимать с адреса
# сервера после сотен сообщений за день — наблюдение отвалилось молча и
# в самый неподходящий момент.
#
# Второе правило, тоже выученное на себе: отчёт не должен зависеть от того,
# о чём докладывает. Сначала пишем всё, что не требует Docker. Docker
# спрашиваем последним и с тайм-аутом — не ответил, так и запишем.

OUT=/var/www/html/status.json
TMP=/tmp/jt-status.$$

{
  echo '{'
  echo "  \"время\": \"$(date -Is)\","
  echo "  \"запущен\": \"$(uptime -s)\","
  echo "  \"нагрузка\": \"$(cut -d' ' -f1-3 /proc/loadavg)\","
  echo "  \"память_МБ\": \"$(free -m | awk '/^Mem/{print $3"/"$2}')\","
  echo "  \"подкачка_МБ\": \"$(free -m | awk '/^Swap/{print $3"/"$2}')\","
  echo "  \"диск\": \"$(df -h / | awk 'NR==2{print $4}') свободно\","
  echo "  \"nginx\": \"$(systemctl is-active nginx)\","
  echo "  \"docker\": \"$(systemctl is-active docker)\","
  echo "  \"таймер\": \"$(systemctl is-active jt-apply.timer)\","
  echo "  \"последний_заход\": \"$(systemctl show jt-apply.service -p ExecMainStatus --value 2>/dev/null)\","
  # Слушающие порты — самое полезное: по ним видно, поднялись ли службы,
  # даже когда Docker не отвечает вовсе.
  echo "  \"порты\": \"$(ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | grep -oE '[0-9]+$' | sort -un | tr '\n' ' ')\","
  echo "  \"версия\": \"$(cd /opt/jobtoo 2>/dev/null && git rev-parse --short HEAD 2>/dev/null || echo нет)\","

  st=$(cd /opt/jobtoo/infra 2>/dev/null && timeout 20 docker compose ps --format '{{.Service}}={{.State}}' 2>&1 | tr '\n' ' ' | tr -d '"')
  echo "  \"контейнеры\": \"${st:-docker не ответил за 20 секунд}\","

  echo "  \"журналы\": {"
  first=1
  for svc in db rest realtime storage; do
    s=$(cd /opt/jobtoo/infra 2>/dev/null && timeout 10 docker compose ps "$svc" --format '{{.State}}' 2>/dev/null)
    # storage и realtime показываем всегда: оба бывают «running» и при этом
    # не работают — первый отвечал 502, второй отвергает подписки.
    [ "$s" = "running" ] && [ "$svc" != "storage" ] && [ "$svc" != "realtime" ] && continue
    [ -n "$s" ] || continue
    [ $first -eq 0 ] && echo ","
    first=0
    # Берём хвост строки, а не начало: причина обычно в конце сообщения,
    # а начало занято перечислением уже применённых миграций.
    log=$(cd /opt/jobtoo/infra && timeout 15 docker compose logs --tail=6 --no-log-prefix "$svc" 2>&1 \
          | tr -d '"\r' | tr '\n' ' ' | tail -c 600)
    printf '    "%s": "%s"' "$svc" "$log"
  done
  echo
  echo "  },"
  # Проверка служб изнутри машины: снаружи шлюз может отвечать 502, и не
  # видно, кто виноват — он или сама служба.
  echo "  \"изнутри\": \"rest=$(curl -s -o /dev/null -w %{http_code} -m 5 http://127.0.0.1:3000/ 2>/dev/null) storage=$(curl -s -o /dev/null -w %{http_code} -m 5 http://127.0.0.1:5000/status 2>/dev/null) realtime=$(curl -s -o /dev/null -w %{http_code} -m 5 http://127.0.0.1:4000/api/tenants 2>/dev/null) studio=$(curl -s -o /dev/null -w %{http_code} -m 5 http://127.0.0.1:3001/ 2>/dev/null)\","

  # Ошибки Postgres: storage падает на своих миграциях, а сам показывает
  # только «DatabaseError» без текста. Причина видна лишь здесь.
  echo "  \"ошибки_базы\": \"$(cd /opt/jobtoo/infra 2>/dev/null && timeout 15 docker compose logs --tail=120 --no-log-prefix db 2>&1 | grep -aiE 'error|fatal' | tail -4 | tr -d '"\r' | tr '\n' ' ' | tail -c 500)\","

  # Realtime отвергает подключения: надо знать, какого арендатора он завёл.
  echo "  \"realtime_арендаторы\": \"$(cd /opt/jobtoo/infra 2>/dev/null && timeout 15 docker compose exec -T -e PGPASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' /opt/jobtoo-secrets/env | cut -d= -f2)" db psql -tAq -U supabase_admin -d postgres -c \"select external_id || ':' || name from _realtime.tenants\" 2>&1 | tr -d '\"' | tr '\n' ' ' | cut -c1-200)\","


  rt=$(cd /opt/jobtoo/infra 2>/dev/null && timeout 15 docker compose exec -T \
       -e PGPASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' /opt/jobtoo-secrets/env | cut -d= -f2)" db \
       psql -tAq -U supabase_admin -d postgres -c "
         select coalesce(string_agg(external_id || ' / ' || name, ', '), 'нет') from _realtime.tenants;
       " 2>&1 | tr -d '"\n' | cut -c1-160)
  echo "  \"realtime_состояние\": \"${rt:-не прочитать}\","

  # Состав схемы: имя таблицы и сколько в ней колонок и строк. Нужно, чтобы
  # сверить перенос по существу, а не по числу строк: пустая таблица нужна
  # ничуть не меньше полной, и её отсутствие по счётчикам не увидишь.
  sch=$(cd /opt/jobtoo/infra 2>/dev/null && timeout 25 docker compose exec -T \
        -e PGPASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' /opt/jobtoo-secrets/env | cut -d= -f2)" db \
        psql -tAq -U supabase_admin -d postgres -c "
          select string_agg(t.relname || ':' || c.cols || ':' || t.n, ' ' order by t.relname)
          from (select c.relname, c.reltuples::bigint as n, c.oid
                  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                 where ns.nspname='public' and c.relkind='r' and c.relname like 'jm\\_%') t
          join (select attrelid, count(*) cols from pg_attribute
                 where attnum > 0 and not attisdropped group by attrelid) c
            on c.attrelid = t.oid;" 2>&1 | tr -d '"\n' | cut -c1-1200)
  echo "  \"схема\": \"${sch:-не прочитать}\","

  # Переезд домена: три вещи, каждая из которых по отдельности выглядит
  # исправно, а вместе должны сойтись до смены записи в DNS.
  echo "  \"сертификаты\": \"$(ls /etc/letsencrypt/live 2>/dev/null | grep -v README | tr '\n' ' ')\","
  echo "  \"сайт\": \"файлов $(find /var/www/jobtoo -type f 2>/dev/null | wc -l), оболочка $([ -s /var/www/jobtoo/index.html ] && echo есть || echo нет)\","
  # Только наличие, без значений: страница открыта всем. Без токена бота
  # после переезда молча умрёт вебхук, без пароля — вход в дашборд.
  echo "  \"секреты_прокси\": \"$(cd /opt/jobtoo/infra 2>/dev/null && timeout 15 docker compose exec -T php php -r '
      foreach (["app_secrets.php","admin_credentials.php","sb_service_key.php","sb_url.php"] as $f) {
        $p = "/var/www/api/" . $f;
        if (!is_readable($p)) { echo "$f=нет "; continue; }
        $v = include $p;
        if (is_array($v)) { foreach ($v as $k => $x) echo $k . "=" . (strlen((string)$x) ? "есть" : "пусто") . " "; }
        else { echo $f . "=" . (strlen((string)$v) ? "есть" : "пусто") . " "; }
      }' 2>&1 | tr -d '"' | tr '\n' ' ' | cut -c1-300)\","

  # Ключевые шаги отдельно: в общем хвосте их забивают журналы контейнеров.
  echo "  \"роли\": \"$(grep -a '\[роли\]' /var/log/jt-apply.log 2>/dev/null | tail -2 | tr -d '"' | tr '\n' ' ' | cut -c1-400)\","
  echo "  \"миграции\": \"$(grep -a '\[миграции\]' /var/log/jt-apply.log 2>/dev/null | tail -2 | tr -d '"' | tr '\n' ' ' | cut -c1-300)\","
  echo "  \"заход\": \"$(tail -6 /var/log/jt-apply.log 2>/dev/null | tr -d '"' | tr '\n' ' ' | cut -c1-500)\""
  echo '}'
} > "$TMP" 2>/dev/null

mv -f "$TMP" "$OUT" 2>/dev/null || true
chmod 644 "$OUT" 2>/dev/null || true
