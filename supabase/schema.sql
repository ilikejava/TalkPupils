-- TalkPupils website v30 — Supabase schema
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Run it once. It is safe to run again (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- No service_role key is needed anywhere in the website.
-- v16 fix: the v1 file created the tables and the RLS policies but never
-- granted the signed-in role any privileges on the tables, so every
-- signed-in query failed with "permission denied for table ...".
-- The GRANT block below fixes that. If you already ran v1, just run
-- this whole file again — it only adds the missing grants.
-- v30: new `leaderboard` table — one row per pupil (registered name +
-- total points). Every signed-in pupil can READ all rows (that is the
-- point of the board); each pupil can only WRITE their own row.

-- ============ tables ============

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  level text not null default 'P5',
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mastery (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_type text not null,          -- 'words' | 'passages' | 'oral'
  item_key text not null,           -- word, passage id, or oral topic id
  streak integer not null default 0,
  tested integer not null default 0,
  last_tested text,
  next_due text,
  primary key (profile_id, item_type, item_key)
);

create table if not exists public.custom_vocab (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  word text not null,
  meaning text not null,
  unit text not null default 'my', -- '1'..'9' or 'my'
  category text not null default 'words & phrases',
  created_at timestamptz not null default now()
);

create table if not exists public.custom_passages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_topics (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  image text not null default '',      -- public URL of the picture in storage
  image_file text not null default '', -- same URL (kept for compatibility)
  linked_topic_id text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  parent_id uuid primary key references auth.users (id) on delete cascade,
  marking_requirements text,
  oral_prep_seconds integer not null default 120,
  oral_save_audio boolean not null default true,
  ai_provider text not null default 'openai',
  ai_model text not null default '',
  ai_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Leaderboard (v30): one row per pupil, keyed by the pupil's account.
-- name is the registered pupil name; points is the same total the
-- top-right label shows. Read by every signed-in pupil; written
-- only by the pupil the row belongs to.
create table if not exists public.leaderboard (
  parent_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  level text not null default 'P6',
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ============ row level security ============
-- Every row belongs to the signed-in pupil. A pupil can only see and
-- change their own profile, sessions and content.

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.mastery enable row level security;
alter table public.custom_vocab enable row level security;
alter table public.custom_passages enable row level security;
alter table public.custom_topics enable row level security;
alter table public.settings enable row level security;
alter table public.leaderboard enable row level security;

drop policy if exists "Parents manage their own profiles" on public.profiles;
create policy "Parents manage their own profiles" on public.profiles
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- ============ grants (v16 fix) ============
-- Postgres checks table privileges BEFORE row level security. Without
-- these grants, a signed-in pupil gets "permission denied for table ..."
-- on every query, even though the RLS policy above would allow the row.
-- Only the signed-in role gets access; the anon role gets nothing
-- (guest trials never touch Supabase at all).
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.mastery to authenticated;
grant select, insert, update, delete on public.custom_vocab to authenticated;
grant select, insert, update, delete on public.custom_passages to authenticated;
grant select, insert, update, delete on public.custom_topics to authenticated;
grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.leaderboard to authenticated;

drop policy if exists "Parents manage sessions of their profiles" on public.sessions;
create policy "Parents manage sessions of their profiles" on public.sessions
  for all using (exists (
    select 1 from public.profiles p
    where p.id = sessions.profile_id and p.parent_id = auth.uid()))
  with check (exists (
    select 1 from public.profiles p
    where p.id = sessions.profile_id and p.parent_id = auth.uid()));

drop policy if exists "Parents manage mastery of their profiles" on public.mastery;
create policy "Parents manage mastery of their profiles" on public.mastery
  for all using (exists (
    select 1 from public.profiles p
    where p.id = mastery.profile_id and p.parent_id = auth.uid()))
  with check (exists (
    select 1 from public.profiles p
    where p.id = mastery.profile_id and p.parent_id = auth.uid()));

drop policy if exists "Parents manage their own custom vocab" on public.custom_vocab;
create policy "Parents manage their own custom vocab" on public.custom_vocab
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

drop policy if exists "Parents manage their own custom passages" on public.custom_passages;
create policy "Parents manage their own custom passages" on public.custom_passages
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

drop policy if exists "Parents manage their own custom topics" on public.custom_topics;
create policy "Parents manage their own custom topics" on public.custom_topics
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

drop policy if exists "Parents manage their own settings" on public.settings;
create policy "Parents manage their own settings" on public.settings
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- Leaderboard (v30): every signed-in pupil reads the whole board;
-- each pupil writes only the row with their own account id.
drop policy if exists "Anyone signed in reads the leaderboard" on public.leaderboard;
create policy "Anyone signed in reads the leaderboard" on public.leaderboard
  for select to authenticated using (true);

drop policy if exists "Pupils write their own leaderboard row" on public.leaderboard;
create policy "Pupils write their own leaderboard row" on public.leaderboard
  for all to authenticated using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- ============ storage buckets ============
-- 'audio' holds Oral Partner answer recordings, 'stimuli' holds
-- pupil-uploaded picture topics. Both are public for reading (the URLs
-- are long and unguessable); only the signed-in pupil can upload or
-- delete inside their own folder (<pupil-uuid>/...).

insert into storage.buckets (id, name, public)
values ('audio', 'audio', true), ('stimuli', 'stimuli', true)
on conflict (id) do nothing;

drop policy if exists "Parents upload their own audio" on storage.objects;
create policy "Parents upload their own audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Anyone reads audio" on storage.objects;
create policy "Anyone reads audio" on storage.objects
  for select using (bucket_id = 'audio');

drop policy if exists "Parents delete their own audio" on storage.objects;
create policy "Parents delete their own audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Parents upload their own stimuli" on storage.objects;
create policy "Parents upload their own stimuli" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stimuli'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Anyone reads stimuli" on storage.objects;
create policy "Anyone reads stimuli" on storage.objects
  for select using (bucket_id = 'stimuli');

drop policy if exists "Parents delete their own stimuli" on storage.objects;
create policy "Parents delete their own stimuli" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stimuli'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- NOTE: answer recordings older than 7 days are deleted by the website
-- itself when the pupil signs in (see cleanupOldAudio in docs/app.js).
-- No pg_cron job is set up in v1.
