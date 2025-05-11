-- Create reported_chats table for storing reported chat sessions
CREATE TABLE IF NOT EXISTS reported_chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id),
  reported_id UUID NOT NULL REFERENCES auth.users(id),
  chat_session_id TEXT NOT NULL,
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reason TEXT NOT NULL,
  description TEXT,
  transcript JSONB NOT NULL, -- Store the full chat transcript
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'ignored', 'warning_issued', 'user_banned')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  action_taken TEXT
);

-- Create table to track user report limits
CREATE TABLE IF NOT EXISTS user_report_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  reports_today INTEGER DEFAULT 0,
  last_report_date DATE DEFAULT CURRENT_DATE,
  false_report_count INTEGER DEFAULT 0,
  is_flagged BOOLEAN DEFAULT FALSE
);

-- Create table for instant chat analytics
CREATE TABLE IF NOT EXISTS instant_chat_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE DEFAULT CURRENT_DATE,
  active_users INTEGER DEFAULT 0,
  total_chats INTEGER DEFAULT 0,
  total_reports INTEGER DEFAULT 0,
  avg_chat_duration FLOAT DEFAULT 0,
  most_reported_user UUID REFERENCES auth.users(id),
  most_reported_count INTEGER DEFAULT 0
);

-- Create table for connections (when both users press 👍)
CREATE TABLE IF NOT EXISTS chat_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES auth.users(id),
  user2_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

-- Function to reset daily report counts
CREATE OR REPLACE FUNCTION reset_daily_report_counts()
RETURNS VOID AS $$
BEGIN
  UPDATE user_report_limits
  SET reports_today = 0, last_report_date = CURRENT_DATE
  WHERE last_report_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically reset report counts at midnight
CREATE OR REPLACE FUNCTION check_report_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_report_date < CURRENT_DATE THEN
    NEW.reports_today := 0;
    NEW.last_report_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_report_limits_trigger
BEFORE UPDATE ON user_report_limits
FOR EACH ROW
EXECUTE FUNCTION check_report_date();

-- Function to check if a user has exceeded their daily report limit
CREATE OR REPLACE FUNCTION can_user_report(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  report_limit INTEGER;
  current_count INTEGER;
BEGIN
  -- Get the system-wide report limit
  SELECT max_reports_allowed_per_day INTO report_limit FROM system_settings LIMIT 1;
  
  -- If no setting exists, default to 3
  IF report_limit IS NULL THEN
    report_limit := 3;
  END IF;
  
  -- Check if user exists in the limits table
  SELECT reports_today INTO current_count FROM user_report_limits WHERE user_report_limits.user_id = $1;
  
  -- If user doesn't exist in the table, they can report
  IF current_count IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if they've exceeded their limit
  RETURN current_count < report_limit;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security policies
ALTER TABLE reported_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_report_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE instant_chat_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_connections ENABLE ROW LEVEL SECURITY;

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

-- Only admins can view report limits
CREATE POLICY "Admins can view report limits"
  ON user_report_limits
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Users can view their own report limits
CREATE POLICY "Users can view their own report limits"
  ON user_report_limits
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- Only the system can update report limits
CREATE POLICY "System can update report limits"
  ON user_report_limits
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Only admins can view analytics
CREATE POLICY "Admins can view analytics"
  ON instant_chat_analytics
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Users can view their own connections
CREATE POLICY "Users can view their own connections"
  ON chat_connections
  FOR SELECT
  USING (
    auth.uid() = user1_id OR auth.uid() = user2_id
  );

-- Users can create their own connections
CREATE POLICY "Users can create their own connections"
  ON chat_connections
  FOR INSERT
  WITH CHECK (
    auth.uid() = user1_id OR auth.uid() = user2_id
  );
