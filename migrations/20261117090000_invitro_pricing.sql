create table price_import_runs (
  id bigint generated always as identity primary key,
  source text not null check (source in ('invitro')),
  city_slug text not null,
  city_external_id text not null,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  total_products int not null default 0,
  analyses_count int not null default 0,
  complexes_count int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table external_price_products (
  id bigint generated always as identity primary key,
  run_id bigint not null references price_import_runs(id) on delete cascade,
  source text not null check (source in ('invitro')),
  external_id text not null,
  bitrix_id int,
  kind text not null check (kind in ('analysis', 'complex')),
  code text,
  title text not null,
  category text not null default '',
  description text not null default '',
  price_kopecks int not null check (price_kopecks >= 0),
  deadline_days int,
  available_at_home boolean not null default false,
  additional_services jsonb not null default '[]'::jsonb,
  source_url text not null,
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  unique (source, external_id)
);
create index external_price_products_run_idx on external_price_products(run_id, kind);
create index external_price_products_title_idx on external_price_products(lower(title));

create table service_price_links (
  id bigint generated always as identity primary key,
  service_id bigint not null references services(id) on delete cascade,
  source text not null check (source in ('invitro')),
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (service_id),
  unique (source, external_id)
);
