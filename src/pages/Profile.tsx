import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Camera, Loader2 } from 'lucide-react';
import ProfilePicture from '../components/ProfilePicture';

interface Profile {
  id: string;
  name: string | null;
  bio: string | null;
  interests: string[] | null;
  avatar_url: string | null;
  updated_at: string;
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
          const newProfile = {
            id: user.id,
            name: '',
            bio: '',
            interests: [],
            avatar_url: null,
            updated_at: new Date().toISOString()
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
        name: '',
        bio: '',
        interests: [],
        avatar_url: null,
        updated_at: new Date().toISOString()
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
      
      const profileData = {
        id: user.id,
        name: profile.name || '',
        bio: profile.bio || '',
        interests: profile.interests || [],
        updated_at: new Date().toISOString()
      };
      
      // Use upsert instead of update/insert
      const { error } = await supabase
        .from('profiles')
        .upsert(profileData);

      if (error) throw error;

      setError('Profile updated successfully!');
      setTimeout(() => setError(null), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile: ' + (error instanceof Error ? error.message : String(error)));
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
                value={profile?.name || ''}
                onChange={e => setProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
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

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Interests
              </label>
              <input
                type="text"
                value={profile?.interests?.join(', ') || ''}
                onChange={e => setProfile(prev => prev ? { 
                  ...prev, 
                  interests: e.target.value.split(',').map(i => i.trim()).filter(Boolean)
                } : null)}
                className="w-full bg-zinc-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="e.g., Music, Sports, Technology (comma-separated)"
              />
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