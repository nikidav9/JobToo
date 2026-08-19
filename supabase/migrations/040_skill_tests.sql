-- Результаты микро-тестов по профессиям.
--
-- Зачем это вообще. Сегодня «кладовщик» и «повар» — это галочки, которые
-- человек ставит себе сам при регистрации. Работодатель не может отличить
-- того, кто на складе работал, от того, кто просто отметил галочку, и
-- различает их единственным доступным способом — по факту, на смене.
--
-- Пять вопросов и минута времени этого, конечно, не заменяют, но отделяют
-- «я умею» от «я нажал». Больше и не нужно: длинный экзамен на подработку
-- люди просто не проходят.
--
-- Строка на человека и профессию: пересдача переписывает свою же запись, а
-- не плодит историю. История попыток здесь никому не нужна — нужен ответ
-- «подтверждён или нет» и защита от перебора наугад.

create table if not exists jm_skill_results (
    user_id         text not null,
    -- stocker | cook | shift_supervisor | picker
    work_type       text not null,
    -- Результат последней попытки.
    correct         integer not null default 0,
    total           integer not null default 0,
    passed          boolean not null default false,
    -- Когда подтвердил. Не сбрасывается неудачной пересдачей: подтверждение
    -- было, и отнимать его за попытку улучшить результат нечестно.
    passed_at       timestamptz,
    -- Попытки за последние сутки — против перебора. Пять вопросов по четыре
    -- варианта берутся наугад с десятого захода, и без ограничения
    -- «подтверждённый навык» не значил бы ничего.
    attempts_today  integer not null default 0,
    attempts_day    date,
    last_attempt_at timestamptz,
    primary key (user_id, work_type)
);

create index if not exists jm_skill_results_passed_idx
    on jm_skill_results (work_type, passed) where passed;

alter table jm_skill_results enable row level security;
revoke all on jm_skill_results from anon, authenticated;
grant select, insert, update on jm_skill_results to service_role;
