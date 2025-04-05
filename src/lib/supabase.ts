import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': 'return=minimal'
    },
  },
});

export type Profile = {
  id: string;
  display_name: string | null;
  bio: string | null;
  interests: string[] | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
};

export type Match = {
  id: string;
  user1_id: string;
  user2_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  matched_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  sent_at: string;
};

export type Report = {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
};

export type Settings = {
  user_id: string;
  video_enabled: boolean;
  audio_enabled: boolean;
  notifications_enabled: boolean;
  theme: 'dark' | 'light';
  updated_at: string;
};

export type VideoSession = {
  id: string;
  user1_id: string;
  user2_id: string;
  status: 'pending' | 'active' | 'ended';
  started_at: string;
  ended_at: string | null;
};