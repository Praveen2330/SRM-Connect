import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, MessageCircle, User, Settings, Clock, Heart, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RecentActivity } from '../types/activity';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleString();
}

function Dashboard() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('No authenticated user found');
          return;
        }

        // Get all activities for the user
        const { data, error } = await supabase
          .from('recent_activities')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching activities:', error);
          return;
        }

        // If no activities exist, create an empty record
        let activities = data;
        if (!activities || activities.length === 0) {
          const { data: newData, error: insertError } = await supabase
            .from('recent_activities')
            .insert([
              { 
                user_id: user.id,
                activities: [],
                created_at: new Date().toISOString()
              }
            ])
            .select()
            .single();

          if (insertError) {
            console.error('Error creating activities record:', insertError);
            return;
          }
          
          activities = [newData];
        }

        // Process all activities
        const allActivities = activities.reduce((acc, record) => {
          const recordActivities = Array.isArray(record.activities) ? record.activities : [];
          return [...acc, ...recordActivities];
        }, [] as RecentActivity[]);

        // Sort activities by timestamp and take the most recent 10
        const sortedActivities = allActivities
          .map((activity: RecentActivity) => ({
            ...activity,
            timestamp: new Date(activity.timestamp)
          }))
          .sort((a: RecentActivity, b: RecentActivity) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(0, 10);

        setActivities(sortedActivities);
      } catch (error) {
        console.error('Error in fetchActivities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  const handleFindMatch = () => {
    navigate('/video-chat');
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-4xl font-bold">Dashboard</h1>
          <Link to="/settings" className="flex items-center gap-2 bg-zinc-900 p-2 rounded-lg">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="bg-zinc-900 p-6 rounded-xl">
            <div className="flex flex-col items-center">
              <Camera className="w-8 h-8 mb-4" />
              <h2 className="text-xl font-bold mb-2">Start Video Chat</h2>
              <p className="text-gray-400 text-center mb-4">Connect with someone new through video chat</p>
              <button 
                onClick={handleFindMatch}
                className="w-full bg-white text-black py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                Find Match
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 p-6 rounded-xl">
            <div className="flex flex-col items-center">
              <MessageCircle className="w-8 h-8 mb-4" />
              <h2 className="text-xl font-bold mb-2">Messages</h2>
              <p className="text-gray-400 text-center mb-4">View and respond to your messages</p>
              <Link 
                to="/messages" 
                className="w-full bg-zinc-900 border border-white py-2 rounded-lg font-semibold text-center hover:bg-zinc-800 transition-colors"
              >
                Open Chat
              </Link>
            </div>
          </div>

          <div className="bg-zinc-900 p-6 rounded-xl">
            <div className="flex flex-col items-center">
              <User className="w-8 h-8 mb-4" />
              <h2 className="text-xl font-bold mb-2">Your Profile</h2>
              <p className="text-gray-400 text-center mb-4">Update your profile and preferences</p>
              <Link 
                to="/profile" 
                className="w-full bg-zinc-900 border border-white py-2 rounded-lg font-semibold text-center hover:bg-zinc-800 transition-colors"
              >
                Edit Profile
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-xl p-8">
          <h2 className="text-2xl font-bold mb-6">Recent Activity</h2>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="bg-zinc-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400">{formatTimestamp(activity.timestamp)}</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>{formatDuration(activity.duration)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Heart className="w-4 h-4 text-red-500" />
                        <span>{activity.likes}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4 text-blue-500" />
                        <span>{activity.messages}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    Connected with user {activity.partnerId}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No recent activity to show.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
