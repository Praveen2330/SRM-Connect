import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Camera, Loader2, ArrowLeft } from 'lucide-react';
import ProfilePicture from '../components/ProfilePicture';

interface Profile {
  id: string;
  display_name: string | null;
  bio: string | null;
  interests: string[] | null;
  avatar_url: string | null;
  is_new_user: boolean;
  has_accepted_rules: boolean;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
  language: string;
  age: number;
  gender: string;
  gender_preference: string;
}

export default function Profile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load profile data
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      console.log('Loading profile for user:', user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Supabase error:', error);
        // If the profile doesn't exist, create a new one
        if (error.code === 'PGRST116') {
          const newProfile: Profile = {
            id: user.id,
            display_name: '',
            bio: '',
            interests: [],
            avatar_url: null,
            is_new_user: true,
            has_accepted_rules: false,
            is_online: false,
            last_seen: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            language: 'en',
            age: 25,
            gender: 'any',
            gender_preference: 'any'
          };

          const { error: insertError } = await supabase
            .from('profiles')
            .upsert(newProfile);

          if (insertError) {
            console.error('Failed to create profile:', insertError);
            throw insertError;
          }

          setProfile(newProfile);
          return;
        }
        throw error;
      }

      console.log('Profile loaded:', data);
      setProfile(data || {
        id: user.id,
        display_name: '',
        bio: '',
        interests: [],
        avatar_url: null,
        is_new_user: true,
        has_accepted_rules: false,
        is_online: false,
        last_seen: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        language: 'en',
        age: 25,
        gender: 'any',
        gender_preference: 'any'
      });
    } catch (error) {
      console.error('Error loading profile:', error);
      setError(error instanceof Error ? error.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      setUploading(true);
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Create a unique filename using timestamp
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      console.log('Uploading file to path:', filePath);

      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get the public URL
      const { data } = await supabase.storage
        .from('avatars')
        .createSignedUrl(filePath, 31536000); // URL valid for 1 year

      if (!data?.signedUrl) {
        throw new Error('Failed to generate signed URL');
      }

      console.log('Generated signed URL:', data.signedUrl);

      // Update the profile with the new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          avatar_url: data.signedUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
        throw updateError;
      }

      console.log('Profile updated with new avatar URL');

      // Update local state
      setProfile(prev => prev ? { ...prev, avatar_url: data.signedUrl } : null);
      
      // Show success message
      setError('Profile picture updated successfully!');
      setTimeout(() => setError(null), 3000);

    } catch (error) {
      console.error('Error uploading profile picture:', error);
      setError('Failed to upload profile picture: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !profile) return;

      setLoading(true);
      
      // Clean up interests array - split by comma, trim whitespace, filter empty strings
      const cleanedInterests = profile.interests 
        ? (typeof profile.interests === 'string' 
            ? (profile.interests as string).split(',').map((i: string) => i.trim()).filter(Boolean)
            : profile.interests.filter(Boolean))
        : [];
      
      // Only include fields that are guaranteed to exist in the database
      const profileData: Record<string, any> = {
        id: user.id,
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        interests: cleanedInterests,
        updated_at: new Date().toISOString()
      };
      
      // Conditionally add fields that might not exist in the schema yet
      // These will be ignored by Supabase if the columns don't exist
      if (profile.language !== undefined) profileData.language = profile.language || 'en';
      if (profile.age !== undefined) profileData.age = profile.age || 25;
      if (profile.gender !== undefined) profileData.gender = profile.gender || 'any';
      if (profile.gender_preference !== undefined) profileData.gender_preference = profile.gender_preference || 'any';

      const { error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', user.id);

      if (error) throw error;

      // Update local state with cleaned interests
      setProfile(prev => prev ? { ...prev, interests: cleanedInterests } : null);

      setError('Profile updated successfully!');
      setTimeout(() => setError(null), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      let errorMessage = 'Failed to update profile';
      
      if (error instanceof Error) {
        errorMessage += ': ' + error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase error object which may have message or details properties
        const supabaseError = error as any;
        if (supabaseError.message) {
          errorMessage += ': ' + supabaseError.message;
        } else if (supabaseError.details) {
          errorMessage += ': ' + supabaseError.details;
        } else if (supabaseError.error_description) {
          errorMessage += ': ' + supabaseError.error_description;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Back Navigation */}
        <button
          onClick={() => navigate('/dashboard')}
          className="absolute top-4 left-4 p-2 bg-zinc-900/50 backdrop-blur-sm border border-zinc-700 rounded-full hover:bg-zinc-800 transition-colors"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Your Profile</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Picture */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <ProfilePicture
                  avatarUrl={profile?.avatar_url}
                  size="xl"
                />
                <label 
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 p-2 bg-blue-600 rounded-full cursor-pointer hover:bg-blue-700 transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </div>
              <p className="text-sm text-gray-400">
                Click the camera icon to upload a profile picture
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={profile?.display_name || ''}
                onChange={e => setProfile(prev => prev ? { ...prev, display_name: e.target.value } : null)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Enter your display name"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Bio
              </label>
              <textarea
                value={profile?.bio || ''}
                onChange={e => setProfile(prev => prev ? { ...prev, bio: e.target.value } : null)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[100px]"
                placeholder="Tell others about yourself..."
              />
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Preferred Language
              </label>
              <select
                value={profile?.language || 'en'}
                onChange={e => setProfile(prev => prev ? { ...prev, language: e.target.value } : null)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="en">English</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="ml">Malayalam</option>
                <option value="kn">Kannada</option>
                <option value="hi">Hindi</option>
              </select>
            </div>

            {/* Age */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Age
              </label>
              <input
                type="number"
                min="18"
                max="100"
                value={profile?.age || ''}
                onChange={e => setProfile(prev => prev ? { ...prev, age: parseInt(e.target.value) || 25 } : null)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Gender
              </label>
              <select
                value={profile?.gender || 'any'}
                onChange={e => setProfile(prev => prev ? { ...prev, gender: e.target.value } : null)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="any">Any</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </div>

            {/* Gender Preference */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Preferred Gender to Match With
              </label>
              <select
                value={profile?.gender_preference || 'any'}
                onChange={e => setProfile(prev => prev ? { ...prev, gender_preference: e.target.value } : null)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="any">Any</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Interests
              </label>
              <input
                type="text"
                value={profile?.interests?.join(', ') || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value;
                  setProfile(prev => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      interests: value === '' ? [] : [value]
                    };
                  });
                }}
                onBlur={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value;
                  setProfile(prev => {
                    if (!prev) return null;
                    return {
                      ...prev,
                      interests: value ? value.split(',').map(i => i.trim()).filter(Boolean) : []
                    };
                  });
                }}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="e.g., Music, Sports, Technology (comma-separated)"
              />
              <p className="mt-1 text-sm text-gray-400">
                Type your interests freely. Use commas to separate different interests.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Save Changes'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Error/Success Message */}
      {error && (
        <div className={`fixed bottom-4 left-4 right-4 p-4 rounded-lg text-white text-center ${
          error.includes('success') ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {error}
        </div>
      )}
    </div>
  );
}