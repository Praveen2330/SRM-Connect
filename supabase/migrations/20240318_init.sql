-- Drop existing triggers first
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists handle_profiles_updated_at on profiles;
drop trigger if exists on_profile_updated on profiles;

-- Then drop existing functions
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_updated_at() cascade;

-- Create profiles table
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    display_name text unique,
    avatar_url text,
    is_new_user boolean default true,
    has_accepted_rules boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Public profiles are viewable by everyone" on profiles;
drop policy if exists "Users can insert their own profile" on profiles;
drop policy if exists "Users can update their own profile" on profiles;

-- Create profiles policies
create policy "Public profiles are viewable by everyone"
    on profiles for select
    using ( true );

create policy "Users can insert their own profile"
    on profiles for insert
    with check ( auth.uid() = id );

create policy "Users can update their own profile"
    on profiles for update
    using ( auth.uid() = id );

-- Create function to handle user creation
create function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, display_name, avatar_url, is_new_user)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url',
        true
    );
    return new;
end;
$$ language plpgsql security definer;

-- Create trigger for new user creation
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- Create function to update timestamps
create function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Create trigger for updating timestamps
create trigger handle_profiles_updated_at
    before update on profiles
    for each row execute procedure public.handle_updated_at(); 