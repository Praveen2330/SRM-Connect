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
