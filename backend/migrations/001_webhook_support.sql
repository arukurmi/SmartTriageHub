-- Migration 001: GitHub callback (webhook) support
-- Run this in the Supabase SQL editor (or via the CLI) before deploying the
-- updated webhook handler. It is idempotent and safe to re-run.

-- 1. Let a profile be linked to a GitHub account so PR-merge webhooks can find it.
alter table public.profiles
  add column if not exists github_username text;

-- 1b. Store the per-repo issue number so the webhook can match the linked issue
--     precisely (the existing github_issue_id is GitHub's global id, not the
--     "#123" number that appears in "Fixes #123").
alter table public.issues
  add column if not exists github_issue_number int;

create index if not exists issues_repo_number_idx
  on public.issues (repo_name, github_issue_number);

-- Case-insensitive uniqueness: GitHub usernames are case-insensitive, and two
-- profiles must never claim the same account.
create unique index if not exists profiles_github_username_unique
  on public.profiles (lower(github_username))
  where github_username is not null;

-- 2. Deduplicate webhook deliveries. GitHub retries on any non-2xx (and allows
--    manual redelivery), so we record each delivery id once and ignore repeats.
create table if not exists public.webhook_deliveries (
  delivery_id text primary key,
  event       text,
  received_at timestamptz not null default now()
);

-- 3. Award XP atomically so concurrent merges can't clobber each other's writes.
--    Mirrors the level rule used on the frontend: level = floor(xp / 100) + 1.
create or replace function public.increment_xp(p_user_id uuid, p_xp_delta int)
returns table (xp int, level int)
language sql
as $$
  update public.profiles
     set xp    = coalesce(xp, 0) + p_xp_delta,
         level = floor((coalesce(xp, 0) + p_xp_delta) / 100.0) + 1
   where id = p_user_id
  returning xp, level;
$$;
