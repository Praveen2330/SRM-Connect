import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Profile } from '../lib/supabase';

interface ProfileCompletionProps {
  profile: Profile;
}

export default function ProfileCompletion({ profile }: ProfileCompletionProps) {
  const calculateCompletion = () => {
    let total = 0;
    let completed = 0;

    // Check display name
    total++; if (profile.display_name) completed++;
    
    // Check bio
    total++; if (profile.bio) completed++;
    
    // Check interests
    total++; if (profile.interests && profile.interests.length > 0) completed++;
    
    // Check avatar
    total++; if (profile.avatar_url) completed++;

    return Math.round((completed / total) * 100);
  };

  const completion = calculateCompletion();

  return (
    <div className="bg-zinc-900 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-4">Profile Completion</h2>
      
      <div className="flex items-center gap-6">
        <div className="w-24 h-24">
          <CircularProgressbar
            value={completion}
            text={`${completion}%`}
            styles={buildStyles({
              textSize: '20px',
              pathColor: `rgba(147, 51, 234, ${completion / 100})`,
              textColor: '#fff',
              trailColor: '#27272a',
            })}
          />
        </div>
        
        <div className="flex-1">
          <p className="text-gray-400 mb-2">
            Complete your profile to get better matches!
          </p>
          
          <div className="space-y-2">
            {!profile.display_name && (
              <p className="text-sm text-yellow-500">• Add your display name</p>
            )}
            {!profile.bio && (
              <p className="text-sm text-yellow-500">• Write a bio</p>
            )}
            {(!profile.interests || profile.interests.length === 0) && (
              <p className="text-sm text-yellow-500">• Add some interests</p>
            )}
            {!profile.avatar_url && (
              <p className="text-sm text-yellow-500">• Upload a profile picture</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}