create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  rubric text not null,
  topic text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  fingerprint text not null,
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists content_posts_fingerprint_idx on public.content_posts (fingerprint);
create index if not exists content_posts_status_created_idx on public.content_posts (status, created_at desc);

create table if not exists public.content_bot_updates (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);

create index if not exists content_bot_updates_created_idx on public.content_bot_updates (created_at desc);

alter table public.content_posts enable row level security;
alter table public.content_bot_updates enable row level security;

create or replace function public.touch_content_post_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_posts_touch_updated_at on public.content_posts;
create trigger content_posts_touch_updated_at
before update on public.content_posts
for each row execute function public.touch_content_post_updated_at();
