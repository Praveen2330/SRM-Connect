-- Create admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_sign_in TIMESTAMP WITH TIME ZONE
);

-- Create video session logs table
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

-- Create system settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  allow_new_registrations BOOLEAN DEFAULT TRUE,
  allowed_email_domains TEXT[] DEFAULT ARRAY['srmist.edu.in'],
  max_reports_before_auto_suspend INTEGER DEFAULT 5,
  max_reports_allowed_per_day INTEGER DEFAULT 3,
  maintenance_mode BOOLEAN DEFAULT FALSE,
  maintenance_message TEXT DEFAULT 'SRM Connect is currently under maintenance. Please check back later.',
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Create system announcements table
CREATE TABLE IF NOT EXISTS system_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  target_users TEXT DEFAULT 'all', -- 'all', 'male', 'female'
  is_active BOOLEAN DEFAULT TRUE
);

-- Create a view for user statistics
CREATE OR REPLACE VIEW user_statistics AS
SELECT
  COUNT(*) AS total_users,
  COUNT(CASE WHEN raw_user_meta_data->>'gender' = 'male' THEN 1 END) AS male_users,
  COUNT(CASE WHEN raw_user_meta_data->>'gender' = 'female' THEN 1 END) AS female_users,
  COUNT(CASE WHEN confirmed_at > NOW() - INTERVAL '7 days' THEN 1 END) AS new_users_last_7_days,
  COUNT(CASE WHEN last_sign_in_at > NOW() - INTERVAL '7 days' THEN 1 END) AS active_users_last_7_days
FROM auth.users;

-- Create a view for report statistics
CREATE OR REPLACE VIEW report_statistics AS
SELECT
  COUNT(*) AS total_reports,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_reports,
  COUNT(CASE WHEN status = 'resolved' THEN 1 END) AS resolved_reports,
  COUNT(CASE WHEN reported_at > NOW() - INTERVAL '7 days' THEN 1 END) AS reports_last_7_days
FROM user_reports;

-- Row Level Security policies
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_announcements ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage other admins
CREATE POLICY "Super admins can manage admin_users"
  ON admin_users
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- Only admins can view video sessions
CREATE POLICY "Admins can view video sessions"
  ON video_sessions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Only super_admins can modify system settings
CREATE POLICY "Super admins can manage system settings"
  ON system_settings
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- All admins can view system settings
CREATE POLICY "Admins can view system settings"
  ON system_settings
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Moderators and super_admins can manage announcements
CREATE POLICY "Admins can manage announcements"
  ON system_announcements
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role IN ('moderator', 'super_admin'))
  );

-- Insert default system settings
INSERT INTO system_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
