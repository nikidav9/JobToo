-- Отмена смены директором: мэтч уходит в «Завершённые» как отменённый,
-- при этом смена НЕ считается завершённой (shift_completed остаётся false).
alter table jm_likes add column if not exists cancelled boolean not null default false;
