/*
  # Add signal data column to video sessions

  1. Changes
    - Add signal_data JSONB column to video_sessions table for WebRTC signaling
*/

ALTER TABLE video_sessions 
ADD COLUMN IF NOT EXISTS signal_data JSONB;