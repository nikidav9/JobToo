#!/bin/bash
# Отчёт о состоянии сервера.
#
# Единственный способ увидеть, что происходит внутри: ssh из моей среды
# недоступен, а до контейнеров снаружи не достучаться, пока шлюз не работает.
#
# Главное правило здесь — отчёт не должен зависеть от того, о чём он
# докладывает. Прошлая версия звала docker compose ps, и когда Docker увяз в
# бесконечном перезапуске контейнеров, отчёт увяз вместе с ним: восемь минут
# полной тишины ровно тогда, когда сведения были нужнее всего.
#
# Поэтому: сначала то, что не требует Docker, отправляем сразу. Docker
# спрашиваем последним и с жёстким тайм-аутом — не ответил, так и напишем.

T=${NTFY:-https://ntfy.sh/jt-v4-m7q2z8}
say() { curl -s -m 15 -H "Title: $1" -d "$2" "$T" >/dev/null 2>&1 || true; }

# ── Без Docker ────────────────────────────────────────────────────────────
say "машина" "память $(free -m | awk '/^Mem/{print $3"/"$2}') МБ, подкачка $(free -m | awk '/^Swap/{print $3"/"$2}') МБ, диск $(df -h / | awk 'NR==2{print $4}') свободно, нагрузка $(cut -d' ' -f1-3 /proc/loadavg)"

say "службы" "nginx=$(systemctl is-active nginx) docker=$(systemctl is-active docker) apply=$(systemctl is-active jt-apply.timer) последний-заход=$(systemctl show jt-apply.service -p ExecMainStatus --value 2>/dev/null)"

# Слушающие порты видно и без Docker — по ним понятно, поднялись ли службы.
say "порты" "$(ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | grep -oE ':[0-9]+$' | sort -u | tr '\n' ' ')"

say "заход" "$(tail -4 /var/log/jt-apply.log 2>/dev/null | tr -d '"' | tr '\n' ' ' | cut -c1-280)"

# ── С Docker, но с поводком ───────────────────────────────────────────────
# timeout обязателен: без него команда висит, пока Docker разбирается с
# перезапусками, и утаскивает за собой весь отчёт.
st=$(cd /opt/jobtoo/infra 2>/dev/null && timeout 20 docker compose ps --format '{{.Service}}={{.State}}' 2>&1 | tr '\n' ' ')
say "контейнеры" "${st:-docker не ответил за 20 секунд}"

for svc in db rest realtime storage; do
  s=$(cd /opt/jobtoo/infra 2>/dev/null && timeout 10 docker compose ps "$svc" --format '{{.State}}' 2>/dev/null)
  case "$s" in
    running|"") ;;
    *) say "журнал:$svc" "$(cd /opt/jobtoo/infra && timeout 15 docker compose logs --tail=10 --no-log-prefix "$svc" 2>&1 | tr -d '\r' | tail -10 | cut -c1-180)" ;;
  esac
done
