-- Нейтральная причина для отменённой смены, когда ни одна сторона не должна
-- автоматически получать ухудшение рейтинга.
alter table public.jm_likes
  drop constraint if exists jm_likes_outcome_chk;

alter table public.jm_likes
  add constraint jm_likes_outcome_chk check (
    outcome is null or outcome in (
      'worked', 'no_show', 'worker_cancelled', 'employer_cancelled',
      'other_cancelled', 'cancelled_legacy'
    )
  );
