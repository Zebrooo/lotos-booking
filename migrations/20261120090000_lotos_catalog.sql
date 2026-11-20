alter table services add column local_code text;
create unique index services_local_code_key on services(local_code);
