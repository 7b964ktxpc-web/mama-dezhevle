alter table public.telegram_price_alerts
  add constraint telegram_price_alerts_user_product_key unique (telegram_user_id, product_id);

alter table public.telegram_price_alerts
  rename column last_notified_price to notified_price;
