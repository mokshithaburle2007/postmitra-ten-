-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists applications (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists applications_updated_idx on applications (updated_at desc);

create table if not exists users (
  phone      text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists counters (
  year int primary key,
  n    int not null default 0
);

-- Atomic per-year counter used to make ids like PM-2026-0001
create or replace function next_seq(y int) returns int
language sql as $$
  insert into counters (year, n) values (y, 1)
  on conflict (year) do update set n = counters.n + 1
  returning n;
$$;

-- Lock everything down: only the server (service role key) can touch the data.
-- The public "anon" key gets no access at all.
alter table applications enable row level security;
alter table counters     enable row level security;
alter table users        enable row level security;
revoke all on applications, counters, users from anon, authenticated;
revoke execute on function next_seq(int) from public, anon, authenticated;
grant  execute on function next_seq(int) to service_role;
