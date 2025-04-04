/*
  # Add message deletion support

  1. Changes
    - Add deleted_by_sender column to track if sender deleted the message
    - Add deleted_by_receiver column to track if receiver deleted the message
    - Add auto_delete_after_read column to control if message should be deleted after reading
*/

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS deleted_by_sender boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_by_receiver boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_delete_after_read boolean DEFAULT false; 