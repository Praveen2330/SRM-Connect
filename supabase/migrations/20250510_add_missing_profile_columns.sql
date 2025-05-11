-- Add missing columns to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS gender_preference TEXT DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Add comment explaining the purpose of this migration
COMMENT ON TABLE public.profiles IS 'User profiles with additional fields for matching and preferences';
