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

# dig нужен отдельно: docker ставился до того, как он понадобился, и на
# уже работающей машине блок ниже не выполняется.
if ! command -v dig >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y dnsutils >/dev/null 2>&1 || true
fi

if ! command -v docker >/dev/null 2>&1; then
  say "установка" "ставлю docker"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y jq openssl python3 certbot python3-certbot-nginx dnsutils
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh
  systemctl enable --now docker
  say "установка" "docker=$(docker --version 2>/dev/null || echo не встал)"
fi

# ── Файрвол ───────────────────────────────────────────────────────────────
# Прошлая попытка включить ufw обрушила сеть между контейнерами: его правило
# FORWARD по умолчанию DROP рвёт связь докерных сетей и их выход наружу.
# Внешне это выглядело как бесконечный перезапуск служб — сборка встала
# намертво вместе с наблюдением за ней.
#
# Поэтому теперь иначе: ufw не трогаем совсем, а закрываем лишнее через
# цепочку DOCKER-USER — ту самую, которую Docker для этого и оставляет и
# которую сам не перезаписывает.
#
# Наружу нужны только 22, 80, 443 и 8443 (панель). Всё остальное — Postgres,
# PostgREST, Realtime, Storage — слушает 127.0.0.1 и снаружи и так недоступно;
# правила ниже страхуют на случай, если что-то откроется по недосмотру.
if ! iptables -L DOCKER-USER -n 2>/dev/null | grep -q "jt-guard"; then
  iptables -I DOCKER-USER -m comment --comment "jt-guard" -j RETURN 2>/dev/null || true
fi

# 9000 — php-fpm. Он и так настроен слушать только 127.0.0.1 (см. compose),
# но контейнер работает в сети машины, и цена ошибки здесь — открытый наружу
# обработчик PHP. Две независимые преграды вместо одной.
for p in 5432 3000 3001 4000 5000 5001 9000 10050; do
  if ! iptables -C INPUT -p tcp --dport "$p" ! -i lo -j DROP 2>/dev/null; then
    iptables -I INPUT -p tcp --dport "$p" ! -i lo -j DROP 2>/dev/null || true
  fi
done

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

# ── Рабочий каталог прокси ────────────────────────────────────────────────
# Прокси ищет свои секреты рядом с собой — так устроен jt_secret(), и так же
# это лежит на Reg.ru. Поэтому собираем каталог, где код и секреты вместе:
# код из репозитория, секреты остаются между обновлениями.
#
# Сервисный ключ берём свой, локальный: прокси теперь ходит в свою же базу.
# Пропуск приложения и токен бота приезжают извне — в репозитории им не место.
# В образе php-fpm слушает 9000 на всех адресах. Пока у контейнера была своя
# сеть, это никого не касалось; теперь сеть общая с машиной, и без этой
# настройки обработчик PHP оказался бы открыт наружу.
mkdir -p /opt/jobtoo-php
printf '[www]\nlisten = 127.0.0.1:9000\n' > /opt/jobtoo-php/zz-listen.conf
chmod 644 /opt/jobtoo-php/zz-listen.conf

PROXY=/opt/jobtoo-proxy
mkdir -p "$PROXY"
cp -f "$REPO"/php-proxy/*.php "$PROXY"/ 2>/dev/null || true
rm -f "$PROXY"/*.example.php

printf "<?php return '%s';\n" "$SERVICE_ROLE_KEY" > "$PROXY/sb_service_key.php"
printf "<?php return '%s';\n" "https://147.45.184.99.sslip.io" > "$PROXY/sb_url.php"

# Токен для доставки секретов из GitHub — см. php-proxy/deploy.php.
# Создаётся один раз: сменится он — и выкладка перестанет доходить, а
# заметно это станет только когда понадобится поменять пароль.
if [ ! -f /opt/jobtoo-secrets/deploy ]; then
  echo "DEPLOY_TOKEN=$(openssl rand -hex 24)" > /opt/jobtoo-secrets/deploy
  chmod 600 /opt/jobtoo-secrets/deploy
fi
. /opt/jobtoo-secrets/deploy
printf "<?php return '%s';\n" "$DEPLOY_TOKEN" > "$PROXY/deploy_token.php"

# Всё, что нужно вписать в настройки репозитория, — одной страницей за
# паролем панели. Иначе эти значения приходится диктовать в переписке, а
# оттуда они уже не убираются.
#
# Ключи anon и service_role сюда попадают намеренно: без них приложение не
# сможет уйти с облака на этот сервер. Страница закрыта тем же паролем, что
# и панель, — а панель показывает переписку и телефоны, то есть куда больше.
mkdir -p /var/www/private
{
  echo "# Вписать в Settings → Secrets and variables → Actions"
  echo
  echo "JT_DEPLOY_TOKEN=$DEPLOY_TOKEN"
  echo "SB_SERVICE_KEY=$SERVICE_ROLE_KEY"
  echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
  echo "EXPO_PUBLIC_SUPABASE_URL=https://jobtoo.ru"
  echo "SB_URL=https://jobtoo.ru"
} > /var/www/private/token.txt
chmod 640 /var/www/private/token.txt
chown root:www-data /var/www/private/token.txt 2>/dev/null || true

# 33 — www-data в обычном образе PHP; в alpine это был 82. Номер важен:
# каталог закрыт для посторонних, и с чужим владельцем прокси не прочитает
# собственные секреты, а доставка из GitHub не сможет их обновить.
chown -R 33:33 "$PROXY" 2>/dev/null || true
chmod 750 "$PROXY"

# ── Сайт ──────────────────────────────────────────────────────────────────
# Собранная веб-версия приезжает не так, как на Reg.ru. Туда её кладёт
# GitHub по FTP; сюда положить нечем — ни FTP, ни ssh, и заводить их значит
# держать ключ от сервера в настройках репозитория.
#
# Поэтому наоборот: сборка выкладывается выпуском с постоянной меткой web,
# а сервер забирает её сам — тем же движением, каким забирает infra/.
#
# Разворачиваем во временный каталог и подменяем готовым: если архив побит
# или скачался наполовину, на месте останется прежний рабочий сайт, а не
# половина нового.
WEBSRC=https://github.com/nikidav9/JobToo/releases/download/web/dist.tar.gz
if curl -fsSL -m 300 -o /tmp/jt-web.tgz "$WEBSRC" 2>/dev/null; then
  SUM=$(sha256sum /tmp/jt-web.tgz | cut -d' ' -f1)
  if [ "$SUM" != "$(cat /var/lib/jt-web.sha 2>/dev/null || true)" ]; then
    rm -rf /tmp/jt-web && mkdir -p /tmp/jt-web
    if tar -xzf /tmp/jt-web.tgz -C /tmp/jt-web 2>/dev/null && [ -s /tmp/jt-web/index.html ]; then
      rm -rf /var/www/jobtoo.old
      if [ -d /var/www/jobtoo ]; then mv /var/www/jobtoo /var/www/jobtoo.old; fi
      mv /tmp/jt-web /var/www/jobtoo
      chmod -R a+rX /var/www/jobtoo
      rm -rf /var/www/jobtoo.old
      echo "$SUM" > /var/lib/jt-web.sha
      say "сайт" "обновлён, файлов: $(find /var/www/jobtoo -type f | wc -l)"
    else
      say "сайт" "архив не распаковался — оставляю прежний"
      rm -rf /tmp/jt-web
    fi
  fi
  rm -f /tmp/jt-web.tgz
fi

# ── Контейнеры ────────────────────────────────────────────────────────────
cd "$REPO/infra"
chmod +x init/*.sh 2>/dev/null || true
# up -d сам по себе безвреден: контейнеры, у которых ничего не изменилось,
# он не трогает. Но вывод в журнал каждую минуту засоряет его так, что
# полезное тонет, поэтому пишем только при изменениях.
timeout 600 docker compose --env-file "$SECRETS" up -d --remove-orphans >/tmp/jt-compose.log 2>&1 \
  || say "контейнеры" "up не уложился в 10 минут"
grep -qE "Started|Recreated|Created" /tmp/jt-compose.log 2>/dev/null \
  && say "контейнеры" "$(grep -aE "Started|Recreated|Created" /tmp/jt-compose.log | tr -d "\r" | tr "\n" " " | cut -c1-200)"

# ── Шлюз ──────────────────────────────────────────────────────────────────
# Свою конфигурацию кладём вместо стандартной: две одновременно спорят
# за default_server, и nginx не поднимется.
# Конфигурацию собираем целиком и перезапускаем ОДИН раз.
#
# Раньше сначала клался вариант без TLS с перезапуском, а защищённая часть
# дописывалась в самом конце — после ролей, миграций, переноса и копий. Всё
# это время порт 443 не слушал, и прокси на хостинге получал отказ. Каждую
# минуту, по несколько минут кряду.

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

# Перезагрузка шлюза после продления. Сам certbot её не делает, а nginx
# держит сертификат в памяти: без этого через 60 дней он молча продолжит
# отдавать просроченный, и браузеры перестанут открывать сайт.
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx.sh <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx.sh

# ── Сертификат на сам домен ───────────────────────────────────────────────
# Выпускаем ДО того, как jobtoo.ru начнёт указывать сюда. Иначе неизбежен
# провал: пока идёт выпуск, https не отвечает, а это и приложение, и вебхук
# бота. Работает это благодаря строке в public/.htaccess — хостинг
# перенаправляет проверку Let's Encrypt на этот сервер.
#
# Сначала проверяем сами, своим файлом, что цепочка сложилась. Пустая
# попытка стоит дорого: пять неудачных проверок в час — и Let's Encrypt
# закрывает выпуск на этот домен, а таймер здесь ходит каждую минуту.
#
# Второй путь — на случай, если перенаправление на хостинге не сложится:
# имя уже указывает сюда. Тогда выпускать надо как можно быстрее, потому
# что это и есть тот самый провал.
#
# Спрашиваем не обычным способом, а прямо у ответственных за домен
# серверов. TTL записи — час: обычный преобразователь ещё целый час будет
# отдавать прежний адрес, и всё это время сервер не знал бы, что запись
# уже поменяли. Сброса своего кэша мало — кэшируют и вышестоящие.
#
# Заодно это даёт то, ради чего всё затевалось: у ответственных серверов
# новая запись появляется в ту же секунду, как её сохранили, а до людей
# доходит в течение часа. Значит сертификат успевает встать на место
# раньше, чем хоть кто-то придёт по новому адресу.
DOMAIN=jobtoo.ru
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ] && command -v certbot >/dev/null 2>&1; then
  mkdir -p /var/www/html/.well-known/acme-challenge
  echo "jt-ok" > /var/www/html/.well-known/acme-challenge/jt-probe
  P1=$(curl -fsSL -m 20 "http://$DOMAIN/.well-known/acme-challenge/jt-probe" 2>/dev/null || true)
  P2=$(curl -fsSL -m 20 "http://www.$DOMAIN/.well-known/acme-challenge/jt-probe" 2>/dev/null || true)
  # Пауза между попытками: обычно час, но если имя уже указывает сюда —
  # десять минут. В этом случае каждая минута ожидания это минута, когда
  # приложение упирается в чужой сертификат.
  PAUSE=3600
  if { [ "$P1" != "jt-ok" ] || [ "$P2" != "jt-ok" ]; } && command -v dig >/dev/null 2>&1; then
    NS=$(dig +short +time=5 +tries=1 NS "$DOMAIN" 2>/dev/null | head -1)
    if [ -n "$NS" ]; then
      A1=$(dig +short +time=5 +tries=1 A "$DOMAIN"      "@$NS" 2>/dev/null | grep -c "^$IP$" || true)
      A2=$(dig +short +time=5 +tries=1 A "www.$DOMAIN"  "@$NS" 2>/dev/null | grep -c "^$IP$" || true)
      if [ "${A1:-0}" -ge 1 ] && [ "${A2:-0}" -ge 1 ]; then
        P1=jt-ok; P2=jt-ok; PAUSE=600
        say "сертификат" "$DOMAIN уже указывает сюда — выпускаю"
      fi
    fi
  fi
  if [ "$P1" = "jt-ok" ] && [ "$P2" = "jt-ok" ]; then
    # Впустую пробовать нельзя: пять неудач в час закрывают выпуск на домен.
    LAST=$(cat /var/lib/jt-cert-last 2>/dev/null || echo 0)
    NOW=$(date +%s)
    if [ $((NOW - LAST)) -gt "$PAUSE" ]; then
      date +%s > /var/lib/jt-cert-last
      certbot certonly --webroot -w /var/www/html -n --agree-tos \
        -m nikidav9@gmail.com -d "$DOMAIN" -d "www.$DOMAIN" >>/var/log/jt-apply.log 2>&1 \
        && say "сертификат" "выпущен на $DOMAIN и www" \
        || say "сертификат" "на $DOMAIN не вышел, повтор через $((PAUSE / 60)) мин"
    fi
  fi
fi

# Собираем во временный файл и сравниваем с действующим: перезапускать
# nginx каждую минуту незачем. Он это переживает, но не бесследно — часть
# запросов в момент перезагрузки обрывается, и снаружи это выглядит как
# «картинка иногда не грузится». Проверка с восьми точек мира показала
# таймаут на половине из них.
NEW=/tmp/jt-nginx-new.conf
cp "$REPO/infra/nginx.conf" "$NEW"
if [ -d "/etc/letsencrypt/live/$HOST" ] && [ -f "$REPO/infra/nginx-tls.conf" ]; then
  sed "s/__HOST__/$HOST/g" "$REPO/infra/nginx-tls.conf" >> "$NEW"
fi
# Блок самого домена — только когда сертификат на него уже есть. Иначе
# nginx не поднимется вовсе, и вместе с сайтом ляжет всё остальное.
if [ -d "/etc/letsencrypt/live/$DOMAIN" ] && [ -f "$REPO/infra/nginx-site.conf" ]; then
  cat "$REPO/infra/nginx-site.conf" >> "$NEW"
fi

if cmp -s "$NEW" /etc/nginx/sites-available/jobtoo; then
  # Ничего не изменилось — не трогаем работающий шлюз.
  rm -f "$NEW"
else
cp "$NEW" /etc/nginx/sites-available/jobtoo
ln -sf /etc/nginx/sites-available/jobtoo /etc/nginx/sites-enabled/jobtoo
rm -f /etc/nginx/sites-enabled/default

if nginx -t >/tmp/jt-nginx.log 2>&1; then
  systemctl reload nginx
  say "шлюз" "пересобран${HOST:+, tls на $HOST}"
else
  say "шлюз" "не прошёл проверку: $(grep -a -m1 -iE 'emerg|error' /tmp/jt-nginx.log | cut -c1-200)"
  # Отступаем по одной ступени, а не сразу до голого http.
  #
  # Блок сайта появляется ровно в момент переезда домена — и если бы в нём
  # оказалась ошибка, прежний откат снёс бы вместе с ним и шифрование для
  # приложения. То есть мелкая опечатка в новом куске гасила бы всё разом,
  # именно тогда, когда всё и переключается.
  ALT=/tmp/jt-nginx-alt.conf
  cp "$REPO/infra/nginx.conf" "$ALT"
  if [ -d "/etc/letsencrypt/live/$HOST" ] && [ -f "$REPO/infra/nginx-tls.conf" ]; then
    sed "s/__HOST__/$HOST/g" "$REPO/infra/nginx-tls.conf" >> "$ALT"
  fi
  cp "$ALT" /etc/nginx/sites-available/jobtoo
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
    say "шлюз" "поднят без блока сайта — виноват nginx-site.conf"
  else
    # Лучше без шифрования, чем без шлюза вовсе.
    cp "$REPO/infra/nginx.conf" /etc/nginx/sites-available/jobtoo
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
    say "шлюз" "поднят без шифрования — виноват nginx-tls.conf"
  fi
  rm -f "$ALT"
fi
fi

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
      -- postgres: в этом образе суперпользователь зовётся supabase_admin, а
      -- роли postgres нет вовсе. При этом миграции Storage раздают ей права
      -- и падают с «role postgres does not exist» — служба не стартует, и
      -- снаружи это выглядит как 502 на всех запросах к файлам.
      if not exists (select from pg_roles where rolname = 'postgres') then
        create role postgres superuser login createrole createdb replication bypassrls;
      end if;
    end \$\$;

    -- Схема realtime (без подчёркивания): её ждут миграции Realtime, а
    -- рабочее хозяйство он держит в _realtime. Имена разные, нужны обе.
    create schema if not exists realtime;
    alter schema realtime owner to supabase_admin;

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
# set -e намеренно НЕ возвращаем: дальше идут проверки, которые законно
# отвечают ненулевым кодом (служба ещё поднимается, файла ещё нет), и
# каждая такая мелочь убивала весь заход молча — миграции переставали
# доезжать, а в журнале не оставалось ни строчки.
if [ $rc -eq 0 ]; then
  say "роли" "заданы"
  # Перезапуск служб здесь был ошибкой: он выполнялся каждую минуту, а не
  # однажды. Службы мигали, приложение отвечало через раз, и следующая же
  # проверка Storage приходилась на момент, когда тот ещё не поднялся.
  # Толкаем только один раз, при первой настройке ролей.
  if [ ! -f /opt/jobtoo-secrets/.roles-done ]; then
    docker compose restart rest realtime storage >/dev/null 2>&1 || true
    touch /opt/jobtoo-secrets/.roles-done
  fi
else
  say "роли" "ОШИБКА($rc): $(tail -4 /tmp/jt-roles.log | tr '\n' ' ' | cut -c1-300)"
fi

# ── Арендатор Realtime ────────────────────────────────────────────────────
# Realtime в самостоятельной установке адресует подключения «арендатору» и
# заводит его сам при первом запуске (SEED_SELF_HOST). У нас список оказался
# пуст: засев не прошёл, потому что я сбрасывал схему _realtime, когда менял
# ключ шифрования.
#
# Без арендатора служба отвечает 403 на всякое подключение — то есть чаты и
# уведомления перестают обновляться живьём, при том что контейнер здоров.
if [ -z "$(docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
      psql -tAq -U supabase_admin -d postgres \
      -c 'select 1 from _realtime.tenants limit 1' 2>/dev/null | tr -d '[:space:]')" ]; then
  docker compose restart realtime >/dev/null 2>&1
  sleep 20
  n=$(docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
        psql -tAq -U supabase_admin -d postgres \
        -c 'select count(*) from _realtime.tenants' 2>/dev/null | tr -d '[:space:]')
  say "realtime" "арендаторов после перезапуска: ${n:-не прочитать}"
fi

# ── Схема Storage ─────────────────────────────────────────────────────────
# Storage ведёт в базе собственный набор миграций и сам же проверяет, что
# схема им соответствует. Моя ранняя попытка создать её вручную, а потом
# несколько сбросов подряд оставили её на полпути: служба отвечает
# DatabaseSchemaMismatch и отказывается работать.
#
# Сбрасываем один раз и отдаём целиком службе. Файлы при этом не теряются —
# они лежат в томе на диске, а не в базе.
if [ ! -f /opt/jobtoo-secrets/.storage-clean ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:5000/bucket \
         -H "Authorization: Bearer $SERVICE_ROLE_KEY" 2>/dev/null)
  if [ "$code" != "200" ]; then
    docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
      psql -q -U supabase_admin -d postgres \
      -c "drop schema if exists storage cascade;" >/dev/null 2>&1
    docker compose restart storage >/dev/null 2>&1
    sleep 25
    code2=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:5000/bucket \
            -H "Authorization: Bearer $SERVICE_ROLE_KEY" 2>/dev/null)
    if [ "$code2" = "200" ]; then
      touch /opt/jobtoo-secrets/.storage-clean
      say "storage" "схема пересоздана службой, отвечает"
    else
      say "storage" "после сброса отвечает $code2"
    fi
  else
    touch /opt/jobtoo-secrets/.storage-clean
  fi
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
