#!/bin/bash
# Работает ли то, чем приложение живёт: сигналы об обновлениях и загрузка файлов.
#
# Проверка переписана вслед за переустройством. Раньше приложение подписывалось
# на изменения таблиц и клало файлы в хранилище само — обоим нужен был ключ с
# правами, а он лежит в каждой установленной сборке. Теперь наружу уходит
# только сигнал «раздел изменился», а файлы идут через прокси. Значит и
# проверять надо другое: публикация и права анонимной роли больше ни на что
# не влияют.
#
# Каждая из трёх проверок ломается тихо. Сигнал не дошёл — экраны просто
# обновляются с задержкой, и виноватым выглядит интернет. Загрузка не прошла —
# человек видит «фото не отправляется» и никто не знает почему.

set -u
cd /opt/jobtoo/infra 2>/dev/null || exit 0
set -a; . /opt/jobtoo-secrets/env; set +a

IP=$(ip -4 addr show scope global 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | head -1)
BASE="https://${IP}.sslip.io"
out=""

# 1. Пускает ли Realtime приложение с его ключом. Ответ 101 значит, что
# подключение согласовано; ничего больше этому ключу и не нужно.
ws=$(curl -s -o /dev/null -m 10 -w '%{http_code}' \
     -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     -H 'Host: realtime-dev.localhost' \
     "http://127.0.0.1:4000/socket/websocket?apikey=$ANON_KEY&vsn=1.0.0" 2>/dev/null)
out="$out подписка=${ws:-нет}"

# 2. Доходит ли до Realtime сам сигнал. Этот путь уже был сломан однажды:
# шлюз уводил служебные вызовы туда же, куда подписки, и они отвечали 404 —
# а отправка сообщения намеренно не падает из-за несостоявшегося сигнала.
sig=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -X POST \
      -H "apikey: $SERVICE_ROLE_KEY" -H 'Content-Type: application/json' \
      -d '{"messages":[{"topic":"jt","event":"changed","payload":{"что":"проверка"}}]}' \
      "$BASE/realtime/v1/api/broadcast" 2>/dev/null)
out="$out сигнал=${sig:-нет}"

# 3. Настоящая загрузка файла — тем же путём, каким её делает приложение:
# через прокси, с пропуском приложения. Проверяем и то, что файл потом
# открывается по ссылке: залитый, но недоступный файл выглядит для человека
# точно так же, как незалитый.
SEC=$(docker compose exec -T php php -r '
  $s = @include "/var/www/api/app_secrets.php";
  echo is_array($s) ? ($s["APP_SECRET"] ?? "") : "";' 2>/dev/null | tr -d '\r\n')

if [ -n "$SEC" ]; then
  body='{"fn":"dbUploadFile","args":["probe/jt-check.txt","anQtcHJvdmVya2E=","text/plain"]}'
  up=$(curl -s -m 30 -X POST -H "X-App-Secret: $SEC" -H 'Content-Type: application/json' \
       -d "$body" "$BASE/api/db.php" 2>/dev/null | tr -d '\n' | cut -c1-160)
  case "$up" in
    *'"url"'*) out="$out загрузка=есть" ;;
    *)         out="$out загрузка=нет($(echo "$up" | cut -c1-80))" ;;
  esac

  got=$(curl -s -o /dev/null -m 10 -w '%{http_code}' \
        "$BASE/storage/v1/object/public/avatars/probe/jt-check.txt" 2>/dev/null)
  out="$out открывается=${got:-нет}"

  # Убираем за собой: проверка не должна оставлять мусор в хранилище людей.
  curl -s -o /dev/null -m 10 -X DELETE \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    "$BASE/storage/v1/object/avatars/probe/jt-check.txt" >/dev/null 2>&1
else
  out="$out загрузка=пропуска нет"
fi

echo "$(date +%H:%M)$out" > /var/lib/jt-anon-check2
