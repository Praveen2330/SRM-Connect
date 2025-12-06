import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SystemAnnouncement } from '../types';
import { useAuth } from '../hooks/useAuth';

const Dashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [announcementData, setAnnouncementData] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAnnouncementData(data as SystemAnnouncement[]);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const currentGender = profile?.gender;

  const visibleAnnouncements = announcementData.filter((a: SystemAnnouncement) => {
    // Show if no expiry or still valid
    const notExpired = !a.expires_at || new Date(a.expires_at) >= now;

    // Normalize user gender once
    const normalizedGender = currentGender ? currentGender.toLowerCase() : null;

    // Target logic:
    // - null/empty or 'all'        => everyone
    // - 'male'                     => male users + users with gender 'any'
    // - 'female'                   => female users + users with gender 'any'
    let matchesTarget = true;
    const target = a.target_users ? a.target_users.toLowerCase() : 'all';

    if (target === 'male') {
      matchesTarget =
        normalizedGender === 'male' || normalizedGender === 'any';
    } else if (target === 'female') {
      matchesTarget =
        normalizedGender === 'female' || normalizedGender === 'any';
    } else {
      // 'all' or anything else defaults to everyone
      matchesTarget = true;
    }

    return notExpired && matchesTarget;
  });

  return (
    <div>
      <h1>Dashboard</h1>
      {loading ? (
        <p>Loading announcements...</p>
      ) : (
        <ul>
          {visibleAnnouncements.map(announcement => (
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

export default Dashboard;
