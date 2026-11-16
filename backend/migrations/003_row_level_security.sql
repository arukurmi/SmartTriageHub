-- Migration 003: row-level security and function grants. Run after 000-002; idempotent.
-- The backend's service-role key bypasses RLS, so only anon/authenticated clients are affected.

-- 1. Profiles: a signed-in user reads only their own row and can update none of its columns.
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Every column is server-managed today; a future user-editable column needs
-- an explicit `grant update (col) on public.profiles to authenticated`.
revoke update on public.profiles from anon, authenticated;
