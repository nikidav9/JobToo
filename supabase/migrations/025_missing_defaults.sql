-- Значения по умолчанию, потерянные при переносе схемы.
--
-- Та же история, что и с уникальными ограничениями: базовую схему я снял с
-- облака через описание API и перенёс колонки с типами, но не правила.
-- Умолчаний там было 68, и без них половина обычных действий падает с
-- «null value in column ... violates not-null constraint».
--
-- В облаке эти значения проставлялись сами: время создания, признак
-- прочитанности, нулевой счётчик просмотров. Приложение их не передаёт и не
-- обязано — оно рассчитывает, что база подставит.
--
-- Проверено сквозным тестом: без этого работник не может откликнуться на
-- смену, а работодатель — создать её.

alter table jm_bot_messages alter column created_at set default now();
alter table jm_bot_messages alter column answered set default false;
alter table jm_bot_messages alter column direction set default 'in';
alter table jm_bulletins alter column status set default 'open';
alter table jm_bulletins alter column created_at set default now();
alter table jm_chats alter column vac_title set default '';
alter table jm_chats alter column company_name set default '';
alter table jm_chats alter column unread_worker set default 0;
alter table jm_chats alter column unread_employer set default 0;
alter table jm_chats alter column created_at set default now();
alter table jm_chats alter column is_locked set default false;
alter table jm_complaints alter column id set default (gen_random_uuid());
alter table jm_complaints alter column reporter_phone set default '';
alter table jm_complaints alter column target_phone set default '';
alter table jm_complaints alter column created_at set default now();
alter table jm_likes alter column worker_liked set default false;
alter table jm_likes alter column worker_skipped set default false;
alter table jm_likes alter column is_match set default false;
alter table jm_likes alter column worker_confirmed set default false;
alter table jm_likes alter column employer_confirmed set default false;
alter table jm_likes alter column worker_rated set default false;
alter table jm_likes alter column employer_rated set default false;
alter table jm_likes alter column shift_completed set default false;
alter table jm_likes alter column created_at set default now();
alter table jm_likes alter column cancelled set default false;
alter table jm_messages alter column created_at set default now();
alter table jm_notifications alter column id set default (gen_random_uuid());
alter table jm_notifications alter column is_read set default false;
alter table jm_notifications alter column created_at set default now();
alter table jm_perm_applications alter column status set default 'pending';
alter table jm_perm_applications alter column created_at set default now();
alter table jm_perm_saved alter column id set default (gen_random_uuid());
alter table jm_perm_saved alter column created_at set default now();
alter table jm_perm_vacancies alter column company set default '';
alter table jm_perm_vacancies alter column salary set default 0;
alter table jm_perm_vacancies alter column schedule set default '';
alter table jm_perm_vacancies alter column status set default 'open';
alter table jm_perm_vacancies alter column created_at set default now();
alter table jm_perm_vacancy_views alter column viewed_at set default now();
alter table jm_ratings alter column created_at set default now();
alter table jm_saved alter column id set default (gen_random_uuid());
alter table jm_saved alter column created_at set default now();
alter table jm_settings alter column updated_at set default now();
alter table jm_support_messages alter column direction set default 'in';
alter table jm_support_messages alter column created_at set default now();
alter table jm_support_threads alter column updated_at set default now();
alter table jm_users alter column first_name set default '';
alter table jm_users alter column last_name set default '';
alter table jm_users alter column avg_rating set default 0;
alter table jm_users alter column rating_count set default 0;
alter table jm_users alter column is_blocked set default false;
alter table jm_users alter column created_at set default now();
alter table jm_users alter column nudge_off set default false;
alter table jm_vacancies alter column company set default '';
alter table jm_vacancies alter column work_type set default 'stocker';
alter table jm_vacancies alter column work_type_label set default 'Кладовщик';
alter table jm_vacancies alter column time_start set default '';
alter table jm_vacancies alter column time_end set default '';
alter table jm_vacancies alter column salary set default 0;
alter table jm_vacancies alter column workers_needed set default 1;
alter table jm_vacancies alter column workers_found set default 0;
alter table jm_vacancies alter column is_urgent set default false;
alter table jm_vacancies alter column no_experience_needed set default true;
alter table jm_vacancies alter column status set default 'open';
alter table jm_vacancies alter column created_at set default now();
alter table jm_vacancy_views alter column viewed_at set default now();
alter table jm_web_push_subscriptions alter column updated_at set default now();
alter table jm_worker_slots alter column status set default 'open';
