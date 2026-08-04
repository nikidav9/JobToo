-- Возврат отметки у одной строки, задетой проверкой триггера.
--
-- Чтобы убедиться, что триггер жив после enable, я обновил одну смену,
-- записав в неё то же значение. Данные не изменились, но updated_at
-- сдвинулся на сегодня — и в истории появилась правка, которой не было.
--
-- Триггер выключаем: иначе он перебьёт и эту починку, ровно как в 016.

alter table jm_vacancies disable trigger jm_vacancies_touch;

update jm_vacancies
   set updated_at = created_at
 where id = 'moxzq65pb6bn';

alter table jm_vacancies enable trigger jm_vacancies_touch;
