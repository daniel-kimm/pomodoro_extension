-- ============================================================
-- Pomodoro Study Extension — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Profiles (extends auth.users)
create table public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  total_study_seconds bigint not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Anyone can view profiles"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. Friendships
create table public.friendships (
  id            uuid default gen_random_uuid() primary key,
  requester_id  uuid references public.profiles(id) on delete cascade not null,
  addressee_id  uuid references public.profiles(id) on delete cascade not null,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "Users can view their own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "Addressee can update friendship status"
  on public.friendships for update
  using (auth.uid() = addressee_id);

create policy "Either party can remove a friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- 3. Study sessions for group study
create table public.study_sessions (
  id                uuid default gen_random_uuid() primary key,
  owner_id          uuid references public.profiles(id) on delete cascade not null,
  task              text not null,
  duration_seconds  int not null,
  started_at        timestamptz not null default now(),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.study_sessions enable row level security;

create policy "Owners and members can view sessions"
  on public.study_sessions for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.study_session_members m
      where m.session_id = public.study_sessions.id
        and m.profile_id = auth.uid()
        and m.left_at is null
    )
  );

create policy "Owners can insert sessions"
  on public.study_sessions for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update sessions"
  on public.study_sessions for update
  using (auth.uid() = owner_id);

create table public.study_session_members (
  id          uuid default gen_random_uuid() primary key,
  session_id  uuid references public.study_sessions(id) on delete cascade not null,
  profile_id  uuid references public.profiles(id) on delete cascade not null,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz
);

alter table public.study_session_members enable row level security;

create policy "Members can view a session membership"
  on public.study_session_members for select
  using (
    auth.uid() = profile_id
    or exists (
      select 1 from public.study_sessions s
      where s.id = session_id and s.owner_id = auth.uid()
    )
  );

create policy "Members can insert themselves or owners can add members"
  on public.study_session_members for insert
  with check (
    auth.uid() = profile_id
    or exists (
      select 1 from public.study_sessions s
      where s.id = session_id and s.owner_id = auth.uid()
    )
  );

create policy "Members can leave their own study session"
  on public.study_session_members for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create index idx_study_sessions_owner on public.study_sessions (owner_id);
create index idx_study_session_members_session on public.study_session_members (session_id);
create index idx_study_session_members_profile on public.study_session_members (profile_id);

-- 4. Index for fast leaderboard / friend lookups
create index idx_friendships_requester on public.friendships (requester_id);
create index idx_friendships_addressee on public.friendships (addressee_id);
create index idx_friendships_status    on public.friendships (status);
create index idx_profiles_username     on public.profiles (username);
