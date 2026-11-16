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

-- INFERRED: nothing in the app inserts profiles, so a signup trigger must create them.
do $do$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'
  ) then
    execute $fn$
      create function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        insert into public.profiles (id) values (new.id) on conflict do nothing;
        return new;
      end;
      $body$
    $fn$;
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $do$;
