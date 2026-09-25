-- Вход сотрудников в CRM: сессии (в базе только хеш токена) и защита от
-- подбора пароля — после пяти неудач подряд вход закрыт на 15 минут.
create table staff_sessions (
  token_hash text primary key,
  admin_id bigint not null references admins (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index staff_sessions_admin_idx on staff_sessions (admin_id);

alter table admins
  add column failed_logins int not null default 0,
  add column locked_until timestamptz;
