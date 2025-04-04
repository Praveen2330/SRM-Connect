/*
  # Add message type and media URL support

  1. Changes
    - Add type column to messages table for different message types (text, voice, photo)
    - Add media_url column for voice notes and photos
*/

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('text', 'voice', 'photo')) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS media_url text; 