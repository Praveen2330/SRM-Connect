-- Create admin_users table for storing admin user information
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  access_level TEXT NOT NULL DEFAULT 'standard' CHECK (access_level IN ('standard', 'super', 'owner')),
  is_active BOOLEAN DEFAULT TRUE
);

-- Enable Row Level Security
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Only admins can view the admin_users table
CREATE POLICY "Admins can view admin_users"
  ON admin_users
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Only super admins can insert new admins
CREATE POLICY "Super admins can insert admin_users"
  ON admin_users
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE access_level IN ('super', 'owner'))
  );

-- Only super admins can update admin users
CREATE POLICY "Super admins can update admin_users"
  ON admin_users
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE access_level IN ('super', 'owner'))
  );

-- Only owner can delete admin users
CREATE POLICY "Owner can delete admin_users"
  ON admin_users
  FOR DELETE
  USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE access_level = 'owner')
  );

-- Insert the default admin user with the ID from AuthContext.tsx
INSERT INTO admin_users (user_id, access_level, created_by)
VALUES ('e1f9caeb-ae74-41af-984a-b44230ac7491', 'owner', 'e1f9caeb-ae74-41af-984a-b44230ac7491')
ON CONFLICT (user_id) DO NOTHING;
