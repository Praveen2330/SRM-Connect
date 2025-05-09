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
