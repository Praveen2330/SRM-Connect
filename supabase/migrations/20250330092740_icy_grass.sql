/*
  # Initial Schema Setup for SRM Connect

  1. New Tables
    - profiles
      - User profiles with additional information
    - matches
      - Stores user matches and their status
    - messages
      - Chat messages between matched users
    - reports
      - User reports for moderation
    - settings
      - User preferences and settings
    - video_sessions
      - Active video chat sessions

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  display_name text,
  bio text,
  interests text[],
  avatar_url text,
  is_online boolean DEFAULT false,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid REFERENCES profiles(id),
  user2_id uuid REFERENCES profiles(id),
  status text CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  matched_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id),
  sender_id uuid REFERENCES profiles(id),
  content text NOT NULL,
  is_read boolean DEFAULT false,
  sent_at timestamptz DEFAULT now()
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid REFERENCES profiles(id),
  reported_id uuid REFERENCES profiles(id),
  reason text NOT NULL,
  status text CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  user_id uuid PRIMARY KEY REFERENCES profiles(id),
  video_enabled boolean DEFAULT true,
  audio_enabled boolean DEFAULT true,
  notifications_enabled boolean DEFAULT true,
  theme text DEFAULT 'dark',
  updated_at timestamptz DEFAULT now()
);

-- Create video_sessions table
CREATE TABLE IF NOT EXISTS video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid REFERENCES profiles(id),
  user2_id uuid REFERENCES profiles(id),
  status text CHECK (status IN ('pending', 'active', 'ended')),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Matches policies
CREATE POLICY "Users can read their matches"
  ON matches FOR SELECT
  TO authenticated
  USING (auth.uid() IN (user1_id, user2_id));

CREATE POLICY "Users can create matches"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user1_id);

-- Messages policies
CREATE POLICY "Users can read messages in their matches"
  ON messages FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user1_id FROM matches WHERE id = match_id
      UNION
      SELECT user2_id FROM matches WHERE id = match_id
    )
  );

CREATE POLICY "Users can send messages in their matches"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    auth.uid() IN (
      SELECT user1_id FROM matches WHERE id = match_id
      UNION
      SELECT user2_id FROM matches WHERE id = match_id
    )
  );

-- Reports policies
CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Settings policies
CREATE POLICY "Users can manage their settings"
  ON settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Video sessions policies
CREATE POLICY "Users can manage their video sessions"
  ON video_sessions FOR ALL
  TO authenticated
  USING (auth.uid() IN (user1_id, user2_id))
  WITH CHECK (auth.uid() IN (user1_id, user2_id));