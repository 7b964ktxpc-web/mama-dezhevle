-- Runtime key-value settings (auto-detected channel id etc).

create table if not exists public.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
