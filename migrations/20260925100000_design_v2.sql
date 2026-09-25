-- design_v2: схема под дизайн «Лотос v2» (docs/15-plan-v2.md).

-- ── Ресурсы: стаж, кабинет, фото ──────────────────────────────────────────
alter table resources
  add column experience text,
  add column room text,
  add column photo_url text;

-- ── Настройки: модель оплаты, срок брони, окно записи, пауза ─────────────
-- slot_step_min пустой — шаг сетки равен длительности услуги, как в дизайне.
alter table settings
  add column pay_model text not null default 'both' check (pay_model in ('both', 'online', 'reserve')),
  add column reserve_deadline_min int not null default 1020,
  add column reserve_min_lead_minutes int not null default 60,
  add column reserve_before_visit_minutes int not null default 120,
  add column desk_opens_min int not null default 480,
  add column booking_open_until date,
  add column paused_at timestamptz,
  add column paused_by text,
  add column paused_reason text,
  add column paused_comment text;
alter table settings alter column slot_step_min drop not null;
alter table settings alter column slot_step_min set default null;
update settings set slot_step_min = null;

-- ── Записи: состояния, бронь, проверка телефона, согласие пациента ────────
alter table bookings drop constraint bookings_status_check;
alter table bookings add constraint bookings_status_check check (status in (
  'held', 'pending', 'claimed', 'confirmed', 'arrived', 'done', 'no_show', 'cancelled', 'transferred', 'expired'));
alter table bookings drop constraint bookings_source_check;
alter table bookings add constraint bookings_source_check check (source in ('site', 'phone', 'desk', 'admin'));
alter table bookings
  add column pay_mode text not null default 'online' check (pay_mode in ('online', 'reserve')),
  add column pay_deadline timestamptz,
  add column phone_verified_at timestamptz,
  add column patient_consent_token text unique,
  add column patient_consent_at timestamptz,
  add column claim_note text,
  add column arrived_at timestamptz,
  add constraint bookings_pending_deadline check (status not in ('pending', 'claimed') or pay_deadline is not null);
create index bookings_pending_idx on bookings (pay_deadline) where status = 'pending';

-- ── Групповые дни и квота сайта ───────────────────────────────────────────
create table group_days (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  day date not null,
  min_patients int not null check (min_patients >= 2),
  decide_at timestamptz not null,
  unique (resource_id, day)
);

create table site_quota (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  from_min int not null check (from_min between 0 and 1439),
  to_min int not null check (to_min between 1 and 1440),
  check (to_min > from_min)
);

-- ── Коды СМС: подтверждение телефона при записи и вход в кабинет ──────────
create table sms_codes (
  id bigint generated always as identity primary key,
  phone text not null,
  purpose text not null check (purpose in ('booking', 'login')),
  booking_id bigint references bookings (id) on delete cascade,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index sms_codes_phone_idx on sms_codes (phone, purpose, created_at desc);

alter table notifications drop constraint notifications_channel_check;
alter table notifications add constraint notifications_channel_check check (channel in ('email', 'sms'));

-- ── Чеки: на телефон или почту ────────────────────────────────────────────
alter table receipts alter column email drop not null;
alter table receipts add column phone text;
alter table receipts add constraint receipts_contact_check check (email is not null or phone is not null);

-- ── Журнал денег: канал и подробности для CRM ─────────────────────────────
alter table ledger
  add column channel text check (channel in ('online', 'cash', 'manual', 'transfer')),
  add column detail text;

-- ── Кабинет пациента ──────────────────────────────────────────────────────
create table patient_accounts (
  phone text primary key,
  email text,
  notify_remind boolean not null default true,
  notify_results boolean not null default true,
  notify_email boolean not null default false,
  created_at timestamptz not null default now()
);

create table patient_sessions (
  token_hash text primary key,
  phone text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index patient_sessions_phone_idx on patient_sessions (phone);

create table medical_documents (
  id bigint generated always as identity primary key,
  patient_id bigint not null references patients (id) on delete cascade,
  booking_id bigint references bookings (id) on delete set null,
  kind text not null check (kind in ('concl', 'lab', 'study')),
  title text not null,
  author text not null,
  issued_on date not null,
  ready_on date,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index medical_documents_patient_idx on medical_documents (patient_id, issued_on desc);

create table document_reads (
  document_id bigint not null references medical_documents (id) on delete cascade,
  phone text not null,
  read_at timestamptz not null default now(),
  primary key (document_id, phone)
);

create table cabinet_requests (
  id bigint generated always as identity primary key,
  phone text not null,
  kind text not null check (kind in ('tax', 'child')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- ── CRM: сотрудники, запросы врачей, поступления для сверки ──────────────
alter table admins drop constraint admins_role_check;
alter table admins add constraint admins_role_check check (role in ('admin', 'senior', 'doctor'));
alter table admins
  add column full_name text,
  add column resource_id bigint references resources (id) on delete set null,
  add constraint admins_doctor_resource check (role <> 'doctor' or resource_id is not null);

create table doctor_requests (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources (id) on delete cascade,
  day date not null,
  reason text not null,
  text text not null,
  created_by bigint references admins (id) on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create table bank_incoming (
  id bigint generated always as identity primary key,
  received_at timestamptz not null,
  amount_kopecks int not null check (amount_kopecks > 0),
  text text not null,
  source text not null check (source in ('sms', 'acquiring', 'email', 'manual')),
  matched_booking_id bigint references bookings (id) on delete set null,
  matched_at timestamptz,
  matched_by bigint references admins (id) on delete set null,
  created_at timestamptz not null default now()
);
create index bank_incoming_unmatched_idx on bank_incoming (received_at) where matched_booking_id is null;
