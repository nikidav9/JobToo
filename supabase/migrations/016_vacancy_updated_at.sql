-- Когда строку вакансии меняли в последний раз.
--
-- Понадобилось после разбирательства, которое ничем не кончилось: 44 смены с
-- датами до 10 сентября лежат закрытыми, найдено на них ноль работников, и
-- установить, кто и когда их закрыл, оказалось нечем. Крон закрывает только
-- прошедшие смены, приложение — тоже только прошедшие, при мэтче смена
-- закрывается лишь когда набрана. Ни один известный путь не подходит, а
-- истории изменений у таблицы нет вовсе.
--
-- Теперь любое изменение оставляет след. Триггер, а не значение по умолчанию:
-- default сработает один раз при вставке, а нам нужна отметка на каждую правку,
-- и ставить её должна база — писать это в каждом месте кода означало бы рано
-- или поздно где-то забыть.

create or replace function jm_touch_updated_at() returns trigger
language plpgsql
-- Схема указана явно: функция срабатывает под правами вызывающего, и
-- подставленный search_path не должен уводить её к чужим объектам.
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table jm_vacancies add column if not exists updated_at timestamptz;
alter table jm_perm_vacancies add column if not exists updated_at timestamptz;

drop trigger if exists jm_vacancies_touch on jm_vacancies;
create trigger jm_vacancies_touch
  before update on jm_vacancies
  for each row execute function jm_touch_updated_at();

drop trigger if exists jm_perm_vacancies_touch on jm_perm_vacancies;
create trigger jm_perm_vacancies_touch
  before update on jm_perm_vacancies
  for each row execute function jm_touch_updated_at();

-- Существующим строкам ставим время создания: неправда, но честнее, чем
-- «изменено только что» у записи, которую не трогали месяц.
update jm_vacancies set updated_at = created_at where updated_at is null;
update jm_perm_vacancies set updated_at = created_at where updated_at is null;

-- «Что менялось за последние сутки» — основной запрос, ради которого всё это.
create index if not exists jm_vacancies_updated_idx on jm_vacancies (updated_at desc nulls last);
create index if not exists jm_perm_vacancies_updated_idx on jm_perm_vacancies (updated_at desc nulls last);
