#!/bin/bash
# Перевести вебхук бота с Vercel прямо на этот сервер — и откатиться, если
# не выйдет.
#
# Зачем крюк вообще был. Телеграм перестал дозваниваться до jobtoo.ru, когда
# тот жил на Reg.ru: «Connection timed out», растущая очередь, бот молчал на
# любые /start. Vercel Телеграму доступен, поэтому вебхук увели туда, а
# оттуда обновление уходит к нам обычным запросом.
#
# Теперь jobtoo.ru — другая машина в другой сети, и прежняя причина могла
# отпасть. Проверить это можно только одним способом: перевести и посмотреть.
#
# Поэтому с сеткой. Переключаем, ждём, спрашиваем Телеграм, что у него вышло.
# Есть ошибка доставки — возвращаем как было, в ту же минуту. Хуже, чем было,
# стать не может: непринятые обновления Телеграм присылает повторно, так что
# сообщения не теряются даже в неудачном случае.

set -u
cd /opt/jobtoo/infra 2>/dev/null || exit 0

TOKEN=$(docker compose exec -T php php -r '
  $s = @include "/var/www/api/app_secrets.php";
  echo is_array($s) ? ($s["TG_BOT_TOKEN"] ?? "") : "";' 2>/dev/null | tr -d '\r\n')
SECRET=$(docker compose exec -T php php -r '
  $s = @include "/var/www/api/app_secrets.php";
  echo is_array($s) ? ($s["APP_SECRET"] ?? "") : "";' 2>/dev/null | tr -d '\r\n')

[ -z "$TOKEN" ] && { echo "нет токена" > /var/lib/jt-webhook-check; exit 0; }

api() { curl -s -m 20 "https://api.telegram.org/bot$TOKEN/$1" "${@:2}"; }

WAS=$(api getWebhookInfo | python3 -c 'import sys,json;print(json.load(sys.stdin).get("result",{}).get("url",""))' 2>/dev/null)
NEW="https://jobtoo.ru/api/tg.php"

[ "$WAS" = "$NEW" ] && { echo "$(date +%H:%M) уже прямой" > /var/lib/jt-webhook-check; exit 0; }
echo "$WAS" > /var/lib/jt-webhook.prev

api setWebhook -d "url=$NEW" -d "secret_token=$SECRET" -d "drop_pending_updates=false" >/dev/null

# Даём Телеграму время попробовать доставить. Если очередь пуста и никто не
# пишет боту, ошибки может не быть просто потому, что доставлять нечего, —
# поэтому дальше смотрим не только на ошибку, но и на саму возможность.
sleep 45

INFO=$(api getWebhookInfo)
ERR=$(echo "$INFO" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("result",{}).get("last_error_message",""))' 2>/dev/null)
PEND=$(echo "$INFO" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("result",{}).get("pending_update_count",0))' 2>/dev/null)

if [ -n "$ERR" ]; then
  # Не дозвонился — возвращаем как было немедленно.
  api setWebhook -d "url=$WAS" -d "secret_token=$SECRET" >/dev/null
  echo "$(date +%H:%M) прямой путь НЕ вышел ($ERR) — вернул на $WAS" > /var/lib/jt-webhook-check
else
  echo "$(date +%H:%M) прямой путь работает, в очереди $PEND" > /var/lib/jt-webhook-check
fi
