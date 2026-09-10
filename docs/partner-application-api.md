# API встроенного отклика партнёра

Этот контракт нужен существующему источнику JobToo только при переходе из
`integration_mode = redirect` в `embedded`. До переключения пользователь
продолжает безопасно переходить на сайт источника.

## Приём отклика

В `jm_ext_sources.connector_config.application_submit_url` задаётся HTTPS URL.
JobToo отправляет `POST` с `Idempotency-Key` и данными:

```json
{
  "application_id": "jobtoo-id",
  "vacancy_id": "partner-vacancy-id",
  "vacancy_title": "Комплектовщик",
  "worker": {
    "id": "jobtoo-worker-id",
    "first_name": "Иван",
    "last_name": "Иванов",
    "phone": "+79990000000",
    "work_types": ["picker"],
    "bio": null
  },
  "consent_version": "partner-transfer:2026-09-02"
}
```

Успешный ответ — любой `2xx`. Опционально партнёр возвращает свой ID:

```json
{ "application_id": "partner-id" }
```

Повтор с тем же `Idempotency-Key` должен вернуть прежний результат и не
создавать второй отклик. JobToo повторяет временно не доставленное событие до
8 раз с увеличивающейся задержкой.

## Обратный статус

Партнёр отправляет JSON на
`POST /api/partner_webhook.php?source=<source-id>`:

```json
{
  "event_id": "unique-partner-event-id",
  "application_id": "jobtoo-id-or-partner-id",
  "status": "accepted",
  "status_version": 2,
  "updated_at": "2026-09-10T12:00:00Z"
}
```

Заголовки:

- `X-Partner-Timestamp`: Unix-время формирования запроса;
- `X-Partner-Signature`: `sha256=HMAC_SHA256(webhook_secret, timestamp + "." + raw_body)`.

Разрешённые статусы и переходы определены в `php-proxy/partner_core.php`.
Повтор события безопасен, событие со старой версией состояние не откатывает.

## Запуск доставки

Cron вызывает `POST /api/partner_outbox.php` с закрытым заголовком
`X-Admin-Token`. Endpoint обрабатывает до 50 готовых событий за запуск.
