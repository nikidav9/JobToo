-- Точный счётчик внешних вакансий для шторки фильтров.
-- Раньше телефон считал только уже скачанные страницы и показывал, например,
-- «50», хотя у источника были тысячи подходящих вакансий.

create index if not exists jm_ext_vac_source_environment_active_idx
  on public.jm_ext_vacancies (source_id, environment, active, kind);

create or replace function public.jm_ext_vacancy_filter_count(p_filters jsonb default '{}'::jsonb)
returns table(total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct coalesce(nullif(v.dedupe_key, ''), concat(v.source_id, ':', v.id)))::bigint as total
  from public.jm_ext_vacancies v
  join public.jm_ext_sources s on s.id = v.source_id
  where v.active = true
    and v.environment = 'production'
    and v.kind = 'permanent'
    and s.enabled = true
    and s.environment = 'production'
    and (
      not (p_filters ? 'sources')
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(p_filters->'sources', '[]'::jsonb)) x
        where x = v.source_id
      )
    )
    and (
      coalesce(trim(p_filters->>'query'), '') = ''
      or (
        (
          (coalesce(jsonb_array_length(p_filters->'search_in'), 0) = 0
            or (p_filters->'search_in') ? 'title')
          and concat_ws(' ', v.title, v.company) ilike '%' || trim(p_filters->>'query') || '%'
        )
        or (
          (coalesce(jsonb_array_length(p_filters->'search_in'), 0) = 0
            or (p_filters->'search_in') ? 'desc')
          and coalesce(v.description, '') ilike '%' || trim(p_filters->>'query') || '%'
        )
      )
    )
    and (
      coalesce(jsonb_array_length(p_filters->'stations'), 0) = 0
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(p_filters->'stations', '[]'::jsonb)) x
        where x = v.metro_station_norm
      )
    )
    and (
      coalesce(nullif(p_filters->>'salary_from', '')::numeric, 0) <= 0
      or coalesce(v.salary, 0) >= (p_filters->>'salary_from')::numeric
    )
    and (
      coalesce(p_filters->>'posted', 'all') = 'all'
      or (p_filters->>'posted' = 'week' and v.first_seen_at >= now() - interval '7 days')
      or (p_filters->>'posted' = '3days' and v.first_seen_at >= now() - interval '3 days')
    )
    and (
      coalesce(jsonb_array_length(p_filters->'schedules'), 0) = 0
      or exists (
        select 1 from jsonb_array_elements_text(coalesce(p_filters->'schedules', '[]'::jsonb)) x
        where position(lower(x) in lower(coalesce(v.schedule, ''))) > 0
      )
    );
$$;

revoke all on function public.jm_ext_vacancy_filter_count(jsonb) from public, anon, authenticated;
grant execute on function public.jm_ext_vacancy_filter_count(jsonb) to service_role;

notify pgrst, 'reload schema';
