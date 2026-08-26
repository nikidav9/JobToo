#!/usr/bin/env bash
# Локальное самовосстановление web-входа. Внешний мониторинг фиксирует обрывы
# маршрута, а этот watchdog чинит то, что действительно можно исправить на
# самой машине: остановленный nginx или неудачную конфигурацию.
set -u

LOCK=/run/jt-site-watchdog.lock
STATE=/run/jt-site-watchdog.failures
LOG=/var/log/jt-watchdog.log
DOMAIN=${DOMAIN:-jobtoo.ru}

exec 9>"$LOCK"
flock -n 9 || exit 0

log() {
  printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$LOG"
}

healthy=1
systemctl is-active --quiet nginx || healthy=0
nginx -t >/tmp/jt-watchdog-nginx.log 2>&1 || healthy=0
code=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 8 \
  --resolve "$DOMAIN:443:127.0.0.1" --write-out '%{http_code}' "https://$DOMAIN/" 2>/dev/null || true)
[[ "$code" == 200 ]] || healthy=0

if [[ $healthy -eq 1 ]]; then
  previous=$(cat "$STATE" 2>/dev/null || echo 0)
  rm -f "$STATE"
  [[ "$previous" -gt 0 ]] && log "RECOVERED nginx=active local_https=$code"
  exit 0
fi

failures=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$failures" > "$STATE"
reason=$(grep -a -m1 -iE 'emerg|error' /tmp/jt-watchdog-nginx.log 2>/dev/null | cut -c1-240)
log "FAILED attempt=$failures nginx=$(systemctl is-active nginx 2>/dev/null || true) local_https=${code:-000} config=${reason:-unknown}"

# Одиночный сбой может быть коротким reload. Перезапускаем только после двух
# последовательных проверок, чтобы watchdog сам не создавал обрывы.
[[ $failures -lt 2 ]] && exit 1

if nginx -t >>"$LOG" 2>&1; then
  log "REPAIR restarting nginx after $failures consecutive failures"
  systemctl restart nginx >>"$LOG" 2>&1 || true
else
  log "REPAIR SKIPPED: nginx config is invalid; keeping last process alive"
fi

sleep 2
code=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 8 \
  --resolve "$DOMAIN:443:127.0.0.1" --write-out '%{http_code}' "https://$DOMAIN/" 2>/dev/null || true)
if systemctl is-active --quiet nginx && [[ "$code" == 200 ]]; then
  rm -f "$STATE"
  log "REPAIRED nginx=active local_https=$code"
  exit 0
fi

log "UNRESOLVED nginx=$(systemctl is-active nginx 2>/dev/null || true) local_https=${code:-000}"
exit 1
