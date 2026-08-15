#!/bin/bash
# Ежедневная резервная копия базы и файлов.
#
# Сейчас данные 420 человек живут в одном экземпляре на одной машине. Пока
# они дублировались в облаке, это было терпимо; после переключения — нет.
# Поэтому копия появляется раньше, чем переключение.
#
# Копии лежат на самом сервере. Это защищает от испорченных данных и
# неудачной миграции, но не от потери машины — второй адрес хранения
# добавим отдельным шагом, когда будет объектное хранилище.
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
