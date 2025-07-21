import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// Try to get environment variables from import.meta
let supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
let supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

// Fallback to directly accessing window.process.env if available
if (!supabaseUrl && typeof window !== 'undefined' && (window as any).process?.env?.VITE_SUPABASE_URL) {
  supabaseUrl = (window as any).process.env.VITE_SUPABASE_URL;
}

if (!supabaseAnonKey && typeof window !== 'undefined' && (window as any).process?.env?.VITE_SUPABASE_ANON_KEY) {
  supabaseAnonKey = (window as any).process.env.VITE_SUPABASE_ANON_KEY;
}

// Fallback to hardcoded values from .env if environment variables aren't available
// This is not ideal for production but will fix development issues
if (!supabaseUrl) {
  supabaseUrl = 'https://pmmqhthyjvtfavylvimu.supabase.co';
  console.warn('Using fallback Supabase URL. Check your environment variables.');
}

if (!supabaseAnonKey) {
  supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtbXFodGh5anZ0ZmF2eWx2aW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODM4ODQ2NjgsImV4cCI6MTk5OTQ2MDY2OH0.S0dyHzKxh1g-cjR6h0yfBDTGGzEsYWGkOdTtIrYeO3k';
  console.warn('Using fallback Supabase anon key. Check your environment variables.');
}

// Validate that we have credentials
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase credentials. Check your environment variables.');
}

// Create Supabase client with retry logic and better error handling
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'srm-connect-auth',
    storage: window.localStorage,
    flowType: 'pkce',
  },
  global: {
    headers: {
      'X-Client-Info': '@supabase/auth-ui-react@0.4.7',
    },
  },
  db: {
    schema: 'public'
  },
});

// Helper function to handle Supabase operations with retries
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000,
  onError?: (error: Error | unknown, attempt: number) => void
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (onError) {
        onError(error, i + 1);
      }
      console.error(`Attempt ${i + 1}/${retries} failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error('All retry attempts failed');
}

// Types for profiles table
export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_new_user: boolean;
  has_accepted_rules: boolean;
  is_profile_complete?: boolean; // Added for profile completion flow
  created_at: string;
  updated_at: string;
};

// Updated helper function with retry logic and better error handling
export async function getUserProfile(userId: string): Promise<Profile> {
  return withRetry(
    async () => {
      // First check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(`Authentication error: ${sessionError.message}`);
      }
      if (!session) {
        throw new Error('No active session found');
      }

      // Then fetch the profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create a new one
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([
              {
                id: userId,
                display_name: session.user.email?.split('@')[0] || null,
                is_new_user: true,
                has_accepted_rules: false,
              }
            ])
            .select()
            .single();

          if (createError) {
            throw new Error(`Failed to create profile: ${createError.message}`);
          }
          return newProfile as Profile;
        }
        throw new Error(`Failed to fetch profile: ${error.message}`);
      }

      return data as Profile;
    },
    3,
    1000,
    (error, attempt) => {
      console.error(`Failed to load profile (attempt ${attempt}/3):`, error);
    }
  );
}

// Updated helper function with retry logic
export async function updateUserProfile(userId: string, updates: Partial<Profile>) {
  return withRetry(
    async () => {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) {
        throw new Error(`Failed to update profile: ${error.message}`);
      }
    },
    3,
    1000,
    (error, attempt) => {
      console.error(`Failed to update profile (attempt ${attempt}/3):`, error);
    }
  );
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
  signal_data?: { senderId: string; signal: any }; // Added for WebRTC signaling
  started_at: string;
  ended_at: string | null;
};