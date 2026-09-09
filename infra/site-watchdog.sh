#!/usr/bin/env bash
# Локальное самовосстановление web-входа. Внешний мониторинг фиксирует обрывы
# маршрута, а этот watchdog чинит то, что действительно можно исправить на
# самой машине: остановленный nginx или неудачную конфигурацию.
#
# Здесь же запускаем лёгкую проверку локальной web-выкладки. Сам deploy-скрипт
# сравнивает git HEAD с уже развернутой версией, поэтому в обычную минуту это
# только несколько файловых операций. Тяжёлая Expo-сборка выполняется лишь
# после нового commit и больше не зависит от GitHub Actions.
set -u

LOCK=/run/jt-site-watchdog.lock
STATE=/run/jt-site-watchdog.failures
LOG=/var/log/jt-watchdog.log
DOMAIN=${DOMAIN:-jobtoo.ru}
LOCAL_DEPLOY=/opt/jobtoo/infra/local-web-deploy.sh

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

  # Не блокируем восстановление nginx из-за неудачной сборки: локальная
  # выкладка сама атомарна и при ошибке оставляет прежний сайт на месте.
  if [[ -f "$LOCAL_DEPLOY" ]]; then
    bash "$LOCAL_DEPLOY" >>"$LOG" 2>&1 || log "LOCAL_DEPLOY failed; previous site kept"
  fi
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
