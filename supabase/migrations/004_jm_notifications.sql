create table if not exists jm_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references jm_users(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists jm_notifications_user_id_idx on jm_notifications(user_id);
create index if not exists jm_notifications_created_at_idx on jm_notifications(created_at desc);
