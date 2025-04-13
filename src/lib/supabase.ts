import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Types for profiles table
export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_new_user: boolean;
  has_accepted_rules: boolean;
  created_at: string;
  updated_at: string;
};

// Helper function to get user profile
export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

// Helper function to update user profile
export async function updateUserProfile(userId: string, updates: Partial<Profile>) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) throw error;
}

// Helper function to check if email is from SRM
export function isSRMEmail(email: string): boolean {
  return email.endsWith('@srmist.edu.in');
}

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