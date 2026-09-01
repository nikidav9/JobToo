#!/usr/bin/env bash
# Проверка сайта именно снаружи сервера. Локальный status.json не замечает
# обрыв маршрута между пользователем и Timeweb, поэтому эту команду запускает
# GitHub Actions из другой сети.
#
# Раньше это был один замер за прогон. Беда в том, что GitHub жёстко троттлит
# расписанные workflow: «*/5» на деле идёт раз в 30–100 минут, и один снимок в
# такую редкую минуту почти наверняка проскакивает мимо короткого провала.
# Поэтому теперь за прогон — короткая серия замеров (burst) в пределах пары
# минут: если провал попал в окно, серия его застаёт. А чтобы видеть и то, что
# случилось между прогонами, в конце забираем катучую историю с самого сервера
# (health-history.ndjson) — её пишет infra/health-sample.sh раз в минуту.
set -u

DOMAIN="${DOMAIN:-jobtoo.ru}"
EXPECTED_IPV4="${EXPECTED_IPV4:-147.45.184.99}"
EXPECTED_IPV6="${EXPECTED_IPV6:-2a03:6f00:a::1:ba1f}"
FALLBACK_HOST="${FALLBACK_HOST:-147.45.184.99.sslip.io}"
REPORT="${REPORT:-site-health.log}"
SAMPLES="${SAMPLES:-5}"          # замеров за прогон
SAMPLE_GAP="${SAMPLE_GAP:-20}"   # секунд между замерами; 5×20 ≈ 1.5 мин < 5 мин

exec > >(tee "$REPORT") 2>&1

failed=0
flaps=0
now=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
echo "JobToo external availability check — $now"
echo "runner=$(hostname) domain=$DOMAIN samples=$SAMPLES gap=${SAMPLE_GAP}s"

check_dns() {
  local type=$1 expected=$2 answer
  answer=$(dig +short +time=5 +tries=2 "$type" "$DOMAIN" 2>&1 | sed '/^$/d' | sort -u | tr '\n' ' ')
  echo "dns_$type=$answer"
  if ! grep -Fqw "$expected" <<<"$answer"; then
    echo "ERROR: $DOMAIN $type does not contain $expected"
    failed=1
  fi
}

# Один замер одного пути. Возвращает код через глобальную PROBE_OK (0/1), чтобы
# серия могла считать, сколько замеров прошло, и отличить «упало сейчас» от
# «моргнуло разок».
PROBE_OK=0
probe() {
  local name=$1 family=$2 url=$3
  local metrics rc
  local -a family_args=()
  [[ "$family" != auto ]] && family_args=("$family")
  set +e
  metrics=$(curl "${family_args[@]}" --silent --show-error --location \
    --connect-timeout 8 --max-time 20 \
    --output /dev/null \
    --write-out 'code=%{http_code} remote=%{remote_ip} tls=%{time_appconnect}s first_byte=%{time_starttransfer}s total=%{time_total}s' \
    "$url" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 && "$metrics" == *"code=200"* ]]; then
    PROBE_OK=1
    echo "  $name: OK $metrics"
  else
    PROBE_OK=0
    echo "  $name: FAIL rc=$rc $metrics"
  fi
}

# /api/db.php — реальный путь пользователя, а не только HTML. Пропуска приложения
# здесь нет и он не нужен: любой ответ php-fpm (400/401/405) означает «путь и
# обработчик живы». Провал — это 000 (не достучались) или 5xx (шлюз/fpm лёг).
probe_api() {
  local code
  set +e
  code=$(curl --silent --output /dev/null --connect-timeout 8 --max-time 15 \
    --write-out '%{http_code}' "https://$DOMAIN/api/db.php" 2>/dev/null)
  set -e
  case "${code:-000}" in
    000|5??) PROBE_OK=0; echo "  api(/api/db.php): FAIL code=${code:-000}" ;;
    *)       PROBE_OK=1; echo "  api(/api/db.php): OK code=$code" ;;
  esac
}

check_dns A "$EXPECTED_IPV4"
# AAAA (входящий IPv6) намеренно убрана 26.08: маршрут к IPv6-адресу сервера у
# части сетей нестабилен, и браузер по нему не открывал сайт. Поэтому её
# отсутствие — это норма, а не сбой. Показываем ответ для справки, но прогон по
# нему не роняем.
aaaa=$(dig +short +time=5 +tries=2 AAAA "$DOMAIN" 2>&1 | sed '/^$/d' | tr '\n' ' ')
echo "dns_AAAA=${aaaa:-(нет, так и задумано)}"

# Считаем провалы по каждому пути за всю серию. Требуемые пути (browser, ipv4,
# api) роняют прогон, только если легли на ПОСЛЕДНЕМ замере — то есть «упало
# сейчас», а не «моргнуло и восстановилось». Любой промежуточный провал —
# «моргание»: не звоним по нему, но обязательно показываем.
declare -A fails=([browser]=0 [ipv4]=0 [ipv6]=0 [api]=0 [fallback]=0)
last_browser_ok=1 last_ipv4_ok=1 last_api_ok=1

for i in $(seq 1 "$SAMPLES"); do
  echo "sample $i/$SAMPLES @ $(date -u +'%H:%M:%SZ')"

  # Обычный путь — то, что увидит браузер (happy-eyeballs сам выберет стек).
  probe browser auto "https://$DOMAIN/"
  [[ $PROBE_OK -eq 1 ]] || { fails[browser]=$(( fails[browser]+1 )); }
  last_browser_ok=$PROBE_OK

  # IPv4 отдельно: через него приходит большая часть жалоб.
  probe ipv4 -4 "https://$DOMAIN/"
  [[ $PROBE_OK -eq 1 ]] || { fails[ipv4]=$(( fails[ipv4]+1 )); }
  last_ipv4_ok=$PROBE_OK

  # IPv6 диагностический: у половины мобильных сетей путь именно по нему, но
  # отсутствие IPv6 на конкретном GitHub runner не должно ронять весь прогон.
  probe ipv6 -6 "https://$DOMAIN/"
  [[ $PROBE_OK -eq 1 ]] || { fails[ipv6]=$(( fails[ipv6]+1 )); }

  # Путь пользователя к данным.
  probe_api
  [[ $PROBE_OK -eq 1 ]] || { fails[api]=$(( fails[api]+1 )); }
  last_api_ok=$PROBE_OK

  # Запасной адрес: минимальный health-check по имени из IP, мимо DNS домена.
  probe fallback -4 "https://$FALLBACK_HOST/health"
  [[ $PROBE_OK -eq 1 ]] || { fails[fallback]=$(( fails[fallback]+1 )); }

  [[ $i -lt $SAMPLES ]] && sleep "$SAMPLE_GAP"
done

echo "── итог серии ──"
for k in browser ipv4 ipv6 api fallback; do
  echo "fails_$k=${fails[$k]}/$SAMPLES"
done

# Моргания — провалы, которые к концу серии восстановились. Их-то раньше и не
# было видно. Роняем прогон только по «упало сейчас».
flaps=$(( fails[browser] + fails[ipv4] + fails[api] ))
[[ $last_browser_ok -eq 1 ]] || failed=1
[[ $last_ipv4_ok    -eq 1 ]] || failed=1
[[ $last_api_ok     -eq 1 ]] || failed=1
echo "flaps=$flaps (провалы, восстановившиеся к концу серии)"

# Подробные отчёты сервера намеренно не публикуются. Внешний мониторинг
# хранит собственный журнал как artifact GitHub Actions.
echo "result=$([[ $failed -eq 0 ]] && echo healthy || echo failed) flaps=$flaps"
exit "$failed"
