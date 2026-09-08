#!/usr/bin/env python3
"""Зона jobtoo.ru в Timeweb Cloud — теперь боевая.

── Как она такой стала ────────────────────────────────────────────────────

Заводилась про запас. У связки с Рег.ру было свойство, которое мы уже
проходили с хостингом: `ns1.reg.ru` держат зону, пока домен зарегистрирован
в Рег.ру. Уйдёт регистрация — погаснет зона. Поэтому зона здесь появилась
заранее, чтобы перенос не был прыжком.

18 августа серверы имён домена переключены на Timeweb, и заодно выяснилось,
что запас был не лишним: как только у домена в Рег.ру прописались чужие
серверы, их API перестал показывать зону вовсе — «домен не использует
серверы Рег.ру». То есть править там больше нечего, даже пока они ещё
отвечают. Единственное живое место — здесь.

Откат на Рег.ру всё ещё возможен (`infra/regru-dns.py серверы`): записи там
остались с прошлой жизни. Но редактировать их до возврата не получится.

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

Прописаны у регистратора 18 августа. Отсюда это не делается и не должно:
переключение — шаг, меняющий живое, и живёт он в infra/regru-dns.py.

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
# Повторный прогон 26.08: применяем удаление входящей AAAA (см. DROP ниже).

IPV4 = '147.45.184.99'
IPV6 = '2a03:6f00:a::1:ba1f'

# Те же девять записей, что и в зоне у Рег.ру. Список нарочно один и тот же:
# две разошедшиеся зоны — это способ однажды переключиться и не понять, почему
# половина перестала работать.
#
# `tg` с IPv4 — из-за его отсутствия в своё время не поднялся вебхук Telegram:
# Telegram не ходит на адреса без IPv4.
#
# Почта. 18 августа завели ящик support@jobtoo.ru на почтовых серверах
# Timeweb — до этого поддержка отвечала с чужого адреса на яндексе.
#
# Поэтому MX и SPF вернулись. Раньше здесь стоял `v=spf1 -all` — «писем с
# этого домена не бывает»: домен без почты и без такой записи это удобный
# обратный адрес для чужого спама. Теперь письма бывают, и запрет надо
# заменить разрешением ровно для тех, кто их отправляет.
#
# `~all` вместо `-all` — намеренно мягче: жёсткий запрет на первых порах
# отправляет в никуда собственные же письма, если что-то не так настроено,
# и узнаёшь об этом от человека, который не дождался ответа.
#
# Ключ — имя поддомена, пустое значит сам домен.
# Значение — (тип, значение) или (тип, значение, приоритет) для MX.
WANT = {
    '': [
        ('A', IPV4),
        ('TXT', 'v=spf1 include:_spf.timeweb.ru ~all'),
        ('MX', 'mx1.timeweb.ru', 10),
        ('MX', 'mx2.timeweb.ru', 20),
    ],
    'www':   [('A', IPV4)],
    'admin': [('A', IPV4)],
    'tg':    [('A', IPV4), ('AAAA', IPV6)],
    # Прямой вход на сервер для CDN. Когда apex (jobtoo.ru) уедет на CDN Timeweb,
    # сам CDN должен тянуть контент откуда-то, кроме apex, — иначе петля «CDN
    # тянет сам с себя». origin всегда указывает прямо на сервер и через CDN не
    # проходит. Пользователи на него не ходят; это источник для CDN и запасной
    # прямой вход. AAAA не заводим по той же причине, что у сайта (см. ниже).
    'origin': [('A', IPV4)],
}

# AAAA у сайта убрана намеренно (26.08). Входящий IPv6-маршрут к серверу у
# части сетей — в мобильных особенно — нестабилен: браузер по правилу «сначала
# IPv6» идёт на AAAA и не откатывается на рабочий IPv4, и сайт «не
# открывается». Проверено: `<ip>.sslip.io` (только A) открывается, а jobtoo.ru
# (A+AAAA) — нет, с той же сети. Оставляем входящим только IPv4, он работает у
# всех. Исходящий IPv6 сервера (доступ к Telegram) это не затрагивает — он
# живёт на интерфейсе сервера, а не на DNS-записи домена. У `tg` AAAA остаётся:
# это адрес вебхука, не пользовательский сайт.
#
# Просто убрать строку из WANT мало: тогда запись становится «чужой» и остаётся
# жить (см. `спорит`). Поэтому вычищаем её явно — через DROP ниже.
DROP = {'': {'AAAA'}, 'www': {'AAAA'}, 'admin': {'AAAA'}, 'origin': {'AAAA'}}

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


def значение(value, priority=None) -> str:
    """Как показать запись человеку. У MX приоритет — часть смысла."""
    return f'{priority} {value}' if priority is not None else str(value)


def zone(sub: str) -> str:
    """Адрес зоны. У поддомена она своя, отдельная от родительской."""
    return DOMAIN if not sub else f'{sub}.{DOMAIN}'


def normalize(rectype, value, priority=None):
    """Приводим к сравнимому виду.

    Приоритет входит в отпечаток только у MX: у остальных типов его нет, и
    если тащить его в ключ, запись «с приоритетом None» перестанет совпадать
    сама с собой при следующем чтении.
    """
    value = str(value).strip().strip('"').rstrip('.')
    rectype = rectype.upper()
    if rectype in ('A', 'AAAA'):
        value = value.lower()
    if rectype == 'MX':
        return (rectype, value.lower(), int(priority) if priority is not None else None)
    return (rectype, value)


def records(sub: str):
    """Записи зоны: (тип, значение, идентификатор, приоритет, имя внутри зоны).

    Последнее поле важнее, чем кажется. В зоне домена лежат не только записи
    самого домена: там же `_dmarc` и `dkim._domainkey` — DMARC и ключ подписи
    писем, которые Timeweb заводит при создании почтового ящика. Оба выглядят
    как обычные TXT, и скрипт, различающий записи только по типу и значению,
    снёс бы их как незнакомые. Почта после этого продолжает ходить, но письма
    начинают падать в спам, и понять почему — отдельное приключение.
    """
    got = call('GET', f'/domains/{zone(sub)}/dns-records', ok_codes=(404,))
    if got is None:
        return []
    out = []
    for r in got.get('dns_records', []):
        d = r.get('data') or {}
        out.append((str(r.get('type', '')).upper(),
                    str(d.get('value') or '').strip().strip('"'),
                    r.get('id'),
                    d.get('priority'),
                    d.get('subdomain')))
    return out


def спорит(rec, want, наши_типы) -> bool:
    """Мешает ли чужая запись нашей.

    Правило узкое нарочно. Убираем только то, что занимает место нашего:
    тот же тип на самом домене, но другое значение. Всё прочее — чужое, и
    удалять его мы не подряжались.

    Записи с именем внутри зоны (`_dmarc`, `dkim._domainkey`) не трогаем
    вовсе: это почтовые служебные, и наших там нет.

    Из TXT спорит только SPF: их у имени бывает много и они мирно уживаются,
    а вот SPF должен быть ровно один, иначе не работает ни один.
    """
    rectype, value, _, prio, поддомен = rec
    if rectype in UNTOUCHED or поддомен:
        return False
    if rectype not in наши_типы:
        return False
    if normalize(rectype, value, prio) in want:
        return False
    if rectype == 'TXT':
        return value.lower().startswith('v=spf1')
    return True


def diff(sub: str):
    """Чего не хватает и что лишнее в одной зоне."""
    have = records(sub)
    want = {normalize(*r) for r in WANT[sub]}
    наши_типы = {r[0].upper() for r in WANT[sub]}
    seen = {normalize(t, v, p) for t, v, _, p, поддомен in have if not поддомен}
    absent = [r for r in WANT[sub] if normalize(*r) not in seen]
    unwanted = [r for r in have if спорит(r, want, наши_типы)]
    # Плюс типы из DROP — их вычищаем явно, даже когда мы их больше не заводим
    # и потому `спорит` их не трогает. Только записи самого домена, не поддоменные
    # служебные (_dmarc, dkim._domainkey), и без задвоения с unwanted.
    drop_types = DROP.get(sub, set())
    if drop_types:
        for r in have:
            rectype, _value, _rid, _prio, поддомен = r
            if not поддомен and rectype.upper() in drop_types and r not in unwanted:
                unwanted.append(r)
    return have, absent, unwanted


def cmd_показать():
    call('POST', f'/add-domain/{DOMAIN}', ok_codes=(400, 409))
    total_absent = total_extra = 0
    for sub in WANT:
        have, absent, unwanted = diff(sub)
        print(f'\n{zone(sub)} — записей {len(have)}:')
        хочется = {normalize(*r) for r in WANT[sub]}
        for rectype, value, _, prio, поддомен in sorted(have, key=lambda r: (r[0], str(r[4]), r[1])):
            свой = (not поддомен) and normalize(rectype, value, prio) in хочется
            mark = '  ' if (свой or поддомен or rectype in UNTOUCHED) else '✗ '
            имя = f'{поддомен}.' if поддомен else ''
            print(f'    {mark}{rectype:5} {имя}{значение(value, prio)}')
        for r in absent:
            print(f'    + {r[0]:5} {значение(r[1], r[2] if len(r) > 2 else None)}   (не хватает)')
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
        for rectype, value, rid, prio, _ in unwanted:
            call('DELETE', f'/domains/{zone(sub)}/dns-records/{rid}', ver='v2')
            print(f'    убрано   {zone(sub):18} {rectype:5} {значение(value, prio)}')
        for r in absent:
            rectype, value = r[0], r[1]
            тело = {'type': rectype, 'value': value}
            if rectype == 'MX':
                тело['priority'] = r[2]
            call('POST', f'/domains/{zone(sub)}/dns-records', тело, ver='v2')
            print(f'    заведено {zone(sub):18} {rectype:5} '
                  f'{значение(value, r[2] if len(r) > 2 else None)}')

    # Перечитываем, а не верим своим же вызовам: этот API отвечает «создано»
    # и на запросы, которые кладут запись не туда, куда просили.
    print()
    bad = False
    for sub in WANT:
        have, absent, unwanted = diff(sub)
        print(f'{zone(sub)}:')
        for rectype, value, _, prio, поддомен in sorted(have, key=lambda r: (r[0], str(r[4]), r[1])):
            print(f'    {rectype:5} {(поддомен + ".") if поддомен else ""}{значение(value, prio)}')
        for r in absent:
            print(f'    НЕ ХВАТАЕТ {r[0]:5} {значение(r[1], r[2] if len(r) > 2 else None)}'); bad = True
        for rectype, value, _, prio, _п in unwanted:
            print(f'    ЛИШНЕЕ     {rectype:5} {значение(value, prio)}'); bad = True

    if bad:
        sys.exit('\nЗона не сошлась — разберитесь до того, как переключать серверы имён.')

    print(
        '\nЗона в нужном виде.\n'
        '\nПроверить снаружи, что её отдают:\n'
        '    https://www.whatsmydns.net/#A/jobtoo.ru\n'
        'Почта заработает не раньше, чем реестр .ru начнёт отдавать серверы\n'
        'Timeweb: до этого запросы уходят на прежнюю зону, где MX нет.'
    )


COMMANDS = {'показать': cmd_показать, 'записи': cmd_записи}

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'показать'
    action = COMMANDS.get(name)
    if action is None:
        sys.exit(f'Не знаю команду «{name}». Есть: ' + ', '.join(COMMANDS))
    action()
