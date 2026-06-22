-- Unique permanent vacancy views per worker (no duplicates for same user)
CREATE TABLE IF NOT EXISTS jm_perm_vacancy_views (
  vacancy_id  text        NOT NULL,
  worker_id   text        NOT NULL,
  viewed_at   timestamptz DEFAULT now(),
  PRIMARY KEY (vacancy_id, worker_id)
);

CREATE INDEX IF NOT EXISTS jm_perm_vacancy_views_vacancy_idx ON jm_perm_vacancy_views(vacancy_id);

ALTER TABLE jm_perm_vacancy_views DISABLE ROW LEVEL SECURITY;
