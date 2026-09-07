-- Источник постоянных вакансий arbihunter.
--
-- Регистрируем его как обычный внешний источник. Адрес фида — наш адаптер
-- php-proxy/arbihunter.php: он ходит в API arbihunter, переводит его формат
-- в наш и всем вакансиям ставит kind=permanent. Отсюда следует главное:
--
--   • эти вакансии показываются в разделе «Работа» (постоянные), а не в
--     подработках — раздел подработок читает наши jm_vacancies;
--   • в TG-чат «ПОДРАБОТКИ» они не уходят: рассылка в группу срабатывает
--     только при создании НАШЕЙ вакансии, приём внешних её не вызывает.
--
-- period_min=120 — постоянные вакансии живут неделями, чаще ходить незачем
-- (для сменных источников ставят меньше).
-- environment=production — иначе приложение их не покажет (см. 046): выдача
-- в приложение отфильтрована по environment='production'.
--
-- Идемпотентно: on conflict do nothing. Название/расписание/вкл-выкл дальше
-- правятся в дашборде («Источники»), это только первичная регистрация.

insert into public.jm_ext_sources (id, name, url, enabled, period_min, environment)
values (
    'arbihunter',
    'Arbihunter',
    'https://jobtoo.ru/api/arbihunter.php',
    true,
    120,
    'production'
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
