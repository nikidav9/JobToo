-- Ответы на опросы внутри бота (первый — «почему не пользуетесь» для спящих).
-- Один ответ на человека на опрос: повторное нажатие обновляет прежний выбор.
-- user_id может быть пустым (человек не сопоставлен) — такие ответы просто
-- копятся; NULL в уникальном индексе Postgres считает различными.
CREATE TABLE IF NOT EXISTS jm_survey_responses (
  id          bigserial   PRIMARY KEY,
  survey_key  text        NOT NULL,
  user_id     text,
  answer      text        NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jm_survey_responses_uk
  ON jm_survey_responses(survey_key, user_id);
CREATE INDEX IF NOT EXISTS jm_survey_responses_key_idx
  ON jm_survey_responses(survey_key, created_at);

ALTER TABLE jm_survey_responses DISABLE ROW LEVEL SECURITY;
