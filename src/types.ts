export interface Message {
  id: string;
  content: string;
  timestamp: Date;
  from: 'You' | 'Partner';
}

export interface ChatMessage {
  content: string;
  from: string;
}

export interface MatchFoundData {
  userId: string;
  signal: RTCSessionDescriptionInit;
}

export interface SignalData {
  to: string;
  signal: RTCIceCandidateInit | RTCSessionDescriptionInit;
}

export interface UserPreferences {
  language: string;
  age: number;
  gender: string;
  gender_preference: string;
}

export type AdminRole = 'viewer' | 'moderator' | 'super_admin';

export interface AdminUser {
  user_id: string;
  role: AdminRole;
  created_at: string;
  created_by?: string | null;      // can be null (matches your fallback object)
  last_sign_in?: string | null;
  profile?: UserProfile | null;    // joined profile may be missing
}

export interface UserProfile {
  id: string;

  // New main field from profiles table
  full_name?: string | null;

  // Backwards compatibility for any old code that still uses `name`
  name?: string | null;

  avatar_url?: string | null;
}