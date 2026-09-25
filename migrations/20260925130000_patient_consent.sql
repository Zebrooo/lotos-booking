-- Согласие взрослого пациента, записанного другим человеком (дизайн v2,
-- «Другой взрослый»): пациент даёт его сам по ссылке из СМС. Храним, какую
-- редакцию он принял и откуда — это доказательство согласия (152-ФЗ, ст. 9).
alter table bookings
  add column patient_consent_id bigint references consents (id) on delete restrict,
  add column patient_consent_ip inet,
  add column patient_consent_ua text;

