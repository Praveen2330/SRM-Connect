-- Create the recent_activities table
create table recent_activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null,
  activities jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index on user_id for faster lookups
create index recent_activities_user_id_idx on recent_activities(user_id);

-- Enable Row Level Security
alter table recent_activities enable row level security;

-- Create policy to allow users to see only their own activities
create policy "Users can only access their own activities"
  on recent_activities for all
  using (auth.uid() = user_id);

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