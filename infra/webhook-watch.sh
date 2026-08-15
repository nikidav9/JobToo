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

# Куда откатываться, если прямой путь не выдержит. Пустое значение сюда
# попадать не должно: setWebhook с пустым адресом — это удалить вебхук, то
# есть выключить бота вместо того, чтобы его спасти.
PREV=$(cat /var/lib/jt-webhook.prev 2>/dev/null | tr -d '\r\n')
case "$PREV" in
  https://*) ;;
  *) PREV="";;
esac

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

# Телеграм не ответил вовсе. Молчать тут нельзя: раньше сторож в этом случае
# просто выходил, отметку не трогал — и снаружи это выглядело точно так же,
# как «вебхук стёрт». Полдня можно гадать, что именно сломалось.
case "$INFO" in
  *'"ok":true'*) ;;
  *)
    echo "$(date +%H:%M) Телеграм не отвечает — вебхук не проверить" > /var/lib/jt-webhook-check
    exit 0;;
esac

URL=$(echo "$INFO" | field url)

# Пустой адрес — вебхука нет ни у нас, ни у пересылки, и бот не получает
# ничего. Само по себе это не чинится: Телеграм так и будет копить очередь.
# Ставим свой адрес обратно — хуже, чем «никуда», уже не будет.
if [ -z "$URL" ]; then
  api setWebhook -d "url=$MINE" -d "secret_token=$SECRET" >/dev/null
  echo "$(date +%H:%M) вебхука не было вовсе — поставил $MINE" > /var/lib/jt-webhook-check
  exit 0
fi

# Не наш адрес — значит откат уже случился. Отмечаемся всё равно: без записи
# сторож считал бы отметку просроченной и ходил в Телеграм каждую минуту.
if [ "$URL" != "$MINE" ]; then
  echo "$(date +%H:%M) вебхук на $URL — прямой путь не используется" > /var/lib/jt-webhook-check
  exit 0
fi

ERR=$(echo "$INFO" | field last_error_message)

# 401 — это не сеть, а рассинхрон ключей: secret_token у Телеграма остался от
# прошлого APP_SECRET. Откатываться тут нечего, надо просто переставить его
# заново. Отдельно от общего отката: иначе смена ключа выглядела бы как
# недоступность сервера и уводила вебхук обратно на пересылку.
case "$ERR" in
  *401*)
    api setWebhook -d "url=$MINE" -d "secret_token=$SECRET" >/dev/null
    echo "$(date +%H:%M) переставил secret_token после смены ключа" > /var/lib/jt-webhook-check
    exit 0;;
esac

if [ -n "$ERR" ]; then
  if [ -z "$PREV" ]; then
    # Откатываться некуда. Оставляем как есть и говорим об этом: молчащий
    # бот с вебхуком лучше молчащего бота без вебхука — очередь хотя бы
    # копится и уйдёт, когда путь починится.
    echo "$(date +%H:%M) прямой путь с ошибкой ($ERR), откатываться некуда" > /var/lib/jt-webhook-check
    exit 0
  fi
  api setWebhook -d "url=$PREV" -d "secret_token=$SECRET" >/dev/null
  # Пересылка на Vercel заголовок дальше не передаёт — на время отката
  # обработчик должен принимать обновления и без него.
  touch /opt/jobtoo-proxy/tg_relay_mode 2>/dev/null || true
  echo "$(date +%H:%M) прямой путь отвалился ($ERR) — вернул на $PREV" > /var/lib/jt-webhook-check
  exit 0
fi

# Ошибок нет. Считаем успехом только подтверждённую доставку: у Телеграма
# это last_synchronization_error_date пусто и очередь не растёт.
PEND=$(echo "$INFO" | field pending_update_count)
if [ "${PEND:-0}" -gt 20 ] && [ -n "$PREV" ] 2>/dev/null; then
  api setWebhook -d "url=$PREV" -d "secret_token=$SECRET" >/dev/null
  touch /opt/jobtoo-proxy/tg_relay_mode 2>/dev/null || true
  echo "$(date +%H:%M) очередь выросла до $PEND без ошибки — вернул на $PREV" > /var/lib/jt-webhook-check
  exit 0
fi

# Путь прямой и живой — послабление ни к чему.
rm -f /opt/jobtoo-proxy/tg_relay_mode 2>/dev/null || true
echo "$(date +%H:%M) прямой путь держится, в очереди $PEND" > /var/lib/jt-webhook-check
