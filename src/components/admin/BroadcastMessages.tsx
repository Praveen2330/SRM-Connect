import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

// Local type matching your system_announcements table
type SystemAnnouncement = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  expires_at?: string | null;
  target_users?: string | null; // 'all' | 'any' | 'male' | 'female'
  is_active?: boolean | null;
};

const BroadcastMessages: React.FC = () => {
  const { user } = useAuth(); // you can remove `user` if you don't use it
  const [announcementData, setAnnouncementData] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('system_announcements')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        setAnnouncementData((data || []) as SystemAnnouncement[]);
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();
  }, []);

  const now = new Date();

  // Admin view: just hide expired announcements
  const visibleAnnouncements = announcementData.filter((a) => {
    const notExpired = !a.expires_at || new Date(a.expires_at) >= now;
    return notExpired;
  });

  return (
    <div>
      <h1>Broadcast Messages</h1>
      {loading ? (
        <p>Loading announcements...</p>
      ) : (
        <ul>
          {visibleAnnouncements.map((announcement) => (
            <li key={announcement.id}>
              <h3>{announcement.title}</h3>
              <p>{announcement.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BroadcastMessages;