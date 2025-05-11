-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_sign_in TIMESTAMP WITH TIME ZONE
);

-- Create video_sessions table
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

-- Create system_settings table
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

-- Create system_announcements table
CREATE TABLE IF NOT EXISTS system_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  target_group TEXT CHECK (target_group IN ('all', 'new_users', 'admins'))
);

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

-- Drop any existing report statistics view first
DROP VIEW IF EXISTS report_statistics;

-- Create report statistics view (safe version that checks if user_reports exists)
DO $$
BEGIN
  -- Check if user_reports table exists
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_reports') THEN
    -- Create a view for report statistics
    EXECUTE 'CREATE VIEW report_statistics AS
    SELECT
      COUNT(*) AS total_reports,
      COUNT(CASE WHEN status = ''pending'' THEN 1 END) AS pending_reports,
      COUNT(CASE WHEN status = ''resolved'' THEN 1 END) AS resolved_reports,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL ''7 days'' THEN 1 END) AS reports_last_7_days
    FROM user_reports;';
  ELSE
    -- Create an empty statistics view
    EXECUTE 'CREATE VIEW report_statistics AS
    SELECT
      0 AS total_reports,
      0 AS pending_reports,
      0 AS resolved_reports,
      0 AS reports_last_7_days;';
  END IF;
END$$;

-- Enable Row Level Security
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_announcements ENABLE ROW LEVEL SECURITY;

-- Set up RLS policies for admin_users
DROP POLICY IF EXISTS "Super admins can manage admin_users" ON admin_users;
CREATE POLICY "Super admins can manage admin_users"
  ON admin_users
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- Set up RLS policies for video_sessions
DROP POLICY IF EXISTS "Admins can view video sessions" ON video_sessions;
CREATE POLICY "Admins can view video sessions"
  ON video_sessions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Set up RLS policies for system_settings
DROP POLICY IF EXISTS "Super admins can manage system settings" ON system_settings;
CREATE POLICY "Super admins can manage system settings"
  ON system_settings
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

DROP POLICY IF EXISTS "Admins can view system settings" ON system_settings;
CREATE POLICY "Admins can view system settings"
  ON system_settings
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Set up RLS policies for system_announcements
DROP POLICY IF EXISTS "Admins can manage announcements" ON system_announcements;
CREATE POLICY "Admins can manage announcements"
  ON system_announcements
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role IN ('moderator', 'super_admin'))
  );

-- Insert default system settings
INSERT INTO system_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Add current user as an admin (this will add the first user found in auth.users)
DO $$
DECLARE
  user_id_var UUID;
BEGIN
  -- Get the first user from auth.users
  SELECT id INTO user_id_var FROM auth.users LIMIT 1;
  
  -- If we found a user, make them a super_admin
  IF user_id_var IS NOT NULL THEN
    INSERT INTO admin_users (user_id, role, created_at)
    VALUES (user_id_var, 'super_admin', NOW())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END$$;
