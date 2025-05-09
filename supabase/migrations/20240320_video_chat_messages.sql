create type message_status as enum ('sent', 'delivered', 'read');

-- Video chat messages table
create table video_chat_messages (
  id uuid default gen_random_uuid() primary key,
  room_id text not null,
  sender_id uuid references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone default now(),
  status message_status default 'sent',
  message_type text default 'text',
  is_system_message boolean default false
);

-- Add RLS policies
alter table video_chat_messages enable row level security;

-- Allow users to insert their own messages
create policy "Users can insert their own messages"
  on video_chat_messages for insert
  with check (auth.uid() = sender_id);

-- Allow users to read messages in their rooms
create policy "Users can read messages in their rooms"
  on video_chat_messages for select
  using (auth.uid() in (
    select sender_id from video_chat_messages where room_id = video_chat_messages.room_id
  ));

-- Create index for faster queries
create index video_chat_messages_room_id_idx on video_chat_messages(room_id);
create index video_chat_messages_created_at_idx on video_chat_messages(created_at);