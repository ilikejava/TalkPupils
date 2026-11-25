-- TalkPupils website v1 — Supabase schema
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Run it once. It is safe to run again (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- No service_role key is needed anywhere in the website.

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

-- ============ row level security ============
-- Every row belongs to the signed-in parent. A parent can only see and
-- change their own pupils, sessions and content.

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.mastery enable row level security;
alter table public.custom_vocab enable row level security;
alter table public.custom_passages enable row level security;
alter table public.custom_topics enable row level security;
alter table public.settings enable row level security;

drop policy if exists "Parents manage their own profiles" on public.profiles;
create policy "Parents manage their own profiles" on public.profiles
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

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

-- ============ storage buckets ============
-- 'audio' holds Oral Partner answer recordings, 'stimuli' holds
-- parent-uploaded picture topics. Both are public for reading (the URLs
-- are long and unguessable); only the signed-in parent can upload or
-- delete inside their own folder (<parent-uuid>/...).

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
-- itself when the parent signs in (see cleanupOldAudio in docs/app.js).
-- No pg_cron job is set up in v1.
