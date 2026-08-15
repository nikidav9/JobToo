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
# Первый заход на jobtoo.ru не вышел — тот же «Connection timed out». Зато
# он совпал с тем, что видно с самой машины: наружу к api.telegram.org по
# IPv6 доходит 4 запроса из 4, по IPv4 — 0 из 2. Ломается именно IPv4.
# А у jobtoo.ru есть обе записи, и какую взять — решает Телеграм.
#
# Отсюда tg.jobtoo.ru: то же приложение, тот же /api/tg.php, но у имени
# нет A-записи вовсе. Выбирать нечего, остаётся рабочий IPv6.
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

field() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("result",{}).get(sys.argv[1],""))' "$1" 2>/dev/null; }

BEFORE=$(api getWebhookInfo)
WAS=$(echo "$BEFORE" | field url)
PEND0=$(echo "$BEFORE" | field pending_update_count)
NEW="https://tg.jobtoo.ru/api/tg.php"

[ "$WAS" = "$NEW" ] && { echo "$(date +%H:%M) уже прямой" > /var/lib/jt-webhook-check; exit 0; }
echo "$WAS" > /var/lib/jt-webhook.prev

T0=$(date +%s)
api setWebhook -d "url=$NEW" -d "secret_token=$SECRET" -d "drop_pending_updates=false" >/dev/null

# Даём Телеграму время попробовать доставить. Ошибку смотрим не по тексту,
# а по времени: last_error_message остаётся от прошлого адреса и без свежей
# даты доказывает только то, что когда-то что-то не вышло.
sleep 45

INFO=$(api getWebhookInfo)
ERR=$(echo "$INFO" | field last_error_message)
EDATE=$(echo "$INFO" | field last_error_date)
PEND=$(echo "$INFO" | field pending_update_count)

if [ -n "$ERR" ] && [ "${EDATE:-0}" -ge "$T0" ] 2>/dev/null; then
  # Не дозвонился — возвращаем как было немедленно.
  api setWebhook -d "url=$WAS" -d "secret_token=$SECRET" >/dev/null
  # Пересылка проверяет заголовок у себя и дальше не передаёт — значит на
  # время отката обработчик должен принимать обновления и без него.
  touch /opt/jobtoo-proxy/tg_relay_mode 2>/dev/null || true
  echo "$(date +%H:%M) прямой путь НЕ вышел ($ERR) — вернул на $WAS" > /var/lib/jt-webhook-check
elif [ "${PEND0:-0}" -gt 0 ] && [ "${PEND:-0}" -lt "${PEND0:-0}" ] 2>/dev/null; then
  # Очередь была и рассосалась — доставка точно состоялась.
  rm -f /opt/jobtoo-proxy/tg_relay_mode 2>/dev/null || true
  echo "$(date +%H:%M) прямой путь работает: очередь $PEND0 -> $PEND" > /var/lib/jt-webhook-check
else
  # Ошибки нет, но и доставлять было нечего. Оставляем прямой путь — первое
  # же сообщение боту покажет правду, а откатить всегда успеем.
  echo "$(date +%H:%M) прямой путь поставлен, ошибок нет, но очередь пуста — итог покажет первое сообщение" > /var/lib/jt-webhook-check
fi
