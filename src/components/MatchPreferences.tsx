import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Settings } from 'lucide-react';

export default function MatchPreferences() {
  const [preferences, setPreferences] = useState({
    department: '',
    yearOfStudy: '',
    interests: [] as string[],
    ageRange: [18, 25],
    lookingFor: 'friendship',
  });

  const departments = [
    'Computer Science',
    'Mechanical',
    'Electronics',
    'Civil',
    'Biotechnology',
  ];

  const interestsList = [
    'Music',
    'Sports',
    'Technology',
    'Art',
    'Travel',
    'Gaming',
    'Reading',
    'Cooking',
  ];

  const handleInterestToggle = (interest: string) => {
    setPreferences(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('profiles')
      .update({
        matching_preferences: preferences,
      })
      .eq('id', user.id);
  };

  return (
    <div className="bg-zinc-900 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5" />
        <h2 className="text-xl font-semibold">Match Preferences</h2>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Department</label>
          <select
            value={preferences.department}
            onChange={(e) => setPreferences(prev => ({ ...prev, department: e.target.value }))}
            className="w-full bg-black border border-zinc-700 rounded-lg p-2"
          >
            <option value="">Any Department</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Year of Study</label>
          <select
            value={preferences.yearOfStudy}
            onChange={(e) => setPreferences(prev => ({ ...prev, yearOfStudy: e.target.value }))}
            className="w-full bg-black border border-zinc-700 rounded-lg p-2"
          >
            <option value="">Any Year</option>
            <option value="1">1st Year</option>
            <option value="2">2nd Year</option>
            <option value="3">3rd Year</option>
            <option value="4">4th Year</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Interests</label>
          <div className="flex flex-wrap gap-2">
            {interestsList.map(interest => (
              <button
                key={interest}
                onClick={() => handleInterestToggle(interest)}
                className={`px-3 py-1 rounded-full text-sm ${
                  preferences.interests.includes(interest)
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-800 text-gray-300'
                }`}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Age Range</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="18"
              max="25"
              value={preferences.ageRange[0]}
              onChange={(e) => setPreferences(prev => ({
                ...prev,
                ageRange: [parseInt(e.target.value), prev.ageRange[1]]
              }))}
              className="flex-1"
            />
            <span>{preferences.ageRange[0]} - {preferences.ageRange[1]}</span>
            <input
              type="range"
              min="18"
              max="25"
              value={preferences.ageRange[1]}
              onChange={(e) => setPreferences(prev => ({
                ...prev,
                ageRange: [prev.ageRange[0], parseInt(e.target.value)]
              }))}
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Looking For</label>
          <select
            value={preferences.lookingFor}
            onChange={(e) => setPreferences(prev => ({ ...prev, lookingFor: e.target.value }))}
            className="w-full bg-black border border-zinc-700 rounded-lg p-2"
          >
            <option value="friendship">Friendship</option>
            <option value="dating">Dating</option>
            <option value="study_partner">Study Partner</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Save Preferences
        </button>
      </div>
    </div>
  );
}