#!/bin/bash
# Ежедневная резервная копия базы и файлов.
#
# Сейчас данные 420 человек живут в одном экземпляре на одной машине. Пока
# они дублировались в облаке, это было терпимо; после переключения — нет.
# Поэтому копия появляется раньше, чем переключение.
#
# Копии лежат на самом сервере И, если заданы ключи, уходят вторым адресом
# в объектное хранилище. Локальная копия защищает от испорченных данных и
# неудачной миграции; от потери машины защищает только вторая.
#
# Пока ключей нет, выгрузка молчит, но каждый заход докладывает, что второго
# адреса нет: молчащий пробел опаснее шумного — про него забывают.
set -u

DIR=/opt/jobtoo-backups
KEEP=14
say() { echo "$(date -Is) [$1] $2" >> /var/log/jt-apply.log; }

mkdir -p "$DIR"; chmod 700 "$DIR"
cd /opt/jobtoo/infra || exit 1
set -a; . /opt/jobtoo-secrets/env; set +a

stamp=$(date +%Y%m%d-%H%M)
f="$DIR/db-$stamp.sql.gz"

# pg_dump целиком, включая схему: копия, из которой нельзя развернуться с
# нуля, — не копия. Ровно на этом вчера и споткнулись, когда выяснилось, что
# базовой схемы нет ни в репозитории, ни где-либо ещё.
if docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
     pg_dump -U supabase_admin -d postgres --no-owner --no-acl 2>/dev/null \
     | gzip -9 > "$f" && [ -s "$f" ]; then
  size=$(du -h "$f" | cut -f1)
else
  rm -f "$f"
  say "копия" "НЕ СОЗДАЛАСЬ"
  exit 1
fi

# Файлы: их немного, поэтому просто целиком.
tar czf "$DIR/files-$stamp.tar.gz" -C /var/lib/docker/volumes/jobtoo_storage-data/_data . 2>/dev/null || true

# Старое чистим, иначе через месяц кончится диск и упадёт вся машина.
find "$DIR" -name 'db-*.sql.gz'    -mtime +$KEEP -delete 2>/dev/null || true
find "$DIR" -name 'files-*.tar.gz' -mtime +$KEEP -delete 2>/dev/null || true

# Проверяем, что копия читается. Несчитываемая копия хуже отсутствующей:
# на неё рассчитывают.
if gzip -t "$f" 2>/dev/null; then
  n=$(gzip -dc "$f" | grep -c '^COPY public\.' || true)
  say "копия" "готова $stamp, $size, таблиц с данными $n, всего копий $(ls "$DIR"/db-*.sql.gz 2>/dev/null | wc -l)"
else
  say "копия" "битая, удаляю"
  rm -f "$f"
fi

# ── Второй адрес хранения ─────────────────────────────────────────────────
# Включается сам, как только в файле переменных появятся четыре строки:
#   BACKUP_S3_ENDPOINT=https://s3.twcstorage.ru
#   BACKUP_S3_BUCKET=имя-бакета
#   AWS_ACCESS_KEY_ID=...
#   AWS_SECRET_ACCESS_KEY=...
#
# Отдельным ключом, а не тем же, что у приложения: у этого доступ только на
# запись в один бакет, и утечка сервера не даёт доступа к копиям.
#
# Отправляем свежие файлы и подчищаем в хранилище то, что старше срока
# хранения. Локальную чистку делает find выше — здесь то же самое, но по
# датам в именах: у объектов нет mtime, на который можно положиться.
if [ -n "${BACKUP_S3_BUCKET:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    up=0
    for out in "$f" "$DIR/files-$stamp.tar.gz"; do
      [ -s "$out" ] || continue
      if aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 cp "$out" \
           "s3://$BACKUP_S3_BUCKET/$(basename "$out")" --only-show-errors 2>>/tmp/jt-s3.log; then
        up=$((up + 1))
      fi
    done
    if [ "$up" -gt 0 ]; then
      # Сколько копий доехало — считаем в самом хранилище, а не по своим
      # намерениям: «отправил» и «лежит» это разные утверждения.
      there=$(aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 ls "s3://$BACKUP_S3_BUCKET/" 2>/dev/null | grep -c 'db-.*\.sql\.gz')
      say "копия" "во втором хранилище: отправлено $up, всего копий базы там ${there:-?}"
    else
      say "копия" "ВТОРОЕ ХРАНИЛИЩЕ НЕ ПРИНЯЛО: $(tail -2 /tmp/jt-s3.log 2>/dev/null | tr '\n' ' ' | cut -c1-200)"
    fi

    old_day=$(date -d "-$KEEP days" +%Y%m%d 2>/dev/null || true)
    if [ -n "$old_day" ]; then
      aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 ls "s3://$BACKUP_S3_BUCKET/" 2>/dev/null \
        | awk '{print $NF}' | while read -r key; do
            d=$(printf '%s' "$key" | grep -oE '[0-9]{8}' | head -1)
            [ -n "$d" ] && [ "$d" -lt "$old_day" ] && \
              aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 rm "s3://$BACKUP_S3_BUCKET/$key" --only-show-errors >/dev/null 2>&1
          done
    fi
  else
    say "копия" "ключи для второго хранилища есть, а awscli не установлен"
  fi
else
  # Раз в неделю, чтобы не сорить в журнал каждый день, но и не молчать.
  if [ "$(date +%u)" = "1" ]; then
    if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
      say "копия" "второй адрес задан не полностью: нужны BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET и ключи"
    else
      say "копия" "второго адреса хранения нет: копии только на этой машине"
    fi
  fi
fi

# ── Проверка восстановлением ──────────────────────────────────────────────
# Копия, которую ни разу не разворачивали, — не копия: на неё рассчитывают,
# а выясняется всё в худший момент. Раз в неделю берём свежую и поднимаем во
# временную базу рядом. Данные при этом не трогаются: восстановление идёт в
# отдельную базу, которая тут же удаляется.
if [ "$(date +%u)" = "7" ] || [ ! -f /opt/jobtoo-backups/.checked ]; then
  T=jt_restore_check
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    psql -q -U supabase_admin -d postgres -c "drop database if exists $T;" >/dev/null 2>&1
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    psql -q -U supabase_admin -d postgres -c "create database $T;" >/dev/null 2>&1
  if gzip -dc "$f" | docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
       psql -q -U supabase_admin -d "$T" >/dev/null 2>&1; then
    cnt=$(docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
            psql -tAq -U supabase_admin -d "$T" -c "select count(*) from jm_users" 2>/dev/null | tr -d '[:space:]')
    say "копия" "проверка восстановлением: людей в развёрнутой копии $cnt"
    touch /opt/jobtoo-backups/.checked
  else
    say "копия" "ВОССТАНОВЛЕНИЕ НЕ УДАЛОСЬ — копии негодны"
  fi
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
    psql -q -U supabase_admin -d postgres -c "drop database if exists $T;" >/dev/null 2>&1
fi
