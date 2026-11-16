-- Migration 000: base schema as it stood before 001, for a fresh project (run 000-003 in order).
-- Every statement is a no-op when the object exists, so it never alters an existing database.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  xp           int not null default 0,
  level        int not null default 1,
  daily_streak int not null default 0,
  created_at   timestamptz not null default now() -- INFERRED
);

create table if not exists public.issues (
  id              uuid primary key default gen_random_uuid(), -- INFERRED type
  github_issue_id bigint not null unique, -- INFERRED bigint
  repo_name       text not null,
  title           text not null,
  body            text,
  url             text not null,
  language        text,
  score           int,
  summary         text,
  created_at      timestamptz not null default now() -- INFERRED
);

-- INFERRED: backs the board's order by score.
create index if not exists issues_score_idx on public.issues (score);
