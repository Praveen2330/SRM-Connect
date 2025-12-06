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
export interface ExtendedUserProfile {
  id: string;
  name: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  gender?: string;
  status?: 'active' | 'suspended' | 'deleted';
  user_metadata?: any;
  avatar_url?: string | null;
}
export interface ExtendedUserProfile extends UserProfile {
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  gender?: string;
  status?: 'active' | 'suspended' | 'deleted';
  user_metadata?: any;
  avatar_url?: string | null;
}
// src/types.ts

export interface VideoSession {
  id: string;
  user1_id: string | null;
  user2_id: string | null;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  connection_quality?: string | null;
  terminated_by?: string | null;
  termination_reason?: string | null;
}
export interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  chat_session_id?: string;
  reported_at: string;
  reason: string;
  details?: string | null;
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  resolved_at?: string | null;
  resolved_by?: string | null;
  context?: any;
  // ⬇️ ADD THESE
  reporter_name?: string;
  reported_user_name?: string;
}