#!/usr/bin/env bash
set -u

DOMAIN="${DOMAIN:-jobtoo.ru}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.jobtoo.ru}"
EXPECTED_IPV4="${EXPECTED_IPV4:-147.45.184.99}"
FALLBACK_HOST="${FALLBACK_HOST:-147.45.184.99.sslip.io}"
REPORT="${REPORT:-site-health.log}"
SAMPLES="${SAMPLES:-3}"
SAMPLE_GAP="${SAMPLE_GAP:-15}"
RUNNER_TEMP="${RUNNER_TEMP:-/tmp}"

exec > >(tee "$REPORT") 2>&1
failed=0
flaps=0
declare -A fails=([site]=0 [ipv4]=0 [api]=0 [app_asset]=0 [admin]=0 [admin_asset]=0 [fallback]=0)

echo "JobToo external availability check — $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "runner=$(hostname) domain=$DOMAIN admin=$ADMIN_DOMAIN samples=$SAMPLES gap=${SAMPLE_GAP}s"

answer=$(dig +short +time=5 +tries=2 A "$DOMAIN" 2>&1 | sed '/^$/d' | sort -u | tr '\n' ' ')
echo "dns_A=$answer"
if ! grep -Fqw "$EXPECTED_IPV4" <<<"$answer"; then
  echo "ERROR: $DOMAIN A does not contain $EXPECTED_IPV4"
  failed=1
fi
aaaa=$(dig +short +time=5 +tries=2 AAAA "$DOMAIN" 2>&1 | sed '/^$/d' | tr '\n' ' ')
echo "dns_AAAA=${aaaa:-(нет, так и задумано)}"

probe_url() {
  local name=$1 url=$2 family=${3:-auto} body=${4:-/dev/null} metrics rc
  local -a family_args=()
  [[ "$family" != auto ]] && family_args=("$family")
  set +e
  metrics=$(curl "${family_args[@]}" --silent --show-error --location \
    --connect-timeout 8 --max-time 20 --output "$body" \
    --write-out 'code=%{http_code} remote=%{remote_ip} tls=%{time_appconnect}s first_byte=%{time_starttransfer}s total=%{time_total}s' \
    "$url" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 && "$metrics" == *"code=200"* ]]; then
    PROBE_OK=1; echo "  $name: OK $metrics"
  else
    PROBE_OK=0; echo "  $name: FAIL rc=$rc $metrics"
  fi
}

first_asset() {
  sed -nE 's/.*<(script|link)[^>]+(src|href)="([^"]+\.(js|css)(\?[^" ]*)?)".*/\3/p' "$1" | head -1
}

record() {
  local key=$1
  [[ $PROBE_OK -eq 1 ]] || { fails[$key]=$(( fails[$key]+1 )); }
}

for i in $(seq 1 "$SAMPLES"); do
  echo "sample $i/$SAMPLES @ $(date -u +'%H:%M:%SZ')"
  site_html="$RUNNER_TEMP/jobtoo-site-$i.html"
  admin_html="$RUNNER_TEMP/jobtoo-admin-$i.html"

  probe_url site "https://$DOMAIN/" auto "$site_html"; record site
  probe_url ipv4 "https://$DOMAIN/" -4; record ipv4

  app_asset=$(first_asset "$site_html")
  if [[ -n "$app_asset" ]]; then
    [[ "$app_asset" =~ ^https?:// ]] || app_asset="https://$DOMAIN/${app_asset#/}"
    probe_url app_asset "$app_asset"; record app_asset
  else
    PROBE_OK=0; echo "  app_asset: FAIL no JS/CSS asset in HTML"; record app_asset
  fi

  probe_url api "https://$DOMAIN/api/v1/health"; record api
  probe_url admin "https://$ADMIN_DOMAIN/login" auto "$admin_html"; record admin

  admin_asset=$(first_asset "$admin_html")
  if [[ -n "$admin_asset" ]]; then
    [[ "$admin_asset" =~ ^https?:// ]] || admin_asset="https://$ADMIN_DOMAIN/${admin_asset#/}"
    probe_url admin_asset "$admin_asset"; record admin_asset
  else
    PROBE_OK=0; echo "  admin_asset: FAIL no JS/CSS asset in HTML"; record admin_asset
  fi

  probe_url fallback "https://$FALLBACK_HOST/health" -4; record fallback
  [[ $i -lt $SAMPLES ]] && sleep "$SAMPLE_GAP"
done

echo "── итог серии ──"
for key in site ipv4 api app_asset admin admin_asset fallback; do
  echo "fails_$key=${fails[$key]}/$SAMPLES"
done

# Даже короткий подтверждённый провал важен: раньше он скрывался за зелёным
# итогом и именно поэтому жалобы пользователя не совпадали с Actions.
for key in site ipv4 api app_asset admin admin_asset; do
  if [[ ${fails[$key]} -gt 0 ]]; then
    failed=1
    flaps=$(( flaps + fails[$key] ))
  fi
done
echo "flaps=$flaps"
echo "result=$([[ $failed -eq 0 ]] && echo healthy || echo failed) flaps=$flaps"
exit "$failed"
