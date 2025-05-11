-- This script creates a permanent solution for admin access
-- It specifically targets your user ID to ensure you have proper admin access

-- First, make sure the admin_users table exists
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_sign_in TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security on the admin_users table
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Create a special access policy for your user ID
-- This ensures you can always access the admin_users table even if other policies fail
DROP POLICY IF EXISTS "Special direct access policy" ON admin_users;
CREATE POLICY "Special direct access policy"
  ON admin_users
  FOR ALL
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' OR 
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- Ensure you're in the admin_users table as a super_admin
INSERT INTO admin_users (user_id, role, created_at, last_sign_in)
VALUES 
  ('e1f9caeb-ae74-41af-984a-b44230ac7491', 'super_admin', NOW(), NOW())
ON CONFLICT (user_id) 
DO UPDATE SET 
  role = 'super_admin',
  last_sign_in = NOW();

-- Create policies for other admin-related tables

-- For video_sessions
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

ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Direct admin video sessions access" ON video_sessions;
CREATE POLICY "Direct admin video sessions access"
  ON video_sessions
  FOR ALL
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' OR
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- For system_settings
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

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Direct admin system settings access" ON system_settings;
CREATE POLICY "Direct admin system settings access"
  ON system_settings
  FOR ALL
  USING (
    auth.uid() = 'e1f9caeb-ae74-41af-984a-b44230ac7491' OR
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- For statistics views
-- Drop and recreate user statistics view to avoid column naming issues
DROP VIEW IF EXISTS user_statistics;

CREATE VIEW user_statistics AS
SELECT
  COUNT(*) AS total_users,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 day' THEN 1 END) AS new_users_today,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) AS new_users_last_7_days,
  COUNT(CASE WHEN last_sign_in_at > NOW() - INTERVAL '7 days' THEN 1 END) AS active_users_last_7_days,
  0 AS gender_male,
  0 AS gender_female
FROM auth.users;

-- Drop and recreate report statistics view
DROP VIEW IF EXISTS report_statistics;

CREATE VIEW report_statistics AS
SELECT
  0 AS total_reports,
  0 AS pending_reports,
  0 AS resolved_reports,
  0 AS reports_last_7_days;

-- Make sure you have a default system settings row
INSERT INTO system_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Create a special function to check admin status for your specific user
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Special case for your user ID
  IF user_id = 'e1f9caeb-ae74-41af-984a-b44230ac7491' THEN
    RETURN TRUE;
  END IF;
  
  -- Regular check in admin_users table
  RETURN EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.user_id = $1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
