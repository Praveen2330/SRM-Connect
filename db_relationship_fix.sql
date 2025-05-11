-- Comprehensive fix for all database relationship issues in SRM Connect admin panel
-- This script addresses all the schema relationship errors shown in the admin dashboard

-- First drop the admin_users table if it exists - to rebuild it properly
DROP TABLE IF EXISTS admin_users CASCADE;

-- Now recreate the admin_users table with proper structure and references
CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  last_sign_in TIMESTAMP WITH TIME ZONE
);

-- Add the foreign key constraints explicitly 
ALTER TABLE admin_users 
  ADD CONSTRAINT fk_admin_users_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_admin_users_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure we have user_reports table with proper relationships
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id),
  
  reported_user_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id)
);

-- Ensure video_sessions table with proper relationships
CREATE TABLE IF NOT EXISTS video_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id UUID NOT NULL REFERENCES auth.users(id),
  user2_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  connection_quality TEXT,
  terminated_by UUID REFERENCES auth.users(id),
  termination_reason TEXT
);

-- Ensure system_settings table exists with proper structure
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  registration_enabled BOOLEAN DEFAULT TRUE,
  allowed_email_domains TEXT[] DEFAULT ARRAY['srmist.edu.in'],
  max_match_attempts_per_day INTEGER DEFAULT 10,
  required_approval_for_new_accounts BOOLEAN DEFAULT FALSE,
  maintenance_mode BOOLEAN DEFAULT FALSE,
  report_auto_suspend_threshold INTEGER DEFAULT 3,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT single_settings_row CHECK (id = 1)
);

-- Chat messages table with proper structure for monitoring
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  recipient_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT
);

-- Make sure we have a default system settings row
INSERT INTO system_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Add current user as an admin
INSERT INTO admin_users (user_id, role, created_at, last_sign_in)
VALUES 
  ('e1f9caeb-ae74-41af-984a-b44230ac7491', 'super_admin', NOW(), NOW())
ON CONFLICT (user_id) 
DO UPDATE SET 
  role = 'super_admin',
  last_sign_in = NOW();

-- Create views for statistics
-- User statistics view
DROP VIEW IF EXISTS user_statistics;
CREATE VIEW user_statistics AS
SELECT
  COUNT(*) AS total_users,
  COUNT(CASE WHEN u.created_at > NOW() - INTERVAL '1 day' THEN 1 END) AS new_users_today,
  COUNT(CASE WHEN u.created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS new_users_last_7_days,
  COUNT(CASE WHEN u.last_sign_in_at > NOW() - INTERVAL '7 days' THEN 1 END) AS active_users_last_7_days,
  COUNT(CASE WHEN p.gender = 'male' THEN 1 END) AS gender_male,
  COUNT(CASE WHEN p.gender = 'female' THEN 1 END) AS gender_female
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id;

-- Report statistics view
DROP VIEW IF EXISTS report_statistics;
CREATE VIEW report_statistics AS
SELECT
  COUNT(*) AS total_reports,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_reports,
  COUNT(CASE WHEN status = 'resolved' THEN 1 END) AS resolved_reports,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS reports_last_7_days
FROM user_reports;

-- Enable Row Level Security (RLS)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Add special RLS policies for your user ID to ensure permanent admin access
-- For admin_users table - avoid circular reference
DROP POLICY IF EXISTS "Special admin users access policy" ON admin_users;
CREATE POLICY "Special admin users access policy"
  ON admin_users
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491'
  );

-- Add a separate policy for existing super admins (this won't cause infinite recursion)
-- because it only applies to records OTHER than the user's own record
DROP POLICY IF EXISTS "Super admins manage other admins" ON admin_users;
CREATE POLICY "Super admins manage other admins"
  ON admin_users
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin' AND user_id != auth.uid())
  );

-- For user_reports table
DROP POLICY IF EXISTS "Admins can access all reports" ON user_reports;
CREATE POLICY "Admins can access all reports"
  ON user_reports
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' OR
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- For video_sessions table
DROP POLICY IF EXISTS "Admins can access all video sessions" ON video_sessions;
CREATE POLICY "Admins can access all video sessions"
  ON video_sessions
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' OR
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- For system_settings table
DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;
CREATE POLICY "Admins can manage system settings"
  ON system_settings
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' OR
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- For chat_messages table
DROP POLICY IF EXISTS "Admins can monitor all chats" ON chat_messages;
CREATE POLICY "Admins can monitor all chats"
  ON chat_messages
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' OR
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Create a special admin access check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Special case for your user ID
  IF auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' THEN
    RETURN TRUE;
  END IF;
  
  -- Regular check in admin_users table
  RETURN EXISTS (
    SELECT 1 FROM admin_users 
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to explain the purpose of this script
COMMENT ON TABLE admin_users IS 'Admin users with special permissions for SRM Connect platform management';
COMMENT ON TABLE user_reports IS 'Reports filed by users against other users for moderation purposes';
COMMENT ON TABLE video_sessions IS 'Records of video chat sessions between users';
COMMENT ON TABLE chat_messages IS 'Chat messages exchanged between users';
