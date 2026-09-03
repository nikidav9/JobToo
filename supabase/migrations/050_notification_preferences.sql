-- Opt-in vacancy delivery preferences.
-- No row migration is required: NULL/absent value means the current behaviour ("all").
ALTER TABLE public.jm_users
  ADD COLUMN IF NOT EXISTS vacancy_delivery_mode text;

ALTER TABLE public.jm_users
  DROP CONSTRAINT IF EXISTS jm_users_vacancy_delivery_mode_check;

ALTER TABLE public.jm_users
  ADD CONSTRAINT jm_users_vacancy_delivery_mode_check
  CHECK (
    vacancy_delivery_mode IS NULL
    OR vacancy_delivery_mode IN ('all', 'work_types', 'metro', 'work_types_metro', 'off')
  );

COMMENT ON COLUMN public.jm_users.vacancy_delivery_mode IS
  'Opt-in filter for promotional vacancy notifications. NULL/all preserves full delivery.';
