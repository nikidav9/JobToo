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
    [ "$s" = "running" ] && continue
    [ -n "$s" ] || continue
    [ $first -eq 0 ] && echo ","
    first=0
    log=$(cd /opt/jobtoo/infra && timeout 15 docker compose logs --tail=8 --no-log-prefix "$svc" 2>&1 \
          | tr -d '"\r' | tr '\n' ' ' | cut -c1-500)
    printf '    "%s": "%s"' "$svc" "$log"
  done
  echo
  echo "  },"
  # Ключевые шаги отдельно: в общем хвосте их забивают журналы контейнеров.
  echo "  \"роли\": \"$(grep -a '\[роли\]' /var/log/jt-apply.log 2>/dev/null | tail -2 | tr -d '"' | tr '\n' ' ' | cut -c1-400)\","
  echo "  \"миграции\": \"$(grep -a '\[миграции\]' /var/log/jt-apply.log 2>/dev/null | tail -2 | tr -d '"' | tr '\n' ' ' | cut -c1-300)\","
  echo "  \"заход\": \"$(tail -6 /var/log/jt-apply.log 2>/dev/null | tr -d '"' | tr '\n' ' ' | cut -c1-500)\""
  echo '}'
} > "$TMP" 2>/dev/null

mv -f "$TMP" "$OUT" 2>/dev/null || true
chmod 644 "$OUT" 2>/dev/null || true
