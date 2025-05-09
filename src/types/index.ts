import { User as SupabaseUser } from '@supabase/supabase-js';

export interface User extends SupabaseUser {
  name: string;
  avatar_url?: string;
}

export interface AuthData {
  user: User | null;
  loading: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar_url?: string;
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
  created_by?: string;
  last_sign_in?: string;
  profile?: UserProfile;
}

export interface ExtendedUserProfile extends UserProfile {
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  gender?: string;
  status?: 'active' | 'suspended' | 'deleted';
  user_metadata?: any;
}

export interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  reported_at: string;
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  resolved_at?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  reporter?: UserProfile;
  reported_user?: UserProfile;
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
  expires_at?: string;
  created_by?: string;
  target_users: 'all' | 'male' | 'female' | string;
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
