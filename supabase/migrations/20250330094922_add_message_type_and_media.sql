/*
  # Add message type and media URL support

  1. Changes
    - Add type column for different message types (text, voice, photo)
    - Add media_url column for voice notes and photos
    - Add receiver_id column for direct messaging
*/

-- Add new columns to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('text', 'voice', 'photo')) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS media_url text,
ADD COLUMN IF NOT EXISTS receiver_id uuid REFERENCES profiles(id),
DROP COLUMN IF EXISTS match_id; -- Remove match_id as we're using direct messaging 