-- Drop existing objects if they exist
drop policy if exists "Users can manage their own activities" on recent_activities;
drop trigger if exists update_recent_activities_updated_at on recent_activities;
drop function if exists update_updated_at_column();

-- Create the recent_activities table if it doesn't exist
create table if not exists recent_activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  activities jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index on user_id for faster lookups
create index if not exists recent_activities_user_id_idx on recent_activities(user_id);

-- Enable Row Level Security
alter table recent_activities enable row level security;

-- Create policies for the recent_activities table
create policy "Users can manage their own activities"
  on recent_activities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create trigger to update updated_at timestamp
create trigger update_recent_activities_updated_at
  before update on recent_activities
  for each row
  execute function update_updated_at_column();

-- Grant necessary permissions
grant usage on schema public to authenticated;
grant all on recent_activities to authenticated;
grant usage, select on sequence recent_activities_id_seq to authenticated; 