-- Событие «открыл приложение» (Фаза 1b).
-- Append-only лог запусков: позволяет построить воронку установил → открыл →
-- зарегистрировался и настоящие D1/D7/D30 и DAU, чего last_seen_at не даёт.
-- anon_id ставится на устройстве ещё ДО регистрации, поэтому виден и тот, кто
-- открыл, но не завёл аккаунт. role — в каком «мире» человек в этот запуск
-- (worker/employer или null, если ещё не выбрал).
CREATE TABLE IF NOT EXISTS jm_app_opens (
  id         bigserial   PRIMARY KEY,
  anon_id    text        NOT NULL,
  user_id    text,
  role       text,
  platform   text,
  opened_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jm_app_opens_opened_idx  ON jm_app_opens(opened_at);
CREATE INDEX IF NOT EXISTS jm_app_opens_anon_idx    ON jm_app_opens(anon_id);
CREATE INDEX IF NOT EXISTS jm_app_opens_user_idx    ON jm_app_opens(user_id);

ALTER TABLE jm_app_opens DISABLE ROW LEVEL SECURITY;
