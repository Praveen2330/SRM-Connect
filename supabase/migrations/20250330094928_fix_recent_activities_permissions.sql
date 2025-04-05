-- Drop existing policies if they exist
drop policy if exists "Users can manage their own activities" on recent_activities;

-- Recreate the table with proper structure if it doesn't exist
create table if not exists recent_activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  activities jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_activities unique (user_id)
);

-- Enable RLS
alter table recent_activities enable row level security;

-- Create index for faster lookups
create index if not exists recent_activities_user_id_idx on recent_activities(user_id);

-- Create policies with proper permissions
create policy "Users can view their own activities"
  on recent_activities
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own activities"
  on recent_activities
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own activities"
  on recent_activities
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grant necessary permissions
grant usage on schema public to authenticated;
grant all on recent_activities to authenticated;

-- Create or replace the function to handle updates
create or replace function handle_recent_activity()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger for updating timestamps
drop trigger if exists update_recent_activities_timestamp on recent_activities;
create trigger update_recent_activities_timestamp
  before update on recent_activities
  for each row
  execute function handle_recent_activity(); 