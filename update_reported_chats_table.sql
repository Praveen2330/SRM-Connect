-- Drop the existing reported_chats table if it exists
DROP TABLE IF EXISTS reported_chats;

-- Create reported_chats table with proper structure
CREATE TABLE reported_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id),
  reported_id UUID NOT NULL REFERENCES auth.users(id),
  chat_session_id TEXT NOT NULL,
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT NOT NULL,
  description TEXT,
  transcript JSONB NOT NULL, -- Store the full chat transcript as JSONB
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'ignored', 'warning_issued', 'user_banned')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  action_taken TEXT
);

-- Enable Row Level Security
ALTER TABLE reported_chats ENABLE ROW LEVEL SECURITY;

-- Only admins can view reported chats
CREATE POLICY "Admins can view reported chats"
  ON reported_chats
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Only admins can update reported chats
CREATE POLICY "Admins can update reported chats"
  ON reported_chats
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Users can insert their own reports
CREATE POLICY "Users can insert their own reports"
  ON reported_chats
  FOR INSERT
  WITH CHECK (
    auth.uid() = reporter_id
  );
