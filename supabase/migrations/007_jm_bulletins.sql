-- Bulletin board (Биржа): срочные объявления от работодателей
CREATE TABLE IF NOT EXISTS jm_bulletins (
  id           text        PRIMARY KEY,
  employer_id  text        NOT NULL,
  company      text        NOT NULL,
  work_type    text        NOT NULL,
  date         text        NOT NULL,
  time_start   text        NOT NULL,
  time_end     text        NOT NULL,
  metro        text        NOT NULL,
  address      text        NOT NULL,
  comment      text,
  status       text        NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jm_bulletins_employer_idx ON jm_bulletins(employer_id);
CREATE INDEX IF NOT EXISTS jm_bulletins_status_idx   ON jm_bulletins(status);

ALTER TABLE jm_bulletins DISABLE ROW LEVEL SECURITY;

-- Add bulletin link and lock flag to chats
ALTER TABLE jm_chats
  ADD COLUMN IF NOT EXISTS bulletin_id text,
  ADD COLUMN IF NOT EXISTS is_locked   boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS jm_chats_bulletin_idx ON jm_chats(bulletin_id);
