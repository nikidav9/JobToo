-- Карточка входящего должна нести переписку, а не одну строку.
--
-- Человек отвечает на наш вопрос, заданный шесть часов назад, — и в телеграм
-- прилетает голое «Да я работаю щас» с пометкой «нужен ваш ответ». Понять,
-- о чём это, невозможно: «я вообще не понимаю контекста».
--
-- Причина в том, что мы сохраняли только входящие. Свои сообщения — и опрос,
-- и ответы бота — не сохранялись нигде, поэтому и показать было нечего.
-- Теперь в ящик ложатся обе стороны, и карточка показывает последние ходы.

alter table jm_bot_messages
  add column if not exists direction text not null default 'in',
  add column if not exists topic     text;

-- Всё, что уже накопилось, — входящее: исходящих мы тогда не писали.
update jm_bot_messages set direction = 'in' where direction is null;

create index if not exists jm_bot_messages_tg_idx
  on jm_bot_messages (telegram_id, created_at desc);
