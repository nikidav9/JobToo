#!/usr/bin/env python3
"""Перенос зоны jobtoo.ru на универсальные серверы имён Рег.ру.

Зачем скрипт, если записей всего девять.

Их девять, но четыре из них — IPv6-адрес `2a03:6f00:a::1:ba1f`, набранный
руками. Опечатка в нём не бросается в глаза ни при вводе, ни при проверке:
адрес и так выглядит как случайный набор. А отвалится от такой опечатки не
всё сразу, а через раз — у тех, у кого провайдер предпочитает IPv6.

Второе, и оно важнее. В инструкции порядок был такой: сменить серверы имён,
потом завести записи. Между этими двумя действиями зона пустая. Здесь порядок
обратный: сначала записи в зону регистратора, потом переключение. К моменту,
когда мир начнёт спрашивать новые серверы, отвечать им уже есть чем.

── Что нужно ──────────────────────────────────────────────────────────────

Логин Рег.ру и пароль для API. Пароль для API заводится отдельно, в кабинете:
Настройки → Настройки API. Пароль от самого кабинета сюда подставлять не надо
и не стоит — у отдельного меньше власти, и отозвать его можно не меняя свой.

Там же указываются адреса, с которых разрешено ходить. Запускаете у себя —
пишете свой; запускаю я — подсеть, которую я вам называл.

    export REGRU_USER='ваш логин'
    export REGRU_PASSWORD='пароль для API'

── Как пользоваться ───────────────────────────────────────────────────────

    python3 infra/regru-dns.py показать   # ничего не меняет, только читает
    python3 infra/regru-dns.py записи     # заводит недостающие записи
    python3 infra/regru-dns.py серверы    # переключает серверы имён
    python3 infra/regru-dns.py всё        # записи, проверка, потом серверы

`записи` можно запускать сколько угодно раз: то, что уже есть, пропускается.
`серверы` отказывается работать, пока в зоне нет всех девяти записей — это и
есть та самая защита от пустой зоны.

Ни одна команда ничего не удаляет. Старые почтовые записи остаются как были;
после отключения хостинга они просто перестанут вести куда-либо.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

DOMAIN = 'jobtoo.ru'
API = 'https://api.reg.ru/api/regru2'

IPV4 = '147.45.184.99'
IPV6 = '2a03:6f00:a::1:ba1f'

# Девять записей. Порядок здесь же и порядок вывода — чтобы глазами сверять
# было проще, чем по алфавиту.
#
# `tg` с A-записью — новая. Сейчас у tg.jobtoo.ru есть только IPv6, и ровно
# поэтому вебхук Telegram в своё время не поднялся: Telegram не ходит на
# адреса без IPv4, и бот с тех пор работает опросом.
#
# `v=spf1 -all` — вместо почтовых записей, которые уезжают вместе с хостингом.
# Означает «писем с этого домена не бывает»: без такой записи домен без почты
# становится удобным обратным адресом для чужого спама.
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
        code = out.get('error_code', '—')
        text = out.get('error_text', raw[:400])
        sys.exit(f'{method}: отказ. {code}: {text}')

    return out.get('answer', {})


def current_records():
    """Что сейчас лежит в зоне у регистратора.

    Ответ приходит вложенным (домены → записи), и форма у него менялась.
    Поэтому не разбираем вслепую: не нашли знакомой структуры — говорим об
    этом и останавливаемся. Молча продолжить значит завести девять дублей.
    """
    answer = call('zone/get_resource_records', domain_name=DOMAIN)
    domains = answer.get('domains')
    if not isinstance(domains, list) or not domains:
        sys.exit(f'Не понял ответ о записях зоны:\n{json.dumps(answer, ensure_ascii=False)[:800]}')

    rrs = domains[0].get('rrs')
    if rrs is None:
        # Зоны ещё нет — это нормально, пока домен на серверах хостинга.
        return []
    if not isinstance(rrs, list):
        sys.exit(f'Не понял список записей:\n{json.dumps(domains[0], ensure_ascii=False)[:800]}')

    out = []
    for r in rrs:
        rectype = str(r.get('rectype', '')).upper()
        subname = str(r.get('subname', '') or '@')
        content = str(r.get('content', '')).strip().strip('"')
        out.append((rectype, subname, content))
    return out


def normalize(rectype, subname, content):
    """Одна и та же запись, записанная по-разному, должна совпасть.

    Регистратор может вернуть имя как `www` или как `www.jobtoo.ru.`, IPv6 —
    в другом регистре, TXT — в кавычках. Сравнение без этого дало бы дубли.
    """
    subname = subname.rstrip('.')
    if subname.endswith('.' + DOMAIN):
        subname = subname[: -len('.' + DOMAIN)]
    if subname in ('', DOMAIN):
        subname = '@'
    content = content.strip().strip('"')
    if rectype in ('A', 'AAAA'):
        content = content.lower()
    return (rectype.upper(), subname, content)


def missing():
    have = {normalize(*r) for r in current_records()}
    return [r for r in RECORDS if normalize(*r) not in have]


def cmd_показать():
    have = current_records()
    print(f'В зоне {DOMAIN} сейчас {len(have)} записей:')
    for rectype, subname, content in sorted(have):
        print(f'    {rectype:5} {subname:8} {content}')

    absent = missing()
    print()
    if absent:
        print(f'Не хватает {len(absent)} из девяти:')
        for rectype, subname, content in absent:
            print(f'    {rectype:5} {subname:8} {content}')
        print('\nЗавести: python3 infra/regru-dns.py записи')
    else:
        print('Все девять записей на месте. Можно переключать серверы имён:')
        print('    python3 infra/regru-dns.py серверы')


def cmd_записи():
    absent = missing()
    if not absent:
        print('Все девять записей уже на месте, делать нечего.')
        return

    print(f'Завожу {len(absent)} записей.')
    for rectype, subname, content in absent:
        if rectype == 'A':
            call('zone/add_alias', domain_name=DOMAIN, subdomain=subname, ipaddr=content)
        elif rectype == 'AAAA':
            call('zone/add_aaaa', domain_name=DOMAIN, subdomain=subname, ipaddr=content)
        elif rectype == 'TXT':
            call('zone/add_txt', domain_name=DOMAIN, subdomain=subname, text=content)
        else:
            sys.exit(f'Тип {rectype} я заводить не умею')
        print(f'    {rectype:5} {subname:8} {content}   ✓')

    # Перечитываем, а не верим своим же вызовам: «принято» и «лежит в зоне» —
    # разные утверждения, и разошлись они уже не раз.
    still = missing()
    if still:
        print('\nПосле записи всё ещё не хватает:')
        for rectype, subname, content in still:
            print(f'    {rectype:5} {subname:8} {content}')
        sys.exit('Серверы имён переключать нельзя, пока это не разобрано.')
    print('\nВсе девять на месте.')


def cmd_серверы():
    absent = missing()
    if absent:
        print(f'В зоне не хватает {len(absent)} записей:')
        for rectype, subname, content in absent:
            print(f'    {rectype:5} {subname:8} {content}')
        sys.exit(
            '\nПереключать серверы имён сейчас нельзя: домен уедет на пустую зону '
            'и сайт встанет. Сначала: python3 infra/regru-dns.py записи'
        )

    call('domain/update_nss', domain_name=DOMAIN,
         input_format='json', input_data=json.dumps({'nss': NAMESERVERS}))
    print(f'Серверы имён переключены на {NAMESERVERS["ns0"]} и {NAMESERVERS["ns1"]}.')
    print(
        '\nОбновление занимает от нескольких часов до суток, редко до трёх.\n'
        'Пока идёт, часть людей видит старую зону, часть новую — это нормально.\n'
        '\nПроверить со стороны: https://www.whatsmydns.net/#A/jobtoo.ru\n'
        'Хостинг Host-0 не отключайте, пока не убедитесь, что работают сайт,\n'
        'admin.jobtoo.ru, лента в приложении и бот.'
    )


def cmd_всё():
    cmd_записи()
    print()
    cmd_серверы()


COMMANDS = {
    'показать': cmd_показать,
    'записи': cmd_записи,
    'серверы': cmd_серверы,
    'всё': cmd_всё,
    'все': cmd_всё,
}

if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'показать'
    action = COMMANDS.get(name)
    if action is None:
        sys.exit(f'Не знаю команду «{name}». Есть: ' + ', '.join(sorted(set(COMMANDS) - {'все'})))
    action()
