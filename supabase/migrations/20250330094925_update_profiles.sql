/*
  # Update profiles table with online status and display name

  1. Changes
    - Add display_name column for user's display name
    - Add is_online column for tracking user's online status
    - Add last_seen column for tracking user's last activity
*/

-- Add display_name column if it doesn't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS display_name text;

-- Add online status columns
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();

-- Create function to update last_seen
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS trigger AS $$
BEGIN
  NEW.last_seen = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update last_seen
DROP TRIGGER IF EXISTS update_last_seen_trigger ON profiles;
CREATE TRIGGER update_last_seen_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_last_seen();

-- Update existing profiles to have a display name
UPDATE profiles
SET display_name = COALESCE(display_name, 'Anonymous User')
WHERE display_name IS NULL; 