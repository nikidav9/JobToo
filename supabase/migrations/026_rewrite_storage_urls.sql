-- Переписать ссылки на файлы с облака на свой сервер.
--
-- Файлы перенесены, но в базе лежат полные адреса вида
-- https://bbiqmkeysalwdonlnylb.supabase.co/storage/v1/object/public/avatars/...
-- То есть картинки продолжали бы запрашиваться из облака — а оно
-- заблокировано. Аватары и вложения чатов просто не открывались бы, без
-- всякой ошибки: пустой кружок вместо лица.
--
-- Это тот самый шаг, который легче всего забыть при переезде: база
-- переехала, файлы переехали, а ссылки остались указывать в никуда.
--
-- Меняем только начало адреса, имена файлов сохраняются.

update jm_users
   set avatar_url = replace(avatar_url,
         'https://bbiqmkeysalwdonlnylb.supabase.co',
         'https://147.45.184.99.sslip.io')
 where avatar_url like '%bbiqmkeysalwdonlnylb.supabase.co%';

-- В сообщениях адрес лежит прямо в тексте, с пометкой [img] или [voice].
update jm_messages
   set text = replace(text,
         'https://bbiqmkeysalwdonlnylb.supabase.co',
         'https://147.45.184.99.sslip.io')
 where text like '%bbiqmkeysalwdonlnylb.supabase.co%';

-- На случай, если адрес встречается ещё где-то: постоянные вакансии и
-- объявления тоже могут хранить картинки.
update jm_perm_vacancies
   set company = replace(company,
         'https://bbiqmkeysalwdonlnylb.supabase.co',
         'https://147.45.184.99.sslip.io')
 where company like '%bbiqmkeysalwdonlnylb.supabase.co%';
