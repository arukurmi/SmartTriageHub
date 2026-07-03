-- Migration 002: contribution history + daily streak support
-- Run this in the Supabase SQL editor (or via the CLI) BEFORE deploying the
-- polling-sync backend. It is idempotent and safe to re-run.

-- 1. One row per merged PR credited to a user. The unique key is the dedupe
--    boundary shared by the webhook path and the polling-sync path, so the
--    same PR can never be awarded twice no matter which path sees it first.
create table if not exists public.contributions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  repo_name    text not null,
  pr_number    int  not null,
  pr_title     text,
  pr_url       text,
  merged_at    timestamptz,
  xp_awarded   int not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, repo_name, pr_number)
);

create index if not exists contributions_user_idx
  on public.contributions (user_id);

-- Users may read their own contribution history from the frontend; all writes
-- go through the backend service role (which bypasses RLS).
alter table public.contributions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contributions'
      and policyname = 'contributions_select_own'
  ) then
    create policy contributions_select_own
      on public.contributions for select
      using (user_id = auth.uid());
  end if;
end $$;

-- 2. Track the last day a contribution was credited so streaks can be computed.
alter table public.profiles
  add column if not exists last_contribution_date date;

-- 3. Atomic XP + level + streak update. Supersedes increment_xp (kept in place
--    for safety) — same level formula: level = floor(xp / 100) + 1.
--    Streak rule, based on the merge date vs the last credited date:
--      same day        -> streak unchanged
--      consecutive day -> streak + 1
--      gap (or first)  -> streak resets to 1
--    Out-of-order backfills (merge date older than last credited) leave the
--    streak and last_contribution_date untouched.
create or replace function public.record_contribution(
  p_user_id uuid,
  p_xp_delta int,
  p_merged_date date
)
returns table (xp int, level int, daily_streak int)
language sql
as $$
  update public.profiles
     set xp    = coalesce(xp, 0) + p_xp_delta,
         level = floor((coalesce(xp, 0) + p_xp_delta) / 100.0) + 1,
         daily_streak = case
           when last_contribution_date is null then 1
           when p_merged_date = last_contribution_date then coalesce(daily_streak, 1)
           when p_merged_date = last_contribution_date + 1 then coalesce(daily_streak, 0) + 1
           when p_merged_date > last_contribution_date then 1
           else coalesce(daily_streak, 1) -- backfill of an older merge
         end,
         last_contribution_date = greatest(coalesce(last_contribution_date, p_merged_date), p_merged_date)
   where id = p_user_id
  returning xp, level, daily_streak;
$$;
