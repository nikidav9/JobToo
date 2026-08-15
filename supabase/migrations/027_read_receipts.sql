-- Галочки о прочтении в чатах.
--
-- Отметку хранит не сообщение, а чат: у каждой стороны время, когда она
-- в последний раз открывала переписку. Сообщение прочитано, если оно
-- старше этого времени.
--
-- Почему так, а не столбец у каждого сообщения: чтение — это событие про
-- человека, а не про сообщение. Открыл чат — прочитал всё, что там было.
-- Иначе одно открытие переписки означало бы правку сотни строк, и делать
-- это пришлось бы при каждом заходе в чат.
--
-- Момент прочтения система знает и сейчас: dbMarkRead обнуляет счётчик
-- непрочитанных. Не хватало только времени — его и добавляем.

alter table jm_chats
  add column if not exists worker_read_at   timestamptz,
  add column if not exists employer_read_at timestamptz;

-- Прошлую переписку не выдумываем.
--
-- Счётчики непрочитанных говорят ровно то, что нужно: сколько последних
-- сообщений собеседника человек не видел. Значит граница проходит по
-- следующему за ними — его и берём.
--
-- Залить всё одинаковыми галочками было бы проще, но неправдой: у кого-то
-- отклик действительно висит непрочитанным, и показать его прочитанным —
-- значит соврать человеку о том, ради чего он эти галочки и открыл.

update jm_chats c
   set worker_read_at = (
         select m.created_at
           from jm_messages m
          where m.chat_id = c.id
            and m.sender_id = c.employer_id
          order by m.created_at desc
         offset coalesce(c.unread_worker, 0)
          limit 1)
 where c.worker_read_at is null;

update jm_chats c
   set employer_read_at = (
         select m.created_at
           from jm_messages m
          where m.chat_id = c.id
            and m.sender_id = c.worker_id
          order by m.created_at desc
         offset coalesce(c.unread_employer, 0)
          limit 1)
 where c.employer_read_at is null;

-- Остаётся null там, где читать было нечего: собеседник ещё не написал ни
-- слова. Это верно и по смыслу — галочке не к чему относиться.
