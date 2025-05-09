create table match_queue (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  language text,
  age_range int4range,
  gender text,
  gender_preference text,
  entered_at timestamp with time zone default now(),
  is_online boolean default true,
  blocked_users text[] default '{}',
  reported_count integer default 0
);

alter table match_queue enable row level security;

create policy "Users can insert their own queue entry"
  on match_queue for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own queue entry"
  on match_queue for select
  using (auth.uid() = user_id);

create policy "Admins can view all queue entries"
  on match_queue for select
  using (
    exists (
      select 1 from auth.users 
      where id = auth.uid() 
      and role = 'admin'
    )
  );

create index match_queue_entered_at_idx on match_queue(entered_at);
create index match_queue_is_online_idx on match_queue(is_online);
