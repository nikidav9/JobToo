-- Кому уже отправили опрос — чтобы не слать повторно и знать охват.
-- Первичный ключ (опрос, человек) даёт идемпотентность: повторная отправка
-- тому же человеку просто игнорируется.
CREATE TABLE IF NOT EXISTS jm_survey_sends (
  survey_key text        NOT NULL,
  user_id    text        NOT NULL,
  sent_at    timestamptz DEFAULT now(),
  PRIMARY KEY (survey_key, user_id)
);

ALTER TABLE jm_survey_sends DISABLE ROW LEVEL SECURITY;
