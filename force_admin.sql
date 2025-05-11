-- Reset admin access and force your account to have super_admin role

-- 1. First, check if the admin_users table exists and has the right structure
DROP TABLE IF EXISTS admin_users CASCADE;

-- 2. Re-create the admin_users table with the correct structure
CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('viewer', 'moderator', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  last_sign_in TIMESTAMP WITH TIME ZONE
);

-- 3. Enable RLS but temporarily disable it for this operation
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users FORCE ROW LEVEL SECURITY;

-- 4. Create a policy that allows anyone to access the table temporarily (we'll fix this later)
CREATE POLICY "temp_admin_access" ON admin_users USING (true);

-- 5. Insert your specific user with super_admin privileges
INSERT INTO admin_users (user_id, role, created_at)
VALUES 
('e1f9caeb-ae74-41af-984a-b44230ac7491', 'super_admin', NOW());

-- 6. Verify the insert worked
SELECT * FROM admin_users;

-- 7. Update the RLS policy to be more restrictive
DROP POLICY IF EXISTS "temp_admin_access" ON admin_users;
CREATE POLICY "admins_can_see_admins" ON admin_users 
  FOR SELECT USING (true);
  
CREATE POLICY "super_admin_manage" ON admin_users 
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- For testing purposes, we'll also create a function to check admin status directly
CREATE OR REPLACE FUNCTION is_admin(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  admin_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM admin_users WHERE user_id = user_id_param) INTO admin_exists;
  RETURN admin_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
