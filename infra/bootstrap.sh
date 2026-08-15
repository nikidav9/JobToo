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

say() {
  # Пишем в свой же журнал, а не только наружу: сторонний канал сегодня
  # молча перестал принимать, и наблюдение отвалилось вместе с ним.
  echo "$(date -Is) [$1] $2" >> /var/log/jt-apply.log
  curl -s -m 10 -H "Title: $1" -d "$2" "$NTFY" >/dev/null 2>&1 || true
}

# ── Подготовка машины ─────────────────────────────────────────────────────
# Всё тяжёлое живёт здесь, а не в cloud-init, по горькому опыту: там это
# была служба типа oneshot, а systemd убивает такие через 90 секунд. Установка
# Docker в полторы минуты не укладывается, и она обрывалась на полуслове.
# Здесь же таймаут снят, а любая поломка чинится коммитом, а не пересозданием.

if [ ! -f /swapfile ]; then
  # На 4 ГБ памяти Postgres, Realtime и Storage без подкачки будут толкаться.
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile \
    && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

if ! command -v docker >/dev/null 2>&1; then
  say "установка" "ставлю docker"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y jq openssl python3 certbot python3-certbot-nginx
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh
  systemctl enable --now docker
  say "установка" "docker=$(docker --version 2>/dev/null || echo не встал)"
fi

# ufw здесь намеренно НЕ включается.
#
# Он спорит с Docker за одни и те же правила iptables: политика FORWARD по
# умолчанию DROP обрывает связь между контейнерами и их выход в интернет.
# Внешне это выглядит как бесконечный перезапуск служб, и именно на этом
# сборка встала намертво — вместе с наблюдением за ней.
#
# Пока без него: наружу открыты только 80 и 443, всё остальное слушает
# 127.0.0.1, а часть портов закрыта самим Timeweb. Вернём отдельным шагом,
# настроив DOCKER-USER, когда система заработает и поломку будет видно.
ufw --force disable >/dev/null 2>&1 || true

# Отчёт из репозитория заменяет тот, что зашит в cloud-init: этот можно
# править коммитом, а тот — только пересозданием машины.
if [ -f "$REPO/infra/report.sh" ]; then
  install -m 755 "$REPO/infra/report.sh" /usr/local/bin/jt-report
fi

# ── Секреты ───────────────────────────────────────────────────────────────
if [ ! -f "$SECRETS" ]; then
  mkdir -p "$(dirname "$SECRETS")"
  chmod 700 "$(dirname "$SECRETS")"

  PGPASS=$(openssl rand -hex 24)
  JWTSEC=$(openssl rand -hex 32)
  SKB=$(openssl rand -hex 32)
  # Realtime требует ровно 16 байт: с 32 он падает на «Bad key size» и
  # молча не обслуживает подписки, хотя контейнер выглядит здоровым.
  ENCKEY=$(openssl rand -hex 8)

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
grep -q "^PUBLIC_URL=" "$SECRETS" || echo "PUBLIC_URL=http://$(hostname -I | awk '{print $1}')" >> "$SECRETS"

# Секреты нужны не только docker compose, но и самому скрипту — для psql.
set -a; . "$SECRETS"; set +a

# ── Контейнеры ────────────────────────────────────────────────────────────
cd "$REPO/infra"
chmod +x init/*.sh 2>/dev/null || true
timeout 600 docker compose --env-file "$SECRETS" up -d --remove-orphans || say "контейнеры" "up не уложился в 10 минут"

# ── Шлюз ──────────────────────────────────────────────────────────────────
# Свою конфигурацию кладём вместо стандартной: две одновременно спорят
# за default_server, и nginx не поднимется.
cp "$REPO/infra/nginx.conf" /etc/nginx/sites-available/jobtoo
ln -sf /etc/nginx/sites-available/jobtoo /etc/nginx/sites-enabled/jobtoo
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

set +e
# ── Роли ──────────────────────────────────────────────────────────────────
# Не через docker-entrypoint-initdb.d: те скрипты выполняются только при
# создании пустого каталога данных, а образ Supabase приходит с уже готовым.
# Наш файл там молча не отрабатывал, пароли служебным ролям не задавались,
# и rest, realtime и storage бесконечно перезапускались, не сумев войти.
#
# Здесь же — после запуска, и при каждом заходе: alter role идемпотентен.
for i in $(seq 1 40); do
  docker compose exec -T db pg_isready -U supabase_admin -h localhost >/dev/null 2>&1 && break
  sleep 5
done

# Проверку «а можно ли войти» убрал: она глотала причину отказа, и блок
# молча пропускался. Пусть команда выполняется всегда и всегда докладывает —
# ошибка полезнее тишины.
docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
  psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres >/tmp/jt-roles.log 2>&1 <<SQL

    -- Роли создаём, а не только настраиваем: образ supabase/postgres их не
    -- приносит, вопреки моему первоначальному допущению. psql отвечал
    -- «role authenticator does not exist», а службы бесконечно
    -- перезапускались, не сумев войти.
    --
    -- Имена и права повторяют облачные: разведи их по-своему — и миграции
    -- из supabase/migrations начнут падать на GRANT-ах.
    do \$\$ begin
      -- anon: тот, кем PostgREST представляется без токена. Прав почти нет,
      -- всё закрыто через RLS (см. 013_lock_down_rls.sql).
      if not exists (select from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
      end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
      end if;
      -- service_role ходит мимо RLS: под ним работает php-proxy.
      if not exists (select from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
      end if;
      -- authenticator — тот, кто подключается и переключается в нужную роль
      -- по токену. Единственный из троих, кто умеет входить.
      if not exists (select from pg_roles where rolname = 'authenticator') then
        create role authenticator login noinherit;
      end if;
      if not exists (select from pg_roles where rolname = 'supabase_storage_admin') then
        create role supabase_storage_admin login createrole;
      end if;
    end \$\$;

    alter role authenticator          with login password '${POSTGRES_PASSWORD}';
    alter role supabase_storage_admin with login password '${POSTGRES_PASSWORD}';

    grant anon, authenticated, service_role to authenticator;

    create schema if not exists _realtime;
    alter schema _realtime owner to supabase_admin;
    create schema if not exists storage;
    alter schema storage owner to supabase_storage_admin;

    grant usage on schema public  to anon, authenticated, service_role;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on all tables    in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    alter default privileges in schema public grant all on tables    to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
SQL
rc=$?
set -e
if [ $rc -eq 0 ]; then
  say "роли" "заданы"
  # Службы, которые уже успели упасть на неверном пароле, сами не оживут:
  # они перезапускаются с тем же кэшем неудачи. Подталкиваем.
  docker compose restart rest realtime storage >/dev/null 2>&1 || true
else
  say "роли" "ОШИБКА($rc): $(tail -4 /tmp/jt-roles.log | tr '\n' ' ' | cut -c1-300)"
fi

# ── Миграции ──────────────────────────────────────────────────────────────
# После контейнеров: накатыватель сам подождёт базу и Storage, а если те
# ещё не готовы — тихо отложит до следующего запуска таймера.
chmod +x "$REPO/infra/migrate.sh" 2>/dev/null || true
bash "$REPO/infra/migrate.sh" || say "миграции" "не прошли, см. следующий заход"

# Ключ шифрования Realtime: если он неверной длины, служба поднимается, но
# подписки не работают — то есть чаты перестают обновляться живьём, а внешне
# всё в порядке. Худший вид поломки, поэтому чиним отдельно.
if [ "${#REALTIME_ENC_KEY}" -ne 16 ]; then
  NEWKEY=$(openssl rand -hex 8)
  sed -i "s/^REALTIME_ENC_KEY=.*/REALTIME_ENC_KEY=$NEWKEY/" "$SECRETS"
  # Старые записи зашифрованы прежним ключом и уже не расшифруются;
  # своё хозяйство Realtime заведёт заново при следующем запуске.
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    psql -q -U supabase_admin -d postgres \
    -c "drop schema if exists _realtime cascade; create schema _realtime;
        alter schema _realtime owner to supabase_admin;" >/dev/null 2>&1
  set -a; . "$SECRETS"; set +a
  docker compose up -d --force-recreate realtime >/dev/null 2>&1
  say "realtime" "ключ шифрования заменён на верную длину"
fi

# ── Временный мост по ключу ───────────────────────────────────────────────
# Прокси на хостинге ходит со старым ключом облака: новый лежит в секретах
# GitHub, а поменять их может только владелец. Пока это не сделано, nginx
# принимает старый ключ и подставляет вместо него новый.
#
# Это мост, а не решение. Он не расширяет доступ: старый ключ и раньше давал
# те же права на те же данные, а знают его те же места, что и прежде.
# Убрать сразу, как в настройках появится SB_SERVICE_KEY от нового сервера.
#
# Сам ключ берётся из файла на машине и в репозиторий не попадает.
if [ -f /opt/jobtoo-secrets/cloud ]; then
  OLDKEY=$(grep -m1 '^SB_KEY=' /opt/jobtoo-secrets/cloud | cut -d= -f2-)
  if [ -n "$OLDKEY" ] && [ -n "${SERVICE_ROLE_KEY:-}" ]; then
    cat > /etc/nginx/conf.d/jt-authswap.conf <<EOF
# Ключи — длинные строки, в стандартный буфер сопоставления не помещаются:
# nginx отвечает «could not build map_hash».
map_hash_bucket_size 512;
map_hash_max_size 2048;

map \$http_authorization \$jt_auth {
    default   \$http_authorization;
    "Bearer $OLDKEY" "Bearer $SERVICE_ROLE_KEY";
}
map \$http_apikey \$jt_apikey {
    default  \$http_apikey;
    "$OLDKEY" "$SERVICE_ROLE_KEY";
}
EOF
    chmod 600 /etc/nginx/conf.d/jt-authswap.conf
  fi
fi

# ── Резервные копии ───────────────────────────────────────────────────────
# Ставим таймер один раз. Копия делается раньше переключения намеренно:
# после него данные 420 человек будут жить в единственном экземпляре.
install -m 755 "$REPO/infra/backup.sh" /usr/local/bin/jt-backup 2>/dev/null || true
if [ ! -f /etc/systemd/system/jt-backup.timer ]; then
  cat > /etc/systemd/system/jt-backup.service <<'EOF'
[Unit]
Description=Резервная копия базы и файлов
[Service]
Type=oneshot
ExecStart=/usr/local/bin/jt-backup
TimeoutStartSec=3600
EOF
  cat > /etc/systemd/system/jt-backup.timer <<'EOF'
[Unit]
Description=Резервная копия базы и файлов
[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now jt-backup.timer
  # Первую копию делаем сразу, не дожидаясь ночи: без неё данные существуют
  # в одном экземпляре прямо сейчас.
  /usr/local/bin/jt-backup || true
fi

# ── Панель и сертификат ───────────────────────────────────────────────────
# Пароль к панели создаётся один раз и лежит рядом с остальными секретами.
if [ ! -f /opt/jobtoo-secrets/studio ]; then
  SPASS=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)
  echo "STUDIO_USER=admin"      >  /opt/jobtoo-secrets/studio
  echo "STUDIO_PASS=$SPASS"     >> /opt/jobtoo-secrets/studio
  chmod 600 /opt/jobtoo-secrets/studio
fi
. /opt/jobtoo-secrets/studio
if [ ! -f /etc/nginx/.htpasswd ]; then
  printf '%s:%s\n' "$STUDIO_USER" "$(openssl passwd -apr1 "$STUDIO_PASS")" > /etc/nginx/.htpasswd
  chmod 640 /etc/nginx/.htpasswd
  chown root:www-data /etc/nginx/.htpasswd 2>/dev/null || true
fi

# Сертификат на имя вида <адрес>.sslip.io: своего домена пока нет, а без
# TLS пароль к панели ходил бы открытым текстом. Имя временное, поменяем
# на db.jobtoo.ru, когда до записи дойдут руки.
# Строго IPv4: ifconfig.me отдавал IPv6, и имя получалось несуществующим —
# certbot честно не мог выпустить сертификат на 2a03:...sslip.io.
# Строго IPv4: ifconfig.me отдавал IPv6, и имя получалось несуществующим —
# certbot честно не мог выпустить сертификат на 2a03:...sslip.io.
IP=$(ip -4 addr show scope global 2>/dev/null | grep -oE 'inet [0-9.]+' | awk '{print $2}' | head -1)
HOST="${IP}.sslip.io"

# certonly, а не --nginx: правки certbot в конфигурации не выживали. Этот
# скрипт переписывает её каждую минуту и стирал всё, что тот вносил —
# сертификат был выпущен, а отдавать его было некому.
if [ ! -d "/etc/letsencrypt/live/$HOST" ] && command -v certbot >/dev/null 2>&1; then
  certbot certonly --webroot -w /var/www/html -n --agree-tos \
    -m nikidav9@gmail.com -d "$HOST" >>/var/log/jt-apply.log 2>&1 \
    && say "сертификат" "выпущен на $HOST" \
    || say "сертификат" "не вышло, работаем по http"
fi

# TLS-часть подставляем сами, из своего файла.
if [ -d "/etc/letsencrypt/live/$HOST" ] && [ -f "$REPO/infra/nginx-tls.conf" ]; then
  sed "s/__HOST__/$HOST/g" "$REPO/infra/nginx-tls.conf" \
    >> /etc/nginx/sites-available/jobtoo
  if nginx -t >/tmp/jt-nginx.log 2>&1; then
    systemctl reload nginx
    say "tls" "включён: https://$HOST и панель https://$HOST:8443"
  else
    say "tls" "конфигурация не прошла: $(grep -a -m1 -iE 'emerg|error' /tmp/jt-nginx.log | cut -c1-220)"
    # Возвращаем рабочую конфигурацию без TLS, иначе перезапуск nginx
    # оставит сервер без шлюза вообще.
    cp "$REPO/infra/nginx.conf" /etc/nginx/sites-available/jobtoo
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
  fi
fi

# ── Перенос данных из облака ──────────────────────────────────────────────
# Только если мы вообще знаем, откуда переносить: ключ доступа к облаку
# приезжает отдельно и в репозитории его нет.
if [ -f /opt/jobtoo-secrets/cloud ]; then
  chmod +x "$REPO/infra/import.sh" 2>/dev/null || true
  bash "$REPO/infra/import.sh" || say "перенос" "не удался, см. следующий заход"
  chmod +x "$REPO/infra/import-files.sh" 2>/dev/null || true
  bash "$REPO/infra/import-files.sh" || say "файлы" "не удались, см. следующий заход"
fi

state=$(docker compose ps --format '{{.Service}}={{.State}}' 2>/dev/null | tr '\n' ' ')
say "развёрнуто" "$state"

# Если служба не поднялась — присылаем её журнал. Без этого «restarting»
# означает только «что-то не так», а причина остаётся на машине, куда мне
# не попасть.
for svc in db rest realtime storage; do
  st=$(docker compose ps "$svc" --format '{{.State}}' 2>/dev/null)
  case "$st" in
    running) ;;
    *) say "журнал:$svc" "$(docker compose logs --tail=12 --no-log-prefix "$svc" 2>&1 | tr -d '\r' | cut -c1-200 | tail -12)" ;;
  esac
done

# Обновляем страницу состояния — по ней я вижу происходящее снаружи.
[ -x /usr/local/bin/jt-report ] && /usr/local/bin/jt-report || true
