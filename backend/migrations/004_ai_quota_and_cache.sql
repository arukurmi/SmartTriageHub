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
