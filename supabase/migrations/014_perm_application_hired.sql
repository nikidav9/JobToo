-- Статус hired для откликов на постоянные вакансии.
--
-- «Завершить» в «Мэтчах» переводит одобренного кандидата в этот статус:
-- карточка уходит во вкладку «Завершённые», а сама вакансия остаётся в
-- поиске — закрыть её можно во вкладке «Активные».
--
-- Ограничение на колонке status разрешало только три значения, и запись
-- падала с ошибкой jm_perm_applications_status_check. Пересоздаём его,
-- добавив четвёртое.
--
-- Имя ограничения могло отличаться, поэтому снимаем все проверки по колонке
-- status у этой таблицы, а потом ставим одну свою.

do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'jm_perm_applications'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.jm_perm_applications drop constraint %I', c.conname);
  end loop;

  alter table public.jm_perm_applications
    add constraint jm_perm_applications_status_check
    check (status in ('pending', 'approved', 'rejected', 'hired'));
end $$;

-- Проверить: запрос ниже должен пройти без ошибки и вернуть 0 строк.
--   update jm_perm_applications set status = 'hired' where id = '';
