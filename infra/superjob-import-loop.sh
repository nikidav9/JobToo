#!/usr/bin/env bash
# Полный обход московских вакансий SuperJob.
# Один вызов ingest.php работает не дольше короткого окна и сохраняет
# checkpoint; этот worker сразу вызывает следующую порцию до конца каталога.
set -Eeuo pipefail

SECRETS=${SECRETS:-/opt/jobtoo-secrets/env}
OUT=/var/lib/jt-ingest-superjob.out
LOCK=/run/jt-superjob-import.lock
LOG=/var/log/jt-superjob-import.log

exec 9>"$LOCK"
flock -n 9 || exit 0
[ -r "$SECRETS" ] || { printf '%s secrets unavailable\n' "$(date -Is)" >>"$LOG"; exit 1; }

set -a
# shellcheck disable=SC1090
. "$SECRETS"
set +a
[ -n "${ADMIN_API_TOKEN:-}" ] || { printf '%s admin token unavailable\n' "$(date -Is)" >>"$LOG"; exit 1; }

for batch in $(seq 1 1000); do
  tmp="$OUT.tmp"
  request_ok=0
  for request_attempt in 1 2 3; do
    if curl -fsS --max-time 300 --config - \
      'https://jobtoo.ru/api/ingest.php?source=superjob&force=1' \
      -o "$tmp" <<CURL_CONFIG
header = "X-Admin-Token: $ADMIN_API_TOKEN"
CURL_CONFIG
    then
      request_ok=1
      break
    fi
    rm -f "$tmp"
    printf '%s request failed batch=%s attempt=%s\n' \
      "$(date -Is)" "$batch" "$request_attempt" >>"$LOG"
    sleep $((request_attempt * 5))
  done
  [ "$request_ok" -eq 1 ] || exit 1
  mv "$tmp" "$OUT"

  state=$(python3 - "$OUT" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as response:
        payload = json.load(response)
    runs = payload.get("run")
    if payload.get("ok") is not True or not isinstance(runs, list) or len(runs) != 1:
        raise ValueError("unexpected ingest envelope")
    status = runs[0].get("status", "")
    if not isinstance(status, str):
        raise ValueError("missing ingest status")
    if status.startswith("продолжение:"):
        print("pending")
    elif status.startswith("ок:"):
        print("complete")
    else:
        print("error")
except (OSError, ValueError, json.JSONDecodeError, TypeError):
    print("invalid")
PY
)

  if [ "$state" = pending ]; then
    sleep 2
    continue
  fi
  if [ "$state" = complete ]; then
    printf '%s complete batch=%s\n' "$(date -Is)" "$batch" >>"$LOG"
    exit 0
  fi

  printf '%s unexpected response batch=%s state=%s\n' \
    "$(date -Is)" "$batch" "$state" >>"$LOG"
  exit 1
done

printf '%s batch limit exceeded\n' "$(date -Is)" >>"$LOG"
exit 1
