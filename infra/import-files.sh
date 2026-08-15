#!/bin/bash
# Переносит файлы бакета avatars из облака: аватары, фотографии и голосовые
# сообщения из чатов.
#
# Их легко забыть — база переезжает, а картинки остаются ссылками на мёртвый
# адрес, и обнаруживает это человек, у которого пропало лицо в профиле.
#
# Как и данные, файлы качает сам сервер. Один раз, с отметкой в jm_migrations.
set -u

REPO=${REPO:-/opt/jobtoo}
SECRETS=/opt/jobtoo-secrets/env
CLOUD=/opt/jobtoo-secrets/cloud
say() { echo "$(date -Is) [$1] $2" >> /var/log/jt-apply.log; }

[ -f "$CLOUD" ] || exit 0
set -a; . "$SECRETS"; . "$CLOUD"; set +a

cd "$REPO/infra"
q() { docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
        psql -tAq -U supabase_admin -d postgres "$@"; }

q -c "select 1 from jm_migrations where name='__files__'" 2>/dev/null | grep -q 1 && exit 0

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Список бакета. Папки приходят как записи без размера — в них надо
# заглянуть отдельно, иначе перенесётся только то, что лежит в корне, а
# вложения чатов останутся в облаке.
ls_bucket() {
  curl -s -m 60 -X POST "$SB_URL/storage/v1/object/list/avatars" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"prefix\":\"$1\",\"limit\":1000,\"sortBy\":{\"column\":\"name\",\"order\":\"asc\"}}"
}

# Разбираем ответ построчно: имя и признак «это папка» (нет размера).
parse() {
  python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
if not isinstance(d,list): sys.exit(0)
for e in d:
    n=e.get('name')
    if not n: continue
    size=(e.get('metadata') or {}).get('size')
    print(('DIR' if size is None else 'FILE'), n)
"
}

names=""
while read -r kind name; do
  [ -z "$kind" ] && continue
  if [ "$kind" = "DIR" ]; then
    while read -r k2 n2; do
      [ "$k2" = "FILE" ] && names="$names $name/$n2"
    done <<< "$(ls_bucket "$name" | parse)"
  else
    names="$names $name"
  fi
done <<< "$(ls_bucket "" | parse)"

say "файлы" "нашёл в облаке: $(echo $names | wc -w)"

ok=0; bad=0
for n in $names; do
  [ -z "$n" ] && continue
  if ! curl -s -f -m 120 -o "$TMP/f" "$SB_URL/storage/v1/object/public/avatars/$n"; then
    bad=$((bad+1)); continue
  fi
  # Загружаем в свой Storage под сервисным ключом. upsert, чтобы повторный
  # запуск не спотыкался на уже перенесённом.
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 120 -X POST \
    "http://127.0.0.1:5000/object/avatars/$n" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "x-upsert: true" \
    --data-binary "@$TMP/f")
  case "$code" in
    200|201) ok=$((ok+1)) ;;
    *) bad=$((bad+1)); say "файлы" "не залился $n (код $code)" ;;
  esac
done

if [ "$bad" -eq 0 ]; then
  q -c "insert into jm_migrations (name) values ('__files__') on conflict do nothing" >/dev/null 2>&1
fi
say "файлы" "перенесено $ok, не вышло $bad"
