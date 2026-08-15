-- Уникальные ограничения, которых не оказалось в восстановленной схеме.
--
-- Базовую схему (000_base_schema.sql) я снял с облака через описание API,
-- а оно перечисляет колонки и первичные ключи, но молчит про остальные
-- ограничения. Уникальные при переносе потерялись — и вместе с ними
-- перестало работать всё, что вставляет «или обновляет, если уже есть».
--
-- Обнаружилось сквозным тестом, а не чтением кода: отклик на смену падал с
-- «there is no unique or exclusion constraint matching the ON CONFLICT
-- specification». То есть человек нажал бы «Откликнуться» — и ничего.
--
-- Что именно нужно, видно по вызовам sb_upsert в php-proxy/db.php: третий
-- аргумент там и есть перечень колонок, по которым ожидается уникальность.

-- Отклик работника на смену — один на пару «смена + работник».
-- Повторное нажатие должно обновлять существующую строку, а не плодить новые.
create unique index if not exists jm_likes_vacancy_worker_key
  on jm_likes (vacancy_id, worker_id);

-- То же для постоянных вакансий.
create unique index if not exists jm_perm_applications_vacancy_worker_key
  on jm_perm_applications (vacancy_id, worker_id);

-- Сохранённое: у человека одна закладка на объявление, а не пачка.
create unique index if not exists jm_saved_user_vacancy_key
  on jm_saved (user_id, vacancy_id);

create unique index if not exists jm_perm_saved_user_vacancy_key
  on jm_perm_saved (user_id, vacancy_id);
