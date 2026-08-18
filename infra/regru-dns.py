#!/usr/bin/env python3
"""Перенос зоны jobtoo.ru на универсальные серверы имён Рег.ру.

── Почему не руками ───────────────────────────────────────────────────────

Записей девять, но четыре из них — один и тот же IPv6-адрес
`2a03:6f00:a::1:ba1f`, набранный вручную. Опечатка в нём не бросается в глаза
ни при вводе, ни при проверке: адрес и так выглядит как случайный набор. А
отвалится от неё не всё сразу, а через раз — у тех, чей провайдер предпочитает
IPv6.

── Почему именно в таком порядке ──────────────────────────────────────────

Сначала я собирался завести записи, а потом переключить серверы имён — чтобы
зона ни секунды не стояла пустой. Так нельзя: `zone/get_resource_records`
отвечает `DOMAIN_IS_NOT_USE_REGRU_NSS`, пока домен не переведён. Зоны у
регистратора до переключения просто не существует.

Значит промежуток неизбежен, и вопрос только в его длине. Здесь он —
несколько секунд: переключили, дождались появления зоны, залили записи одним
заходом. Руками это время равно тому, сколько человек набирает девять строк.

Опасность промежутка при этом не такая страшная, как кажется: смена серверов
имён расходится по миру часами, и почти никто не успевает спросить новые
серверы раньше, чем в них появятся записи.

── Чего здесь боятся отдельно ─────────────────────────────────────────────

Свежая зона у регистратора редко бывает пустой: туда обычно кладут записи на
страницу-заглушку. Если просто добавить свои поверх, у домена окажется два
адреса, и половина людей попадёт на заглушку вместо сайта. Поэтому перед
записью читаем, что там лежит, и убираем ровно то, что спорит с нашим: тот же
тип и то же имя, но другое значение. Всё остальное не трогаем и показываем.

── Что нужно ──────────────────────────────────────────────────────────────

Логин Рег.ру и пароль для API (кабинет → Настройки → Настройки API). Там же
указываются адреса, с которых разрешено ходить.

    export REGRU_USER='логин'
    export REGRU_PASSWORD='пароль для API'

── Как пользоваться ───────────────────────────────────────────────────────

    python3 infra/regru-dns.py показать   # ничего не меняет, только читает
    python3 infra/regru-dns.py всё        # серверы, ожидание, записи, сверка

Отдельные шаги, если что-то пошло не так и надо доделать руками:

    python3 infra/regru-dns.py серверы
    python3 infra/regru-dns.py записи

Повторный запуск безопасен: то, что уже на месте, пропускается.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

DOMAIN = 'jobtoo.ru'
API = 'https://api.reg.ru/api/regru2'

IPV4 = '147.45.184.99'
IPV6 = '2a03:6f00:a::1:ba1f'

# Девять записей. Порядок здесь же и порядок вывода — сверять глазами проще,
# чем по алфавиту.
#
# `tg` с A-записью — новая. Сейчас у tg.jobtoo.ru есть только IPv6, и ровно
# поэтому вебхук Telegram в своё время не поднялся: Telegram не ходит на
# адреса без IPv4, и бот с тех пор работает опросом.
#
# `v=spf1 -all` — вместо почтовых записей, которые уезжают вместе с хостингом.
# Означает «писем с этого домена не бывает»: домен без почты и без такой
# записи — удобный обратный адрес для чужого спама.
RECORDS = [
    ('A',    '@',     IPV4),
    ('AAAA', '@',     IPV6),
    ('A',    'www',   IPV4),
    ('AAAA', 'www',   IPV6),
    ('A',    'admin', IPV4),
    ('AAAA', 'admin', IPV6),
    ('A',    'tg',    IPV4),
    ('AAAA', 'tg',    IPV6),
    ('TXT',  '@',     'v=spf1 -all'),
]

NAMESERVERS = {'ns0': 'ns1.reg.ru', 'ns1': 'ns2.reg.ru'}

# Timeweb. Зона там заведена заранее и совпадает с этой — см. infra/timeweb-dns.py.
#
# Переключение сюда — шаг к переносу регистрации в Timeweb. Порядок только
# такой: сначала серверы имён на готовую зону, проверка, и уже потом сама
# регистрация. Уйдёт регистрация раньше — серверы Рег.ру перестанут держать
# зону, и домен окажется без ответа.
#
# Откат: `серверы` возвращает на Рег.ру. Зона там остаётся нетронутой, так
# что возврат — одна команда, а не восстановление записей.
NAMESERVERS_TIMEWEB = {
    'ns0': 'ns1.timeweb.ru', 'ns1': 'ns2.timeweb.ru',
    'ns2': 'ns3.timeweb.org', 'ns3': 'ns4.timeweb.org',
}

# Зона появляется у регистратора не мгновенно после переключения.
ZONE_WAIT_TRIES = 30
ZONE_WAIT_PAUSE = 10


class ZoneNotReady(Exception):
    """Домен ещё не переведён на серверы Рег.ру — зоны у регистратора нет."""


def creds():
    user = os.environ.get('REGRU_USER', '').strip()
    password = os.environ.get('REGRU_PASSWORD', '')
    if not user or not password:
        sys.exit(
            'Нет доступа к API. Задайте переменные окружения:\n'
            "    export REGRU_USER='ваш логин'\n"
            "    export REGRU_PASSWORD='пароль для API'\n"
            'Пароль для API заводится в кабинете Рег.ру: Настройки → Настройки API.'
        )
    return user, password


def call(method: str, **params):
    """Обращение к API. Пароль в вывод не попадает никогда."""
    user, password = creds()
    body = {
        'username': user,
        'password': password,
        'io_encoding': 'utf8',
        'output_format': 'json',
        **params,
    }
    data = urllib.parse.urlencode(body).encode()
    req = urllib.request.Request(f'{API}/{method}', data=data)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode('utf-8', 'replace')
    except Exception as e:
        sys.exit(f'{method}: не достучались до API — {e}')

    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit(f'{method}: ответ не разобрать:\n{raw[:800]}')

    if out.get('result') != 'success':
        sys.exit(f'{method}: отказ. {out.get("error_code", "—")}: '
                 f'{out.get("error_text", raw[:400])}')

    return out.get('answer', {})


def domain_answer(method: str, **params):
    """Ответ про один домен.

    Верхний `result` бывает `success`, а внутри, у самого домена, — отказ. Так
    приходит `DOMAIN_IS_NOT_USE_REGRU_NSS`: формально запрос удался, фактически
    зоны нет. Раньше этот случай читался как «зона пустая» — то есть ошибка
    выглядела как разрешение писать в неё.
    """
    answer = call(method, **params)
    domains = answer.get('domains')
    if not isinstance(domains, list) or not domains:
        sys.exit(f'{method}: не понял ответ:\n'
                 f'{json.dumps(answer, ensure_ascii=False)[:800]}')

    d = domains[0]
    if d.get('result') == 'error':
        code = d.get('error_code', '')
        if code == 'DOMAIN_IS_NOT_USE_REGRU_NSS':
            raise ZoneNotReady()
        sys.exit(f'{method}: отказ по домену. {code}: {d.get("error_text", "")}')
    return d


def current_records():
    """Что сейчас лежит в зоне у регистратора."""
    d = domain_answer('zone/get_resource_records', domain_name=DOMAIN)
    rrs = d.get('rrs')
    if rrs is None:
        return []
    if not isinstance(rrs, list):
        sys.exit(f'Не понял список записей:\n'
                 f'{json.dumps(d, ensure_ascii=False)[:800]}')

    out = []
    for r in rrs:
        out.append((
            str(r.get('rectype', '')).upper(),
            str(r.get('subname', '') or '@'),
            str(r.get('content', '')).strip().strip('"'),
        ))
    return out


def normalize(rectype, subname, content):
    """Одна и та же запись, записанная по-разному, должна совпасть.

    Регистратор возвращает имя то как `www`, то как `www.jobtoo.ru.`, IPv6 —
    в другом регистре, TXT — в кавычках. Без приведения повторный запуск
    завёл бы девять дублей.
    """
    subname = subname.rstrip('.')
    if subname.endswith('.' + DOMAIN):
        subname = subname[: -len('.' + DOMAIN)]
    if subname in ('', DOMAIN):
        subname = '@'
    content = content.strip().strip('"')
    if rectype.upper() in ('A', 'AAAA'):
        content = content.lower()
    return (rectype.upper(), subname, content)


def conflicts(have):
    """Записи, которые спорят с нашими: тот же тип и имя, другое значение.

    Ровно из-за них домен может получить два адреса и половину людей увести
    на страницу-заглушку.

    TXT осторожнее: их у имени бывает много и они мирно уживаются. Спорит
    только другая запись SPF — их должно быть не больше одной.
    """
    want = {normalize(*r) for r in RECORDS}
    want_names = {(t, n) for t, n, _ in want}

    out = []
    for rec in have:
        n = normalize(*rec)
        if n in want:
            continue
        if (n[0], n[1]) not in want_names:
            continue
        if n[0] == 'TXT' and not n[2].lower().startswith('v=spf1'):
            continue
        out.append(rec)
    return out


def missing(have):
    seen = {normalize(*r) for r in have}
    return [r for r in RECORDS if normalize(*r) not in seen]


def print_zone(have):
    print(f'В зоне {DOMAIN} сейчас {len(have)} записей:')
    for rectype, subname, content in sorted(have):
        print(f'    {rectype:5} {subname:8} {content}')


def cmd_показать():
    try:
        have = current_records()
    except ZoneNotReady:
        print('Домен ещё на серверах имён хостинга, зоны у регистратора нет.')
        print('Завести записи заранее нельзя — Рег.ру их принимает только после')
        print('переключения. Всё вместе: python3 infra/regru-dns.py всё')
        print('\nБудет заведено:')
        for rectype, subname, content in RECORDS:
            print(f'    {rectype:5} {subname:8} {content}')
        return

    print_zone(have)
    bad = conflicts(have)
    absent = missing(have)

    if bad:
        print(f'\nСпорят с нашими ({len(bad)}) — будут убраны:')
        for rectype, subname, content in bad:
            print(f'    {rectype:5} {subname:8} {content}')
    print()
    if absent:
        print(f'Не хватает {len(absent)} из девяти:')
        for rectype, subname, content in absent:
            print(f'    {rectype:5} {subname:8} {content}')
        print('\nЗавести: python3 infra/regru-dns.py записи')
    else:
        print('Все девять записей на месте.')


def switch(nss: dict, куда: str):
    call('domain/update_nss', domain_name=DOMAIN,
         input_format='json', input_data=json.dumps({'nss': nss}))
    print(f'Серверы имён переключены на {куда}: ' + ', '.join(nss.values()))
    print(
        '\nОбновление занимает от нескольких часов до суток, редко до трёх.\n'
        'Пока идёт, часть людей видит прежнюю зону, часть новую.\n'
        '\nПроверить со стороны: https://www.whatsmydns.net/#A/jobtoo.ru'
    )


def cmd_серверы():
    switch(NAMESERVERS, 'Рег.ру')


def cmd_на_timeweb():
    """Переключить домен на серверы имён Timeweb.

    Зона там должна быть готова заранее: `python3 infra/timeweb-dns.py показать`.
    Убедиться, что серверы Timeweb её отдают, до переключения нельзя — они
    отвечают резолверами и чужим напрямую зону не показывают, даже свою
    собственную. Поэтому страховка не в проверке, а в откате: зона в Рег.ру
    остаётся на месте, и `серверы` возвращает всё обратно одной командой.
    """
    switch(NAMESERVERS_TIMEWEB, 'Timeweb')


def wait_for_zone():
    print('Жду, пока у регистратора появится зона', end='', flush=True)
    for _ in range(ZONE_WAIT_TRIES):
        try:
            have = current_records()
            print(' — есть.')
            return have
        except ZoneNotReady:
            print('.', end='', flush=True)
            time.sleep(ZONE_WAIT_PAUSE)
    print()
    sys.exit(
        'Зона так и не появилась. Серверы имён уже переключены, поэтому записи\n'
        'нужно завести как можно скорее: повторите\n'
        '    python3 infra/regru-dns.py записи\n'
        'или заведите их руками в кабинете — список в docs/ручные-шаги.md'
    )


def cmd_записи(have=None):
    if have is None:
        try:
            have = current_records()
        except ZoneNotReady:
            sys.exit(
                'Зоны у регистратора ещё нет: домен не переведён на ns1.reg.ru.\n'
                'Записи принимаются только после переключения — см. команду «всё».'
            )

    for rectype, subname, content in conflicts(have):
        call('zone/remove_record', domain_name=DOMAIN, subdomain=subname,
             record_type=rectype, content=content)
        print(f'    убрано  {rectype:5} {subname:8} {content}')

    absent = missing(have)
    if not absent:
        print('Все девять записей уже на месте.')
    for rectype, subname, content in absent:
        if rectype == 'A':
            call('zone/add_alias', domain_name=DOMAIN, subdomain=subname, ipaddr=content)
        elif rectype == 'AAAA':
            call('zone/add_aaaa', domain_name=DOMAIN, subdomain=subname, ipaddr=content)
        elif rectype == 'TXT':
            call('zone/add_txt', domain_name=DOMAIN, subdomain=subname, text=content)
        else:
            sys.exit(f'Тип {rectype} я заводить не умею')
        print(f'    заведено {rectype:5} {subname:8} {content}')

    # Перечитываем, а не верим своим же вызовам: «принято» и «лежит в зоне» —
    # разные утверждения, и расходились они уже не раз.
    print()
    have = current_records()
    print_zone(have)
    still = missing(have)
    if still:
        print(f'\nВСЁ ЕЩЁ НЕ ХВАТАЕТ {len(still)}:')
        for rectype, subname, content in still:
            print(f'    {rectype:5} {subname:8} {content}')
        sys.exit('Разберитесь с этим до того, как отключать хостинг.')
    print('\nВсе девять на месте.')


def cmd_всё():
    try:
        have = current_records()
        print('Домен уже на серверах Рег.ру, переключать нечего.')
    except ZoneNotReady:
        cmd_серверы()
        have = wait_for_zone()

    print()
    print_zone(have)
    print()
    cmd_записи(have)
    print(
        '\nОбновление системы имён занимает от нескольких часов до суток,\n'
        'редко до трёх. Пока идёт, часть людей видит старую зону, часть новую.\n'
        '\nПроверить со стороны: https://www.whatsmydns.net/#A/jobtoo.ru\n'
        'Хостинг Host-0 не отключайте, пока не убедитесь, что работают сайт,\n'
        'admin.jobtoo.ru, лента в приложении и бот.'
    )


COMMANDS = {
    'показать': cmd_показать,
    'записи': cmd_записи,
    'серверы': cmd_серверы,
    'на-timeweb': cmd_на_timeweb,
    'всё': cmd_всё,
    'все': cmd_всё,
}

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'показать'
    action = COMMANDS.get(name)
    if action is None:
        sys.exit(f'Не знаю команду «{name}». Есть: '
                 + ', '.join(sorted(set(COMMANDS) - {'все'})))
    action()
