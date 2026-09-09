#!/usr/bin/env bash
# Полный обход московских вакансий «Работы в России».
# ingest.php работает короткими порциями и хранит checkpoint; этот worker
# вызывает следующую порцию, пока источник не сообщит о завершении.
set -Eeuo pipefail

SECRETS=${SECRETS:-/opt/jobtoo-secrets/env}
OUT=/var/lib/jt-ingest-trudvsem.out
LOCK=/run/jt-trudvsem-import.lock
LOG=/var/log/jt-trudvsem-import.log

exec 9>"$LOCK"
flock -n 9 || exit 0
[ -r "$SECRETS" ] || { printf '%s secrets unavailable\n' "$(date -Is)" >>"$LOG"; exit 1; }

set -a
# shellcheck disable=SC1090
. "$SECRETS"
set +a
[ -n "${ADMIN_API_TOKEN:-}" ] || { printf '%s admin token unavailable\n' "$(date -Is)" >>"$LOG"; exit 1; }

for batch in $(seq 1 300); do
  tmp="$OUT.tmp"
  request_ok=0
  for request_attempt in 1 2 3; do
    if curl -fsS --max-time 300 \
      -H "X-Admin-Token: $ADMIN_API_TOKEN" \
      'https://jobtoo.ru/api/ingest.php?source=trudvsem&force=1' \
      -o "$tmp"; then
      request_ok=1
      break
    fi
    rm -f "$tmp"
    printf '%s request failed batch=%s attempt=%s\n' \
      "$(date -Is)" "$batch" "$request_attempt" >>"$LOG"
    sleep $((request_attempt * 5))
  done
  if [ "$request_ok" -ne 1 ]; then
    exit 1
  fi
  mv "$tmp" "$OUT"

  if grep -q 'продолжение:' "$OUT"; then
    sleep 2
    continue
  fi
  if grep -q '"status":"ок' "$OUT"; then
    printf '%s complete batch=%s\n' "$(date -Is)" "$batch" >>"$LOG"
    exit 0
  fi

  printf '%s unexpected response batch=%s\n' "$(date -Is)" "$batch" >>"$LOG"
  exit 1
done

printf '%s page limit exceeded\n' "$(date -Is)" >>"$LOG"
exit 1
