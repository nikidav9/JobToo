-- Починка предыдущей миграции.
--
-- В 016 порядок был неверный: сначала создавался триггер, потом строкам
-- проставлялось `updated_at = created_at`. Триггер сработал на этом же
-- UPDATE и записал now() — в итоге у всех до единой записи оказалось
-- «изменено сегодня», то есть ровно та бесполезная отметка, ради ухода от
-- которой всё и затевалось.
--
-- Здесь то же самое, но с выключенным на время триггером.
--
-- Отделяем починку от настоящих правок по времени: миграция 016 отработала
-- 4 августа между 10:40 и 10:50, все строки получили отметку из этого
-- промежутка. Всё, что вне его, — настоящие изменения, их не трогаем.

alter table jm_vacancies disable trigger jm_vacancies_touch;
alter table jm_perm_vacancies disable trigger jm_perm_vacancies_touch;

update jm_vacancies
   set updated_at = created_at
 where updated_at between '2026-08-04T10:40:00Z' and '2026-08-04T10:50:00Z';

update jm_perm_vacancies
   set updated_at = created_at
 where updated_at between '2026-08-04T10:40:00Z' and '2026-08-04T10:50:00Z';

alter table jm_vacancies enable trigger jm_vacancies_touch;
alter table jm_perm_vacancies enable trigger jm_perm_vacancies_touch;
