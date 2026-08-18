#!/usr/bin/env python3
"""Зона jobtoo.ru в Timeweb Cloud — запасная, один в один с той, что у Рег.ру.

── Зачем она нужна ────────────────────────────────────────────────────────

Сейчас домен обслуживают серверы имён Рег.ру. Это работает, и менять это
прямо сейчас незачем. Но у связки есть свойство, которое мы уже проходили:
`ns1.reg.ru` обслуживают зону, пока домен зарегистрирован в Рег.ру — ровно
как `ns1.hosting.reg.ru` работали, пока был хостинг. Захочется однажды
перенести регистрацию в Timeweb — и зона на серверах Рег.ру погаснет вместе
с уходом домена.

Поэтому зона здесь заводится заранее и держится в том же виде. Тогда перенос
перестаёт быть прыжком: сначала переключаем серверы имён на Timeweb, где всё
уже готово, проверяем, и только потом трогаем регистрацию.

Ничего живого этот файл не переключает. Пока у регистратора стоят серверы
Рег.ру, зона в Timeweb просто лежит и никем не спрашивается.

── Как устроено у Timeweb, и почему это неочевидно ────────────────────────

Не одна зона, а несколько. У самого домена своя, и у каждого поддомена своя,
по отдельному адресу. Поле `subdomain` в теле запроса при этом существует, но
не работает так, как читается: с ним запись молча ложится на сам домен. То
есть `www` заводится не полем, а двумя действиями — сначала поддомен как
отдельная вещь, потом запись в его собственной зоне.

Ошибиться здесь легко и тихо: сервер отвечает «создано», а запись оказывается
не там, где ожидалась.

И две версии API живут одновременно, каждая наполовину: v1 умеет читать
список, но принимает создание только A-записи — на AAAA и TXT отвечает «Bad
subdomain name», ошибкой совсем не про то. v2 принимает все типы, но списка
не отдаёт. Поэтому читаем первой, пишем второй.

Ещё Timeweb сам добавляет свою почту — MX на mx1/mx2, SPF со своим include,
DMARC, — и делает это заново каждому новому поддомену. Для домена без почты
это не «настройки по умолчанию», а работающие MX в никуда и чужой SPF вместо
нашего. Скрипт их убирает; после ручных правок в панели стоит прогнать его
снова.

── Серверы имён Timeweb ───────────────────────────────────────────────────

    ns1.timeweb.ru   ns2.timeweb.ru   ns3.timeweb.org   ns4.timeweb.org

Прописываются у регистратора, то есть в Рег.ру. Отсюда это не делается —
и не должно: это как раз тот шаг, который меняет живое.

── Что нужно ──────────────────────────────────────────────────────────────

    export TW_TOKEN='ключ API Timeweb Cloud'

Ключ даёт полный доступ к аккаунту, включая сервер: его можно перезагрузить и
удалить вместе с диском. Заводите на время работы и отзывайте после.

── Как пользоваться ───────────────────────────────────────────────────────

    python3 infra/timeweb-dns.py показать   # только читает
    python3 infra/timeweb-dns.py записи     # доводит зону до нужного вида
"""

import json
import os
import sys
import urllib.error
import urllib.request

DOMAIN = 'jobtoo.ru'
API = 'https://api.timeweb.cloud/api'

IPV4 = '147.45.184.99'
IPV6 = '2a03:6f00:a::1:ba1f'

# Те же девять записей, что и в зоне у Рег.ру. Список нарочно один и тот же:
# две разошедшиеся зоны — это способ однажды переключиться и не понять, почему
# половина перестала работать.
#
# `tg` с IPv4 — из-за его отсутствия в своё время не поднялся вебхук Telegram:
# Telegram не ходит на адреса без IPv4.
#
# `v=spf1 -all` — «писем с этого домена не бывает». Почты у домена нет, и без
# такой записи он становится удобным обратным адресом для чужого спама.
#
# Ключ — имя поддомена, пустое значит сам домен.
WANT = {
    '':      [('A', IPV4), ('AAAA', IPV6), ('TXT', 'v=spf1 -all')],
    'www':   [('A', IPV4), ('AAAA', IPV6)],
    'admin': [('A', IPV4), ('AAAA', IPV6)],
    'tg':    [('A', IPV4), ('AAAA', IPV6)],
}

# Их держит сам Timeweb, и трогать их не наше дело.
UNTOUCHED = ('NS', 'SOA')


def token():
    t = os.environ.get('TW_TOKEN', '').strip()
    if not t:
        sys.exit("Нет ключа. Задайте: export TW_TOKEN='ключ API Timeweb Cloud'")
    return t


def call(method: str, path: str, body=None, ok_codes=(), ver='v1'):
    """Обращение к API.

    Версия не украшение. v1 принимает создание только A-записи, а на AAAA и
    TXT отвечает «Bad subdomain name» — ошибкой не про то. v2 принимает всё,
    но не умеет читать список. Поэтому читаем первой, пишем второй.
    """
    req = urllib.request.Request(
        f'{API}/{ver}{path}',
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + token(),
                 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        if e.code in ok_codes:
            return None
        sys.exit(f'{method} {path}: ответ {e.code}. '
                 f'{e.read().decode("utf-8", "replace")[:300]}')
    except Exception as e:
        sys.exit(f'{method} {path}: не достучались — {e}')
    return json.loads(raw) if raw.strip() else {}


def zone(sub: str) -> str:
    """Адрес зоны. У поддомена она своя, отдельная от родительской."""
    return DOMAIN if not sub else f'{sub}.{DOMAIN}'


def normalize(rectype, value):
    value = str(value).strip().strip('"')
    if rectype.upper() in ('A', 'AAAA'):
        value = value.lower()
    return (rectype.upper(), value)


def records(sub: str):
    """Что лежит в зоне поддомена: (тип, значение, идентификатор)."""
    got = call('GET', f'/domains/{zone(sub)}/dns-records', ok_codes=(404,))
    if got is None:
        return []
    return [(str(r.get('type', '')).upper(),
             str((r.get('data') or {}).get('value') or '').strip().strip('"'),
             r.get('id'))
            for r in got.get('dns_records', [])]


def diff(sub: str):
    """Чего не хватает и что лишнее в одной зоне."""
    have = records(sub)
    want = {normalize(*r) for r in WANT[sub]}
    seen = {normalize(t, v) for t, v, _ in have}
    absent = [r for r in WANT[sub] if normalize(*r) not in seen]
    unwanted = [r for r in have
                if r[0] not in UNTOUCHED and normalize(r[0], r[1]) not in want]
    return have, absent, unwanted


def cmd_показать():
    call('POST', f'/add-domain/{DOMAIN}', ok_codes=(400, 409))
    total_absent = total_extra = 0
    for sub in WANT:
        have, absent, unwanted = diff(sub)
        print(f'\n{zone(sub)} — записей {len(have)}:')
        for rectype, value, _ in sorted(have):
            mark = '  ' if normalize(rectype, value) in {normalize(*r) for r in WANT[sub]} \
                   else ('  ' if rectype in UNTOUCHED else '✗ ')
            print(f'    {mark}{rectype:5} {value}')
        for rectype, value in absent:
            print(f'    + {rectype:5} {value}   (не хватает)')
        total_absent += len(absent)
        total_extra += len(unwanted)

    print()
    if total_absent or total_extra:
        print(f'Не хватает {total_absent}, лишних {total_extra} (помечены ✗).')
        print('Довести: python3 infra/timeweb-dns.py записи')
    else:
        print('Зона в нужном виде.')


def cmd_записи():
    call('POST', f'/add-domain/{DOMAIN}', ok_codes=(400, 409))

    # Поддомены — отдельные объекты, и без них запись положить некуда.
    for sub in WANT:
        if sub:
            call('POST', f'/domains/{DOMAIN}/subdomains/{sub}', ok_codes=(400, 409))

    for sub in WANT:
        _, absent, unwanted = diff(sub)
        for rectype, value, rid in unwanted:
            call('DELETE', f'/domains/{zone(sub)}/dns-records/{rid}', ver='v2')
            print(f'    убрано   {zone(sub):18} {rectype:5} {value}')
        for rectype, value in absent:
            call('POST', f'/domains/{zone(sub)}/dns-records',
                 {'type': rectype, 'value': value}, ver='v2')
            print(f'    заведено {zone(sub):18} {rectype:5} {value}')

    # Перечитываем, а не верим своим же вызовам: этот API отвечает «создано»
    # и на запросы, которые кладут запись не туда, куда просили.
    print()
    bad = False
    for sub in WANT:
        have, absent, unwanted = diff(sub)
        print(f'{zone(sub)}:')
        for rectype, value, _ in sorted(have):
            print(f'    {rectype:5} {value}')
        for rectype, value in absent:
            print(f'    НЕ ХВАТАЕТ {rectype:5} {value}'); bad = True
        for rectype, value, _ in unwanted:
            print(f'    ЛИШНЕЕ     {rectype:5} {value}'); bad = True

    if bad:
        sys.exit('\nЗона не сошлась — разберитесь до того, как переключать серверы имён.')

    print(
        '\nЗона готова и совпадает с той, что у Рег.ру.\n'
        '\nОна ничего не обслуживает, пока у регистратора стоят серверы Рег.ру.\n'
        'Чтобы переключить, в кабинете Рег.ру надо прописать серверы Timeweb:\n'
        '    ns1.timeweb.ru  ns2.timeweb.ru  ns3.timeweb.org  ns4.timeweb.org\n'
        'Отсюда это не делается намеренно: это шаг, меняющий живое.'
    )


COMMANDS = {'показать': cmd_показать, 'записи': cmd_записи}

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'показать'
    action = COMMANDS.get(name)
    if action is None:
        sys.exit(f'Не знаю команду «{name}». Есть: ' + ', '.join(COMMANDS))
    action()
