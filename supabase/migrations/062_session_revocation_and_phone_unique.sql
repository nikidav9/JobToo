-- Отзыв сессий и уникальность телефона.
--
-- 1. sessions_valid_from — с какого момента токены этого человека считаются
--    действительными. Токен живёт тридцать дней и до сих пор не гасился ничем:
--    ни сменой пароля, ни блокировкой. Теперь смена пароля (своя и админский
--    сброс) поднимает эту отметку, и всё, что выдано раньше, перестаёт
--    работать. Проверку делает php-proxy/db.php при каждом запросе с токеном.
--
-- 2. Уникальность телефона. Телефон — это логин: по нему ищут строку при
--    входе (`dbLogin` берёт одну через sb_single). Двух строк с одним номером
--    быть не должно, а ограничения на это не было.
--
--    Индекс создаётся только если дублей нет. Так надо потому, что migrate.sh
--    работает с ON_ERROR_STOP=1: упавшая миграция остановит всю выкладку, в
--    том числе не связанную с этим. Если дубли есть, миграция скажет об этом
--    и пройдёт дальше, а разобраться с ними придётся руками — какую из двух
--    строк оставить, сервер решить не может.

alter table jm_users add column if not exists sessions_valid_from timestamptz;

do $$
declare
    dups int;
begin
    select count(*) into dups
    from (
        select phone
        from jm_users
        where phone is not null and phone <> ''
        group by phone
        having count(*) > 1
    ) d;

    if dups > 0 then
        raise notice 'jm_users.phone: % номеров задвоено — уникальный индекс не создан. Разобрать: select phone, count(*) from jm_users where phone <> '''' group by phone having count(*) > 1;', dups;
    else
        create unique index if not exists jm_users_phone_uniq
            on jm_users (phone)
            where phone is not null and phone <> '';
        raise notice 'jm_users.phone: уникальный индекс создан';
    end if;
end $$;
