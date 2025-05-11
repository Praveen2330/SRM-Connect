-- Create a table to store recent video chat connections
CREATE TABLE IF NOT EXISTS video_chat_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  partner_id UUID REFERENCES auth.users(id) NOT NULL,
  partner_display_name TEXT,
  partner_avatar_url TEXT,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  UNIQUE(user_id, partner_id, connected_at)
);

-- Create an index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS video_chat_connections_user_id_idx ON video_chat_connections(user_id);
CREATE INDEX IF NOT EXISTS video_chat_connections_connected_at_idx ON video_chat_connections(connected_at);

-- Enable Row Level Security
ALTER TABLE video_chat_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for the video_chat_connections table
CREATE POLICY "Users can view their own connections"
  ON video_chat_connections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connections"
  ON video_chat_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Grant necessary permissions
GRANT SELECT, INSERT ON video_chat_connections TO authenticated;
