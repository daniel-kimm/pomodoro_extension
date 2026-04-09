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

-- 3. Index for fast leaderboard / friend lookups
create index idx_friendships_requester on public.friendships (requester_id);
create index idx_friendships_addressee on public.friendships (addressee_id);
create index idx_friendships_status    on public.friendships (status);
create index idx_profiles_username     on public.profiles (username);
