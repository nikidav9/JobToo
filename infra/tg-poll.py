#!/usr/bin/env python3
"""Забирать сообщения бота самим, вместо того чтобы Телеграм звонил нам.

Почему не вебхук. Телеграм отвечает на попытку его поставить дословно:
«bad webhook: IPv6-only addresses are not allowed». То есть адрес без записи
A он не принимает вовсе. А по IPv4 эта машина с Телеграмом не разговаривает
ни в одну сторону: наружу 0 ответов из 2 в каждом замере, внутрь —
«Connection timed out». Путь сломан, и починить его с нашей стороны нечем.

Отсюда обратный ход: не ждать звонка, а звонить самим. getUpdates — это
исходящий запрос, а исходящие по IPv6 работают: 4 из 4, изо дня в день.
Заодно исчезает пересылка через Vercel, а с ней и весь сегодняшний узел с
двумя ключами, сторожем и откатами.

Устройство простое до скуки. Держим соединение 25 секунд, получаем пачку
обновлений, отдаём каждое своему же обработчику по петле, запоминаем номер
последнего. Номер — на диске: перезапуск службы не должен приводить к тому,
что человек получит вчерашний ответ дважды.
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

OFFSET_FILE = "/var/lib/jt-tg-offset"
BEAT_FILE = "/var/lib/jt-tg-beat"
# Через собственный домен, а не через петлю: на 127.0.0.1 шлюз
# отвечает переадресацией на https, и обновление ушло бы в пустоту.
LOCAL = "https://jobtoo.ru/api/tg.php"


def secret(name: str) -> str:
    """Секреты лежат в app_secrets.php, а он написан через base64_decode.

    Разбирать его текстом нельзя, поэтому спрашиваем сам PHP — тот же
    способ, каким это делают все остальные части.
    """
    out = subprocess.run(
        ["docker", "compose", "exec", "-T", "php", "php", "-r",
         '$s = @include "/var/www/api/app_secrets.php";'
         f'echo is_array($s) ? ($s["{name}"] ?? "") : "";'],
        cwd="/opt/jobtoo/infra", capture_output=True, timeout=30,
    )
    return out.stdout.decode("utf-8", "replace").strip()


def api(token: str, method: str, params: dict, timeout: int) -> dict:
    """Запрос к Телеграму.

    Через curl, а не через urllib: нужен ключ -6. Питон умеет выбирать
    семейство адресов только вручную через свой сокет, и ради одной опции
    пришлось бы переписать половину. А без -6 система нет-нет да и выберет
    сломанный IPv4 — ровно то, от чего мы здесь и уходим.
    """
    url = f"https://api.telegram.org/bot{token}/{method}"
    cmd = ["curl", "-s", "-6", "-m", str(timeout + 10), url]
    for k, v in params.items():
        cmd += ["-d", f"{k}={v}"]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=timeout + 20)
        return json.loads(out.stdout.decode("utf-8", "replace") or "null") or {}
    except Exception:
        return {}


def deliver(update: dict, app_secret: str) -> None:
    """Отдать обновление своему обработчику — по петле, минуя интернет.

    Заголовок с пропуском обязателен: tg.php с некоторых пор проверяет, что
    обновление пришло от Телеграма, а не от постороннего. Здесь «от
    Телеграма» удостоверяем мы сами, потому что сами его и забрали.
    """
    body = json.dumps(update, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(LOCAL, data=body, headers={
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": app_secret,
    })
    try:
        urllib.request.urlopen(req, timeout=30).read()
    except urllib.error.HTTPError as e:
        print(f"обработчик ответил {e.code}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"обработчик недоступен: {e}", file=sys.stderr, flush=True)


def main() -> int:
    token = secret("TG_BOT_TOKEN")
    app_secret = secret("APP_SECRET")
    if not token:
        print("нет токена бота", file=sys.stderr)
        return 1

    # Вебхук и getUpdates у Телеграма взаимоисключающие: пока висит вебхук,
    # getUpdates отвечает отказом. Снимаем — но только свой; если там чужой
    # адрес, значит кто-то поставил его намеренно, и ломать это молча нельзя.
    info = api(token, "getWebhookInfo", {}, 15).get("result", {})
    url = info.get("url", "")
    if url:
        api(token, "deleteWebhook", {"drop_pending_updates": "false"}, 15)
        print(f"снял вебхук {url}", flush=True)

    try:
        offset = int(open(OFFSET_FILE).read().strip())
    except Exception:
        offset = 0

    while True:
        r = api(token, "getUpdates",
                {"offset": offset, "timeout": 25, "allowed_updates":
                 '["message","callback_query","my_chat_member"]'}, 25)

        # Отметка живости — для сторожа. Без неё «служба висит, но ничего не
        # забирает» выглядит снаружи точно так же, как «всё хорошо».
        try:
            open(BEAT_FILE, "w").write(str(int(time.time())))
        except Exception:
            pass

        if not r.get("ok"):
            # Обрыв связи или отказ. Ждём и пробуем снова: сообщения у
            # Телеграма не пропадают, он отдаст их со следующего захода.
            time.sleep(3)
            continue

        for upd in r.get("result", []):
            deliver(upd, app_secret)
            offset = max(offset, int(upd.get("update_id", 0)) + 1)
            try:
                open(OFFSET_FILE, "w").write(str(offset))
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
