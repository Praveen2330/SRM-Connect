-- This script will add your specific user ID as a super_admin
-- We're using the exact user ID from your logs

-- First, make sure the admin_users table exists
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_sign_in TIMESTAMP WITH TIME ZONE
);

-- Now add your specific user ID as a super_admin
INSERT INTO admin_users (user_id, role, created_at)
VALUES 
-- This is your exact user ID from the logs
('e1f9caeb-ae74-41af-984a-b44230ac7491', 'super_admin', NOW())
ON CONFLICT (user_id) 
DO UPDATE SET role = 'super_admin';

-- Verify the admin was created
SELECT * FROM admin_users WHERE user_id = 'e1f9caeb-ae74-41af-984a-b44230ac7491';
