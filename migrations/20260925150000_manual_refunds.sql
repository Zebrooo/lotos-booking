-- Возврат аванса, внесённого не через интернет-эквайринг: наличными в кассе
-- или переводом (СБП, перевод на счёт, сверенный вручную). Провайдер такой
-- возврат не исполнит — его выдаёт регистратура и отмечает в CRM.
alter table refunds alter column payment_id drop not null;
alter table refunds add column method text not null default 'provider' check (method in ('provider', 'cash', 'bank'));
alter table refunds add constraint refunds_provider_payment check (method <> 'provider' or payment_id is not null);
alter table refunds add column done_by bigint references admins (id) on delete set null;
