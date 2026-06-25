-- Add views counter to bulletins
ALTER TABLE jm_bulletins ADD COLUMN IF NOT EXISTS views int4 NOT NULL DEFAULT 0;

-- Atomic increment function
CREATE OR REPLACE FUNCTION increment_bulletin_views(bid text)
RETURNS void LANGUAGE SQL AS $$
  UPDATE jm_bulletins SET views = views + 1 WHERE id = bid;
$$;
