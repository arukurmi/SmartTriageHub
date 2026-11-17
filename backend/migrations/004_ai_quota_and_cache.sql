-- Migration 004: per-user daily AI quota and cached AI results per issue. Run after 000-003; idempotent.
-- Both new tables have RLS on and no policies, so only the backend's service-role key can use them.

-- 1. issues.updated_at moves only when the title or body changes, so daily re-ingestion keeps the cache valid.
alter table public.issues
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_issue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists issues_touch_updated_at on public.issues;
create trigger issues_touch_updated_at
  before update on public.issues
  for each row
  when (old.title is distinct from new.title or old.body is distinct from new.body)
  execute function public.touch_issue_updated_at();

-- 2. AI calls per user per UTC day.
create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  calls      int  not null default 0,
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;

-- Counts one call and returns today's total, or NULL once p_daily_limit is reached.
-- A single statement, so concurrent requests cannot overshoot the limit.
create or replace function public.consume_ai_call(p_user_id uuid, p_daily_limit int)
returns int
language sql
as $$
  insert into public.ai_usage (user_id, usage_date, calls)
  values (p_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, usage_date) do update
    set calls = ai_usage.calls + 1
    where ai_usage.calls < p_daily_limit
  returning calls;
$$;

revoke execute on function public.consume_ai_call(uuid, int) from public, anon, authenticated;
grant execute on function public.consume_ai_call(uuid, int) to service_role;
