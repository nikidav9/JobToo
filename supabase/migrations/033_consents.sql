-- Запись о согласии: кто, с чем и когда.
--
-- До этого галочка при регистрации была переменной в памяти экрана
-- (`const [agreed, setAgreed] = useState(false)`), и дальше кнопки
-- «Продолжить» о ней не знал никто. В базе не оставалось ни отметки, ни
-- даты, ни редакции документа.
--
-- Отсюда две беды сразу. Доказать, что человек соглашался, нечем — а
-- согласие на обработку персональных данных это ровно то, что оператор
-- должен уметь подтвердить. И вторая: у документов не было версий, значит
-- поправить формулировку можно было незаметно, и потом уже никто, включая
-- нас, не сказал бы, с каким текстом согласились те, кто зарегистрировался
-- раньше.
--
-- Версии появились (constants/legal.ts), эта таблица хранит принятое.

create table if not exists jm_consents (
    id           text primary key,
    user_id      text not null,
    -- Отпечаток набора: `terms:2026-06-25|privacy:...|consent:...`.
    -- Галочка одна на три документа, поэтому и сравнивать проще набор
    -- целиком: изменилась любая редакция — отпечаток другой, и это сигнал
    -- спросить заново.
    stamp        text not null,
    -- Тот же набор в разобранном виде: по нему видно, какая именно
    -- редакция какого документа была принята, без разбора строки.
    docs         jsonb not null default '{}'::jsonb,
    -- registration — принято при регистрации;
    -- backfill     — восстановлено по факту (см. ниже);
    -- reconsent    — принято заново после смены редакции.
    source       text not null default 'registration',
    accepted_at  timestamptz not null default now()
);

create index if not exists jm_consents_user_idx on jm_consents(user_id, accepted_at desc);

-- Закрыто так же, как остальные таблицы с данными людей: RLS без политик,
-- прав у anon нет. Пишет и читает только служебная роль через прокси.
alter table jm_consents enable row level security;
revoke all on jm_consents from anon;
revoke all on jm_consents from authenticated;
grant all on jm_consents to service_role;

-- ── Что было до этой таблицы ──────────────────────────────────────────────
--
-- Экран с документами появился в приложении 25 июня 2026, и с тех пор тексты
-- не менялись ни разу: единственная правка файла, 26 июля, трогала размеры
-- шрифтов. Значит про тех, кто регистрировался после 25 июня, можно сказать
-- твёрдо — они принимали ровно ту редакцию, что действует сейчас.
--
-- А кто регистрировался раньше, не принимал ничего: экрана не существовало.
-- Записывать им согласие задним числом нельзя. Именно этого мы и добиваемся
-- всей затеей — чтобы в таблице стояла правда, в том числе неудобная.
-- Поэтому у них source = 'нет-согласия' и пустой отпечаток: при следующей
-- смене редакции документов их спросят вместе со всеми.
insert into jm_consents (id, user_id, stamp, docs, source, accepted_at)
select
    'backfill:' || u.id,
    u.id,
    case when u.created_at >= timestamptz '2026-06-25 00:00:00+03'
         then 'terms:2026-06-25|privacy:2026-06-25|consent:2026-06-25'
         else '' end,
    case when u.created_at >= timestamptz '2026-06-25 00:00:00+03'
         then jsonb_build_object('terms','2026-06-25','privacy','2026-06-25','consent','2026-06-25')
         else '{}'::jsonb end,
    case when u.created_at >= timestamptz '2026-06-25 00:00:00+03'
         then 'backfill'
         else 'нет-согласия' end,
    u.created_at
from jm_users u
where not exists (select 1 from jm_consents c where c.user_id = u.id)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
