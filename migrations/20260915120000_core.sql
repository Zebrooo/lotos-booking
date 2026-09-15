-- core: схема v1 по 12-design-v1.md, раздел 4.
create extension if not exists btree_gist;

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Одна строка настроек.
create table settings (
  id smallint primary key default 1 check (id = 1),
  free_cancel_hours int not null default 24,
  hold_minutes int not null default 15,
  lead_minutes int not null default 60,
  horizon_days int not null default 30,
  reminder_hours_before int not null default 27,
  cooling_off_minutes int not null default 60,
  arrive_early_minutes int not null default 10,
  slot_step_min int not null default 15,
  online_booking_paused boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger settings_touch before update on settings for each row execute function touch_updated_at();
insert into settings (id) values (1);

create table services (
  id bigint generated always as identity primary key,
  title text not null,
  kind text not null check (kind in ('consultation', 'ultrasound', 'analysis', 'diagnostics')),
  duration_min int not null check (duration_min between 5 and 480),
  price_kopecks int not null check (price_kopecks >= 0),
  prepay_kopecks int not null default 40000 check (prepay_kopecks >= 0),
  prep_note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table resources (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('doctor', 'room', 'device')),
  title text not null,
  specialty text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ресурсы услуги: врачи вида doctor — кто её оказывает, пациент выбирает
-- одного; ресурсы других видов занимаются всегда (аппарат, кабинет).
create table service_resources (
  service_id bigint not null references services (id) on delete cascade,
  resource_id bigint not null references resources (id) on delete cascade,
  primary key (service_id, resource_id)
);

create table schedule_rules (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  from_min int not null check (from_min between 0 and 1439),
  to_min int not null check (to_min between 1 and 1440),
  check (to_min > from_min)
);
create index schedule_rules_resource_idx on schedule_rules (resource_id, weekday);

create table schedule_exceptions (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('off', 'extra')),
  from_min int check (from_min between 0 and 1439),
  to_min int check (to_min between 1 and 1440),
  reason text,
  created_at timestamptz not null default now(),
  check ((from_min is null) = (to_min is null)),
  check (to_min is null or to_min > from_min),
  check (kind = 'off' or from_min is not null)
);
create index schedule_exceptions_resource_day_idx on schedule_exceptions (resource_id, day);

create table patients (
  id bigint generated always as identity primary key,
  full_name text not null,
  birth_date date not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone, birth_date)
);
create trigger patients_touch before update on patients for each row execute function touch_updated_at();

create table consents (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('personal_data', 'prepay_terms')),
  version int not null,
  body text not null,
  published_at timestamptz not null default now(),
  unique (kind, version)
);

create table bookings (
  id bigint generated always as identity (start with 1001) primary key,
  token text not null unique,
  patient_id bigint not null references patients (id) on delete restrict,
  service_id bigint not null references services (id) on delete restrict,
  service jsonb not null,
  resource_id bigint not null references resources (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'held'
    check (status in ('held', 'confirmed', 'done', 'no_show', 'cancelled', 'transferred', 'expired')),
  hold_until timestamptz,
  paid_at timestamptz,
  cancelled_by text check (cancelled_by in ('patient', 'clinic')),
  cancelled_at timestamptz,
  cancel_reason text,
  hours_before_cancel numeric(8, 2),
  transferred_from_id bigint references bookings (id) on delete set null,
  source text not null default 'site' check (source in ('site', 'admin')),
  booker_relation text not null default 'self' check (booker_relation in ('self', 'child', 'relative')),
  booker_name text,
  booker_phone text,
  booker_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((status = 'cancelled') = (cancelled_by is not null)),
  check (status <> 'held' or hold_until is not null)
);
create index bookings_patient_idx on bookings (patient_id, starts_at desc);
create index bookings_status_time_idx on bookings (status, starts_at);
create index bookings_hold_idx on bookings (hold_until) where status = 'held';
create trigger bookings_touch before update on bookings for each row execute function touch_updated_at();

-- Единственная защита от двойной продажи. Полуоткрытый интервал: запись до
-- 12:00 и запись с 12:00 не мешают друг другу. Держат ресурс только active.
create table booking_resources (
  booking_id bigint not null references bookings (id) on delete cascade,
  resource_id bigint not null references resources (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  primary key (booking_id, resource_id),
  check (ends_at > starts_at),
  constraint booking_resources_no_overlap exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (active)
);
create index booking_resources_resource_time_idx on booking_resources (resource_id, starts_at) where active;

create table booking_consents (
  booking_id bigint not null references bookings (id) on delete cascade,
  consent_id bigint not null references consents (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  primary key (booking_id, consent_id)
);

create table payments (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  provider text not null,
  external_id text,
  amount_kopecks int not null check (amount_kopecks > 0),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'expired')),
  pay_url text,
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index payments_booking_idx on payments (booking_id);
create trigger payments_touch before update on payments for each row execute function touch_updated_at();

-- Журнал денег: только вставка. Состояние выводится кодом (src/domain/money.ts).
create table ledger (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  kind text not null check (kind in ('advance', 'settle', 'refund', 'retain', 'transfer_out', 'transfer_in')),
  amount_kopecks int not null check (amount_kopecks > 0),
  payment_id bigint references payments (id),
  note text,
  created_at timestamptz not null default now()
);
create index ledger_booking_idx on ledger (booking_id, id);

-- Возврат в работе: строка появляется при отмене, деньги и запись в ledger — когда провайдер подтвердил.
create table refunds (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  payment_id bigint not null references payments (id),
  amount_kopecks int not null check (amount_kopecks > 0),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  external_id text,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_status_idx on refunds (status);
create trigger refunds_touch before update on refunds for each row execute function touch_updated_at();

create table receipts (
  id bigint generated always as identity primary key,
  booking_id bigint not null references bookings (id) on delete restrict,
  kind text not null check (kind in ('advance', 'settle', 'refund')),
  ledger_id bigint references ledger (id),
  amount_kopecks int not null check (amount_kopecks > 0),
  email text not null,
  provider text,
  external_id text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index receipts_status_idx on receipts (status);
create trigger receipts_touch before update on receipts for each row execute function touch_updated_at();

create table admins (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'senior')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table notifications (
  id bigint generated always as identity primary key,
  booking_id bigint references bookings (id) on delete set null,
  channel text not null default 'email' check (channel in ('email')),
  recipient text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_status_idx on notifications (status, created_at);

create table audit (
  id bigint generated always as identity primary key,
  admin_id bigint references admins (id) on delete set null,
  action text not null,
  booking_id bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
