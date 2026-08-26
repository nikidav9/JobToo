#!/usr/bin/env bash
# Проверка сайта именно снаружи сервера. Локальный status.json не замечает
# обрыв маршрута между пользователем и Timeweb, поэтому эту команду запускает
# GitHub Actions из другой сети.
set -u

DOMAIN="${DOMAIN:-jobtoo.ru}"
EXPECTED_IPV4="${EXPECTED_IPV4:-147.45.184.99}"
EXPECTED_IPV6="${EXPECTED_IPV6:-2a03:6f00:a::1:ba1f}"
FALLBACK_HOST="${FALLBACK_HOST:-147.45.184.99.sslip.io}"
REPORT="${REPORT:-site-health.log}"

exec > >(tee "$REPORT") 2>&1

failed=0
now=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
echo "JobToo external availability check — $now"
echo "runner=$(hostname) domain=$DOMAIN"

check_dns() {
  local type=$1 expected=$2 answer
  answer=$(dig +short +time=5 +tries=2 "$type" "$DOMAIN" 2>&1 | sed '/^$/d' | sort -u | tr '\n' ' ')
  echo "dns_$type=$answer"
  if ! grep -Fqw "$expected" <<<"$answer"; then
    echo "ERROR: $DOMAIN $type does not contain $expected"
    failed=1
  fi
}

probe() {
  local name=$1 family=$2 url=$3 required=$4
  local body headers metrics rc
  local -a family_args=()
  [[ "$family" != auto ]] && family_args=("$family")
  body=$(mktemp)
  headers=$(mktemp)
  set +e
  metrics=$(curl "${family_args[@]}" --silent --show-error --location \
    --connect-timeout 8 --max-time 20 --retry 2 --retry-delay 2 \
    --output "$body" --dump-header "$headers" \
    --write-out 'code=%{http_code} remote=%{remote_ip} dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s first_byte=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}' \
    "$url" 2>&1)
  rc=$?
  set -e
  echo "$name: rc=$rc $metrics"
  sed -n '1,12p' "$headers" | sed "s/^/$name header: /"
  rm -f "$body" "$headers"
  if [[ $rc -ne 0 || "$metrics" != *"code=200"* ]]; then
    echo "$name: FAILED"
    [[ "$required" == required ]] && failed=1
  fi
  return 0
}

check_dns A "$EXPECTED_IPV4"
check_dns AAAA "$EXPECTED_IPV6"

# Обычный путь показывает то, что увидит браузер. IPv4 проверяется отдельно,
# потому что именно через него приходит большая часть жалоб. IPv6 оставляем
# диагностическим: отсутствие IPv6 на конкретном GitHub runner не должно
# объявлять весь сайт упавшим.
probe browser auto "https://$DOMAIN/" required
probe ipv4 -4 "https://$DOMAIN/" required
probe ipv6 -6 "https://$DOMAIN/" optional
probe fallback -4 "https://$FALLBACK_HOST/status.json" required

echo "result=$([[ $failed -eq 0 ]] && echo healthy || echo failed)"
exit "$failed"
