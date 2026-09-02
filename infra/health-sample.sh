#!/usr/bin/env bash
# Катучая история здоровья — одна строка в минуту.
#
# status.json от report.sh — это снимок «прямо сейчас»: он перезаписывается
# каждую минуту и историю не хранит. Если сайт моргнул и восстановился, снимок
# уже снова показывает «всё здорово», и понять, что провал был, нечем: следы
# остаются лишь россыпью в jt-apply.log и jt-watchdog.log.
#
# Этот сэмплер закрывает ровно эту дыру. Раз в минуту он дописывает одну
# компактную строку NDJSON в файл, который отдаёт свой же nginx, и подрезает
# его до суточного окна. Получается читаемый таймлайн: видно и частоту
# провалов, и что именно с ними совпало — перезапуск шлюза, упавший контейнер,
# нехватка памяти. Именно этого не хватало, чтобы «то работает, то нет»
# перестало быть ощущением и стало графиком.
#
# Своим таймером, а не в конце bootstrap: тот при тяжёлом заходе идёт дольше
# минуты, и привязка истории к нему дала бы рваную шкалу. Здесь шаг ровный.
#
# Дёшево и быстро: только локальные замеры и короткие curl по loopback, без
# docker exec — тот в report.sh и есть самая медленная часть. Один проход
# укладывается в пару секунд, так что минутный шаг честный.
set -u

DOMAIN="${DOMAIN:-jobtoo.ru}"
OUT="${OUT:-/var/www/html/health-history.ndjson}"
KEEP="${KEEP:-43200}"         # 30 суток при шаге в минуту
LOCK=/run/jt-health-sample.lock
STATE=/run/jt-health-nginx-ts # засечка времени запуска nginx — ловим перезапуск

exec 9>"$LOCK"
flock -n 9 || exit 0

# Быстрый код HTTP по адресу. Короткий тайм-аут: замер не должен сам растягивать
# минуту, если служба висит. curl с -w сам печатает 000 при сбое соединения —
# фолбэк нужен лишь на случай, когда самого curl нет, поэтому подставляем 000
# только когда вывод пуст (иначе получилось бы «000000»).
code() { local c; c=$(curl -s -o /dev/null -m "${2:-3}" -w '%{http_code}' "$1" 2>/dev/null); echo "${c:-000}"; }

# Сайт через loopback — ровно то, что проверяет watchdog: отвечает ли TLS-vhost
# на самой машине, в обход маршрута Timeweb. Отдельно берём общее время: рост
# времени ответа виден раньше, чем полный отказ.
site_metrics=$(curl -s -o /dev/null -m 8 \
  --resolve "$DOMAIN:443:127.0.0.1" \
  -w '%{http_code} %{time_total}' "https://$DOMAIN/" 2>/dev/null)
site_metrics=${site_metrics:-000 0}
site_code=${site_metrics%% *}
site_time=${site_metrics##* }
# В миллисекундах и без дробей — так строка компактнее и сортируется как число.
site_ms=$(awk -v t="$site_time" 'BEGIN{printf "%d", t*1000}' 2>/dev/null || echo 0)

# Службы за шлюзом — прямым обращением на их порты. Каждая бывает «running» и
# при этом не обслуживает: rest отвечает 502, storage 500, realtime отвергает.
rest=$(code "http://127.0.0.1:3000/")
storage=$(code "http://127.0.0.1:5000/status")
realtime=$(curl -s -o /dev/null -m 3 -H 'Host: realtime-dev.localhost' \
  -w '%{http_code}' "http://127.0.0.1:4000/api/tenants" 2>/dev/null); realtime=${realtime:-000}

# IPv6 сайта. Запись AAAA у домена есть, но само по себе это ничего не значит:
# если второй стек не отвечает, у половины мобильных сетей сайт не откроется, а
# у остальных будет работать — «у соседа работает». Меряем каждую минуту.
ipv6=$(curl -6 -s -o /dev/null -m 6 -w '%{http_code}' "https://$DOMAIN/" 2>/dev/null); ipv6=${ipv6:-нет}

# PHP-прокси /api/db.php — реальный путь пользователя, а не только HTML. Пропуска
# приложения здесь нет и он не нужен: любой ответ php-fpm (400/401/405) означает
# «путь и обработчик живы». Молчание, 000 или 5xx — вот что значит «упало».
api=$(curl -s -o /dev/null -m 5 \
  --resolve "$DOMAIN:443:127.0.0.1" \
  -w '%{http_code}' "https://$DOMAIN/api/db.php" 2>/dev/null); api=${api:-000}

nginx=$(systemctl is-active nginx 2>/dev/null || echo unknown)

mem=$(free -m 2>/dev/null | awk '/^Mem/{print $3"/"$2}')
swap=$(free -m 2>/dev/null | awk '/^Swap/{print $3"/"$2}')
load=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)

# ── События минуты ────────────────────────────────────────────────────────
# Ради чего всё и затевалось: рядом с провалом видеть его причину.
events=""
add_event() { events="${events:+$events; }$1"; }

# Перезапуск nginx — по времени входа службы в активное состояние. Изменилось с
# прошлой минуты — значит между замерами nginx перезапускался, и как раз в эту
# минуту часть запросов могла оборваться.
now_ts=$(systemctl show nginx -p ActiveEnterTimestampMonotonic --value 2>/dev/null || echo 0)
prev_ts=$(cat "$STATE" 2>/dev/null || echo "")
printf '%s' "$now_ts" > "$STATE"
if [ -n "$prev_ts" ] && [ "$now_ts" != "$prev_ts" ] && [ "$now_ts" != "0" ]; then
  add_event "nginx перезапущен"
fi

# Что делал bootstrap в последние две минуты: пересборка шлюза и перезапуски
# служб — самые частые виновники коротких провалов. Берём последнюю запись
# jt-apply.log и включаем её, только если она свежая, — старую тащить незачем.
last_apply=$(tail -1 /var/log/jt-apply.log 2>/dev/null)
if [ -n "$last_apply" ]; then
  # Строка вида «2026-08-26T20:01:00+00:00 [шлюз] пересобран …».
  when=${last_apply%% *}
  when_epoch=$(date -d "$when" +%s 2>/dev/null || echo 0)
  if [ "$when_epoch" -gt 0 ] \
     && [ "$(( $(date +%s) - when_epoch ))" -le 120 ]; then
    case "$last_apply" in
      *шлюз*|*перезапущен*|*Recreated*|*Started*|*ключ*|*роль*)
        tag=$(printf '%s' "$last_apply" | sed -n 's/.*\[\([^]]*\)\].*/\1/p')
        add_event "заход:${tag:-?}" ;;
    esac
  fi
fi

# Деградация служб — тоже событие: контейнер жив, а путь не обслуживается.
# Флагуем только настоящий отказ (нет ответа или 5xx), а не любой не-200:
# /api/tenants у Realtime и /api/db.php у прокси штатно отвечают 403/405 без
# токена — это «служба жива и отвечает», а не авария. Здоровье живого пути
# Realtime (вебсокет 101, broadcast 202) проверяет check-anon.sh отдельно;
# метить 403 здесь значило бы поднимать ложную тревогу каждую минуту.
[ "$nginx" != "active" ] && add_event "nginx=$nginx"
[ "$site_code" != "200" ] && add_event "сайт=$site_code"
[ "$rest" != "200" ] && add_event "rest=$rest"
# storage /status отдаёт 200; для него не-200 — уже беда.
[ "$storage" != "200" ] && add_event "storage=$storage"
case "$realtime" in 000|5??) add_event "realtime=$realtime" ;; esac
case "$api" in 000|5??) add_event "api=$api" ;; esac

# ── Строка ────────────────────────────────────────────────────────────────
# Ключи русские — как в status.json, чтобы читалось единообразно. Значения без
# кавычек внутри: числа и коды кавычек не содержат, а events собираем сами и
# в него постороннего не попадает.
line=$(printf '{"время":"%s","эпоха":%s,"nginx":"%s","сайт":"%s","мс":%s,"api":"%s","rest":"%s","storage":"%s","realtime":"%s","ipv6":"%s","память":"%s","подкачка":"%s","нагрузка":"%s","событие":"%s"}' \
  "$(date -Is)" "$(date +%s)" "$nginx" "$site_code" "${site_ms:-0}" "$api" \
  "$rest" "$storage" "$realtime" "$ipv6" "${mem:-?}" "${swap:-?}" "${load:-?}" "$events")

# Дописываем и подрезаем до окна. Через временный файл и mv: nginx в любой момент
# видит целый файл, а не оборванную на середине строку.
mkdir -p "$(dirname "$OUT")"
printf '%s\n' "$line" >> "$OUT" 2>/dev/null || exit 0
if [ "$(wc -l < "$OUT" 2>/dev/null || echo 0)" -gt "$KEEP" ]; then
  tmp="$OUT.trim.$$"
  tail -n "$KEEP" "$OUT" > "$tmp" 2>/dev/null && mv -f "$tmp" "$OUT" 2>/dev/null || rm -f "$tmp"
fi
chmod 644 "$OUT" 2>/dev/null || true
