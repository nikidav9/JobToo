-- Вакансии из чужих источников.
--
-- Отдельными таблицами, а не колонкой «источник» в jm_vacancies, и это
-- главное решение здесь. Наши вакансии — живые: на них откликаются, по ним
-- идёт переписка, у них есть счётчик набранных людей. Чужая вакансия ничего
-- этого не умеет: откликнуться на неё можно только у источника, а мы её
-- показываем и уводим по ссылке.
--
-- Смешать их в одну таблицу — значит потом в каждом запросе помнить, что
-- половина строк «не совсем настоящие». Один забытый фильтр — и человек
-- жмёт «Откликнуться» на объявлении, которого у нас нет.
--
-- Второе: обновление фида переписывает чужие строки целиком. Если бы они
-- лежали вперемешку с нашими, любая ошибка в разборе фида задевала бы
-- вакансии наших работодателей.

-- Откуда тянем. Строкой на источник, чтобы включение нового не требовало
-- выкладки: добавили запись — со следующего захода пошли данные.
create table if not exists jm_ext_sources (
    id            text primary key,
    name          text not null,
    -- Адрес фида. Тянем сами, а не ждём, когда пришлют: так расписание наше,
    -- и партнёру не надо ничего у себя настраивать, кроме доступа.
    url           text not null,
    -- Заголовок доступа целиком, как его надо послать: у одних это Bearer,
    -- у других свой заголовок. Гадать за партнёра дороже, чем хранить строку.
    auth_header   text,
    auth_value    text,
    enabled       boolean not null default true,
    -- Как часто ходить. Смены на сегодня протухают за часы, постоянные
    -- вакансии живут неделями — одна цифра на всех не годится.
    period_min    integer not null default 30,
    last_run_at   timestamptz,
    last_status   text,
    last_count    integer,
    created_at    timestamptz not null default now()
);

create table if not exists jm_ext_vacancies (
    id            text primary key,
    source_id     text not null,
    -- Идентификатор у источника. По нему узнаём ту же вакансию при следующем
    -- заходе: без него каждый заход плодил бы дубли самой себя.
    external_id   text not null,
    title         text not null,
    company       text,
    metro_station text,
    address       text,
    lat           double precision,
    lng           double precision,
    kind          text not null default 'shift',   -- shift | permanent
    date          text,
    time_start    text,
    time_end      text,
    salary        numeric,
    pay_period    text default 'shift',
    schedule      text,
    description   text,
    -- Куда уводить человека. Без этого мы не агрегатор, а перепечатка чужого.
    url           text not null,
    -- Отпечаток «та же самая работа»: компания, должность, метро, дата,
    -- время. Нужен, чтобы не показывать рядом свою смену и её же копию,
    -- приехавшую из чужого сервиса.
    dedupe_key    text,
    active        boolean not null default true,
    first_seen_at timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    unique (source_id, external_id)
);

create index if not exists jm_ext_vac_active_idx on jm_ext_vacancies (active, last_seen_at desc);
create index if not exists jm_ext_vac_metro_idx  on jm_ext_vacancies (metro_station) where active;
create index if not exists jm_ext_vac_dedupe_idx on jm_ext_vacancies (dedupe_key) where active;

grant select, insert, update on jm_ext_sources, jm_ext_vacancies to service_role;
-- Читать чужие вакансии приложению можно: они и так публичные у источника.
grant select on jm_ext_vacancies to anon, authenticated;
-- А вот список источников с ключами доступа — нет.
revoke all on jm_ext_sources from anon, authenticated;

notify pgrst, 'reload schema';
