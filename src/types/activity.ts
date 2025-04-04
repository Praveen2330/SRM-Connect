export interface RecentActivity {
  id: string;
  partnerId: string;
  timestamp: Date;
  duration: number; // in seconds
  likes: number;
  messages: number;
}

export type RecentActivities = RecentActivity[]; 