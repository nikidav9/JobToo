-- Ключ зарегистрированного приложения проверен на боевом адаптере:
-- https://jobtoo.ru/api/superjob.php возвращает валидный каталог вакансий.
-- Включаем только импорт каталога. Отклик остаётся redirect до завершения
-- пользовательского OAuth SuperJob и отдельной проверки отправки резюме.

update public.jm_ext_sources
set enabled = true,
    environment = 'production',
    connector_kind = 'superjob',
    integration_mode = 'redirect'
where id = 'superjob';

notify pgrst, 'reload schema';
