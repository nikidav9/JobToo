#!/bin/bash
# Разворачивает и обновляет всё хозяйство на сервере.
#
# Вызывается двумя способами: один раз при первой загрузке (из cloud-init)
# и дальше по таймеру, после git pull. Поэтому обязан быть идемпотентным:
# второй запуск не должен ничего ломать и ничего пересоздавать заново.
#
# Секреты живут только здесь, на сервере, в /opt/jobtoo-secrets/env.
# В репозиторий они не попадают и в cloud-init их нет: тот виден в панели.
# Создаются один раз и потом не меняются — иначе при каждом обновлении
# менялись бы ключи, а с ними отвалились бы и приложение, и дашборд.
set -eu

REPO=/opt/jobtoo
SECRETS=/opt/jobtoo-secrets/env
NTFY=${NTFY:-https://ntfy.sh/jt-v4-m7q2z8}

say() { curl -s -m 20 -H "Title: $1" -d "$2" "$NTFY" >/dev/null || true; }

# ── Секреты ───────────────────────────────────────────────────────────────
if [ ! -f "$SECRETS" ]; then
  mkdir -p "$(dirname "$SECRETS")"
  chmod 700 "$(dirname "$SECRETS")"

  PGPASS=$(openssl rand -hex 24)
  JWTSEC=$(openssl rand -hex 32)
  SKB=$(openssl rand -hex 32)
  ENCKEY=$(openssl rand -hex 16)

  # Ключи anon и service_role — это JWT, подписанные тем же секретом.
  # Ровно так же, как в облачном Supabase, иначе PostgREST их не примет.
  keys=$(python3 - "$JWTSEC" <<'PY'
import base64, hmac, hashlib, json, sys, time
secret = sys.argv[1].encode()
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def jwt(role):
    now = int(time.time())
    h = b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(',',':')).encode())
    p = b64(json.dumps({"role":role,"iss":"supabase","iat":now,
                        "exp":now+60*60*24*365*10},separators=(',',':')).encode())
    msg = f"{h}.{p}".encode()
    sig = b64(hmac.new(secret, msg, hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"
print(jwt("anon")); print(jwt("service_role"))
PY
)
  ANON=$(echo "$keys" | sed -n 1p)
  SERVICE=$(echo "$keys" | sed -n 2p)

  cat > "$SECRETS" <<EOF
POSTGRES_PASSWORD=$PGPASS
JWT_SECRET=$JWTSEC
ANON_KEY=$ANON
SERVICE_ROLE_KEY=$SERVICE
SECRET_KEY_BASE=$SKB
REALTIME_ENC_KEY=$ENCKEY
EOF
  chmod 600 "$SECRETS"
  say "секреты" "созданы заново"
fi

ln -sf "$SECRETS" "$REPO/infra/.env"

# ── Контейнеры ────────────────────────────────────────────────────────────
cd "$REPO/infra"
chmod +x init/*.sh 2>/dev/null || true
docker compose --env-file "$SECRETS" up -d --remove-orphans

# ── Шлюз ──────────────────────────────────────────────────────────────────
# Свою конфигурацию кладём вместо стандартной: две одновременно спорят
# за default_server, и nginx не поднимется.
cp "$REPO/infra/nginx.conf" /etc/nginx/sites-available/jobtoo
ln -sf /etc/nginx/sites-available/jobtoo /etc/nginx/sites-enabled/jobtoo
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

say "развёрнуто" "$(docker compose ps --format '{{.Service}}={{.State}}' 2>/dev/null | tr '\n' ' ')"
