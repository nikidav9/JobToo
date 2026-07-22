-- Координаты выбранного адреса (из подсказок Яндекс.Карт) для вакансий,
-- постоянных вакансий и объявлений биржи. Позволяют в будущем показывать
-- точную точку на карте, а не только станцию метро.
alter table jm_vacancies      add column if not exists lat double precision,
                              add column if not exists lng double precision;

alter table jm_perm_vacancies add column if not exists lat double precision,
                              add column if not exists lng double precision;

alter table jm_bulletins      add column if not exists lat double precision,
                              add column if not exists lng double precision;
