alter table service_price_links add column markup_bp int default 0;
alter table service_price_links add constraint service_price_links_markup_check check (markup_bp is null or markup_bp between 0 and 100000);
