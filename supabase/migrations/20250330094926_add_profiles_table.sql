-- First, check if the table exists and if not, create it
create table if not exists public.profiles (
  id uuid primary key,
  display_name text unique not null,
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
declare
  base_display_name text;
  counter integer := 0;
  new_display_name text;
begin
  -- Get base display name from metadata or email
  base_display_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  
  -- Try to insert with original name first
  begin
    insert into public.profiles (id, display_name)
    values (new.id, base_display_name);
    return new;
  exception when unique_violation then
    -- If original name is taken, try with incrementing numbers
    loop
      counter := counter + 1;
      new_display_name := base_display_name || counter::text;
      begin
        insert into public.profiles (id, display_name)
        values (new.id, new_display_name);
        return new;
      exception when unique_violation then
        continue;
      end;
      exit when counter > 100; -- Prevent infinite loop
    end loop;
    
    -- If we get here, something went wrong
    raise exception 'Could not generate unique display name after 100 attempts';
  end;
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