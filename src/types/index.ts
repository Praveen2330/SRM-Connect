import { User as SupabaseUser } from '@supabase/supabase-js';

export interface User extends SupabaseUser {
  name: string;
  avatar_url?: string;
}

export interface AuthData {
  user: User | null;
  loading: boolean;
}

// Shared profile type used across the app
export interface UserProfile {
  id: string;

  // New canonical display name from profiles table
  full_name?: string | null;

  // Backwards-compat: some places may still use `name`
  name?: string | null;

  avatar_url?: string | null;
}

export interface ChatMessage {
  id: string;
  content: string;
  timestamp: number;
  fromSelf: boolean;
  text: string;
}

export interface SocketMessage {
  type: string;
  data: any;
}

export interface SignalData extends RTCSessionDescriptionInit {}

export interface IceCandidate extends RTCIceCandidateInit {}

export interface MatchData {
  partnerProfile: UserProfile;
  isInitiator: boolean;
}

// Admin Panel Types
export type AdminRole = 'viewer' | 'moderator' | 'super_admin';

export interface AdminUser {
  user_id: string;
  role: AdminRole;
  created_at: string;
  created_by?: string | null;      // allow null (matches DB + code)
  last_sign_in?: string | null;
  profile?: UserProfile | null;    // joined profile with full_name/avatar_url
}

/**
 * Unified UserReport type (merges both previous definitions)
 */
export interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;

  // Optional chat session linkage
  chat_session_id?: string;

  reason: string;
  reported_at: string;

  // Optional extra metadata
  description?: string | null;
  transcript?: any[];              // raw chat / video transcript
  action_taken?: string | null;

  // Admin workflow fields
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;
  resolved_at?: string | null;

  // Auditing fields (may not always be present on older rows)
  created_at?: string;
  updated_at?: string;

  // Joined profile info
  reporter?: UserProfile;
  reported_user?: UserProfile;
}

export interface ChatReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  description?: string | null;
  timestamp: string;
  chatTranscript?: any[];
  status:
    | 'pending'
    | 'reviewed'
    | 'ignored'
    | 'warning_issued'
    | 'user_banned';
  admin_notes?: string | null;
  reviewer_id?: string | null;
  reviewed_at?: string | null;
}

export interface ExtendedUserProfile extends UserProfile {
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  gender?: string;
  status?: 'active' | 'suspended' | 'deleted';
  user_metadata?: any;
}

export interface VideoSession {
  id: string;
  user1_id: string;
  user2_id: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  connection_quality?: string;
  terminated_by?: string;
  termination_reason?: string;
  user1?: UserProfile;
  user2?: UserProfile;
}

export interface SystemSettings {
  id: number;
  allow_new_registrations: boolean;
  allowed_email_domains: string[];
  max_reports_before_auto_suspend: number;
  max_reports_allowed_per_day: number;
  maintenance_mode: boolean;
  maintenance_message: string;
  last_updated: string;
  updated_by?: string;
}

export interface SystemAnnouncement {
  id: string;
  title: string;
  message: string;
  created_at: string;
  expires_at?: string | null;
  created_by?: string | null;
  // now supports 'any' plus free-form string fallback
  target_users: 'all' | 'any' | 'male' | 'female' | string;
  is_active: boolean;
}

export interface UserStatistics {
  total_users: number;
  male_users: number;
  female_users: number;
  new_users_last_7_days: number;
  active_users_last_7_days: number;
}

export interface ReportStatistics {
  total_reports: number;
  pending_reports: number;
  resolved_reports: number;
  reports_last_7_days: number;
}