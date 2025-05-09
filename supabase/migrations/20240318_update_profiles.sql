-- Drop existing objects first
drop table if exists public.profiles cascade;
drop function if exists public.handle_updated_at() cascade;
drop function if exists public.handle_new_user() cascade;
drop trigger if exists on_auth_user_created on auth.users;

-- Create the profiles table with the correct schema
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  bio text,
  interests text[],
  avatar_url text,
  is_new_user boolean default true,
  has_accepted_rules boolean default false,
  is_online boolean default false,
  last_seen timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Create policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Create function to handle profile updates
create function public.handle_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Create trigger for updating timestamps
create trigger on_profile_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Create function to handle new user creation
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  display_name_val text;
begin
  display_name_val := split_part(NEW.email, '@', 1);
  
  insert into public.profiles (id, display_name, is_new_user, has_accepted_rules)
  values (
    NEW.id,
    display_name_val,
    true,
    false
  );
  
  return NEW;
exception
  when others then
    raise notice 'Error in handle_new_user: %', SQLERRM;
    return NEW;
end;
$$;

-- Create trigger for new user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on public.profiles to anon, authenticated; 