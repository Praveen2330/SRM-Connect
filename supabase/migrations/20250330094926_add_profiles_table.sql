-- First, check if the table exists and if not, create it
create table if not exists public.profiles (
  id uuid primary key,
  display_name text,
  bio text,
  interests text[],
  avatar_url text,
  is_online boolean default false,
  last_seen timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  constraint fk_user
    foreign key (id)
    references auth.users (id)
    on delete cascade
);

-- Drop existing policies and triggers first
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Enable insert for authenticated users only" on public.profiles;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_profile_updated on public.profiles;
drop function if exists public.handle_new_user();
drop function if exists public.handle_updated_at();

-- Enable RLS
alter table public.profiles enable row level security;

-- Create policies with better permissions
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Function to handle profile updates
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger for updating timestamps
create trigger on_profile_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  display_name_val text;
begin
  -- Get display name from email (everything before @)
  display_name_val := split_part(NEW.email, '@', 1);
  
  -- Insert the new profile
  insert into public.profiles (id, display_name, created_at, updated_at)
  values (
    NEW.id,
    display_name_val,
    now(),
    now()
  )
  on conflict (id) do update
  set display_name = EXCLUDED.display_name;
  
  return NEW;
exception
  when others then
    -- Log the error details
    raise notice 'Error in handle_new_user: %', SQLERRM;
    return NEW;
end;
$$;

-- Trigger for new user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on public.profiles to anon, authenticated;

-- Ensure the sequence exists and grant permissions if needed
do $$
begin
  if exists (
    select from information_schema.sequences
    where sequence_schema = 'public'
    and sequence_name = 'profiles_id_seq'
  ) then
    grant usage, select on sequence public.profiles_id_seq to anon, authenticated;
  end if;
end $$; 