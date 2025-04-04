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

-- Drop existing policies
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Enable insert for authenticated users only" on public.profiles;

-- Enable RLS
alter table public.profiles enable row level security;

-- Create policies with better permissions
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Enable insert for authenticated users only"
  on public.profiles for insert
  with check (auth.role() = 'authenticated');

create policy "Enable update for users based on id"
  on public.profiles for update
  using (auth.uid() = id);

-- Function to handle profile updates
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger for updating timestamps
drop trigger if exists on_profile_updated on public.profiles;
create trigger on_profile_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Function to handle new user creation
create or replace function public.handle_new_user()
returns trigger
security definer
language plpgsql
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do update
  set display_name = EXCLUDED.display_name;
  return new;
end;
$$;

-- Trigger for new user creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on public.profiles to anon, authenticated; 