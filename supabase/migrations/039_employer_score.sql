-- Репутация работодателя: не одна звезда, а то, из-за чего люди уходят.
--
-- Работник ставил работодателю одну общую оценку. По ней невозможно понять
-- главного — того, ради чего человек и смотрит на компанию перед сменой:
-- совпадёт ли работа с описанием, заплатят ли вовремя, не отменят ли смену
-- накануне. Всё это слипалось в «четыре звезды», из которых не следует
-- ничего.
--
-- Оси взяты не из головы: это ровно те четыре, что названы в презентации, —
-- соответствие описанию, отношение, своевременность выплат, отмены смен.
--
-- Четвёртую не спрашиваем вовсе. Отмены мы и так знаем: с августа у каждой
-- несостоявшейся смены записана причина, и `employer_cancelled` — это и есть
-- ответ. Спрашивать у человека то, что записано в базе, значит получить
-- худшие данные (он помнит хуже) и заодно удлинить форму.

alter table jm_ratings
    add column if not exists emp_matched_desc numeric,  -- работа совпала с описанием, 1–5
    add column if not exists emp_attitude     numeric,  -- отношение к людям, 1–5
    add column if not exists emp_paid_on_time numeric;  -- заплатили вовремя, 1–5

alter table jm_users
    -- 0–100, по тем же правилам, что и у работника: пусто, пока смен мало.
    add column if not exists emp_score            integer,
    -- Сколько смен у этого работодателя дошло до какого-либо исхода.
    add column if not exists emp_score_shifts     integer not null default 0,
    add column if not exists emp_score_desc       numeric,
    add column if not exists emp_score_attitude   numeric,
    add column if not exists emp_score_pay        numeric,
    -- Доля смен, которые работодатель отменил сам. Считается из исходов,
    -- а не со слов: 1 — не отменял ни одной.
    add column if not exists emp_score_kept       numeric,
    add column if not exists emp_score_updated_at timestamptz;

create index if not exists jm_users_emp_score_idx on jm_users (emp_score desc nulls last)
    where role = 'employer';
