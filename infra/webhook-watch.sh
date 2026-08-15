#!/bin/bash
# Сторож прямого вебхука.
#
# Опыт switch-webhook.sh переводит вебхук на tg.jobtoo.ru и ждёт 45 секунд.
# Этого хватает, чтобы поймать отказ на пустом месте, но не хватает, чтобы
# доказать успех: если в очереди ничего не было и боту никто не писал,
# доставлять было нечего, и тишина ничего не значит.
#
# Поэтому дальше смотрим постоянно. Как только Телеграм впервые попробует
# доставить и не сможет — возвращаем вебхук на прежний адрес сам, не дожидаясь
# человека. Молчащий бот — худшее, чем это может кончиться, и стоит он ровно
# столько, сколько мы будем не смотреть.
#
# Ничего не делаем, пока вебхук не наш: чужой адрес — не наша забота.

set -u
cd /opt/jobtoo/infra 2>/dev/null || exit 0

MINE="https://tg.jobtoo.ru/api/tg.php"
PREV=$(cat /var/lib/jt-webhook.prev 2>/dev/null | tr -d '\r\n')
[ -z "$PREV" ] && exit 0

TOKEN=$(docker compose exec -T php php -r '
  $s = @include "/var/www/api/app_secrets.php";
  echo is_array($s) ? ($s["TG_BOT_TOKEN"] ?? "") : "";' 2>/dev/null | tr -d '\r\n')
SECRET=$(docker compose exec -T php php -r '
  $s = @include "/var/www/api/app_secrets.php";
  echo is_array($s) ? ($s["APP_SECRET"] ?? "") : "";' 2>/dev/null | tr -d '\r\n')
[ -z "$TOKEN" ] && exit 0

api() { curl -s -m 20 "https://api.telegram.org/bot$TOKEN/$1" "${@:2}"; }
field() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("result",{}).get(sys.argv[1],""))' "$1" 2>/dev/null; }

INFO=$(api getWebhookInfo)
URL=$(echo "$INFO" | field url)
[ "$URL" = "$MINE" ] || exit 0

ERR=$(echo "$INFO" | field last_error_message)
if [ -n "$ERR" ]; then
  api setWebhook -d "url=$PREV" -d "secret_token=$SECRET" >/dev/null
  echo "$(date +%H:%M) прямой путь отвалился ($ERR) — вернул на $PREV" > /var/lib/jt-webhook-check
  exit 0
fi

# Ошибок нет. Считаем успехом только подтверждённую доставку: у Телеграма
# это last_synchronization_error_date пусто и очередь не растёт.
PEND=$(echo "$INFO" | field pending_update_count)
if [ "${PEND:-0}" -gt 20 ] 2>/dev/null; then
  api setWebhook -d "url=$PREV" -d "secret_token=$SECRET" >/dev/null
  echo "$(date +%H:%M) очередь выросла до $PEND без ошибки — вернул на $PREV" > /var/lib/jt-webhook-check
  exit 0
fi

echo "$(date +%H:%M) прямой путь держится, в очереди $PEND" > /var/lib/jt-webhook-check
