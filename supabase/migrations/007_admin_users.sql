-- Admin accounts for the web admin panel. Passwords are scrypt hashes with
-- per-user random salts (never plain text). Seeded from ADMIN_USER /
-- ADMIN_PASSWORD env on first login if the table is empty.

create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  salt          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
