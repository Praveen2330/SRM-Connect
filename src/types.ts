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
  created_by?: string;
  last_sign_in?: string;
  profile?: {
    id: string;
    name?: string;
    avatar_url?: string | null;
  };
}
