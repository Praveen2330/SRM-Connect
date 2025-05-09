import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SystemAnnouncement } from '../../types';
import { useAuth } from '../../hooks/useAuth';

const BroadcastMessages: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetUsers, setTargetUsers] = useState('all');
  const [expiresAt, setExpiresAt] = useState('');
  
  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase
        .from('system_announcements')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        setAnnouncements(data as SystemAnnouncement[]);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    
    try {
      const newAnnouncement = {
        title: title.trim(),
        message: message.trim(),
        target_users: targetUsers,
        created_by: user?.id,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        is_active: true
      };
      
      const { data, error } = await supabase
        .from('system_announcements')
        .insert(newAnnouncement)
        .select();
      
      if (error) throw error;
      
      setSuccess('Announcement created successfully');
      
      // Reset form
      setTitle('');
      setMessage('');
      setTargetUsers('all');
      setExpiresAt('');
      setShowNewForm(false);
      
      // Refresh announcements list
      fetchAnnouncements();
      
    } catch (error) {
      console.error('Error creating announcement:', error);
      setError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAnnouncementStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('system_announcements')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      setAnnouncements(prevAnnouncements => 
        prevAnnouncements.map(announcement => 
          announcement.id === id 
            ? { ...announcement, is_active: !currentStatus } 
            : announcement
        )
      );
      
    } catch (error) {
      console.error('Error toggling announcement status:', error);
      setError((error as Error).message);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    
    try {
      const { error } = await supabase
        .from('system_announcements')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Remove from local state
      setAnnouncements(prevAnnouncements => 
        prevAnnouncements.filter(announcement => announcement.id !== id)
      );
      
      setSuccess('Announcement deleted successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error deleting announcement:', error);
      setError((error as Error).message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Broadcast Messages</h2>
        
        <div className="flex space-x-2">
          <button
            onClick={fetchAnnouncements}
            className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
            title="Refresh announcements"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 rounded flex items-center"
          >
            {showNewForm ? (
              <>
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Announcement
              </>
            )}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="bg-green-900 bg-opacity-20 border border-green-800 rounded-lg p-4 mb-6">
          <p className="text-green-400">{success}</p>
        </div>
      )}
      
      {/* New Announcement Form */}
      {showNewForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4">Create New Announcement</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-400 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter announcement title"
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                required
              />
            </div>
            
            <div>
              <label htmlFor="targetUsers" className="block text-sm font-medium text-gray-400 mb-1">
                Target Audience
              </label>
              <select
                id="targetUsers"
                value={targetUsers}
                onChange={(e) => setTargetUsers(e.target.value)}
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
              >
                <option value="all">All Users</option>
                <option value="male">Male Users Only</option>
                <option value="female">Female Users Only</option>
              </select>
            </div>
          </div>
          
          <div className="mb-6">
            <label htmlFor="message" className="block text-sm font-medium text-gray-400 mb-1">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your announcement message"
              className="w-full p-3 rounded bg-gray-700 border border-gray-600 text-white"
              rows={5}
              required
            />
          </div>
          
          <div className="mb-6">
            <label htmlFor="expiresAt" className="block text-sm font-medium text-gray-400 mb-1">
              Expiry Date (Optional)
            </label>
            <input
              type="datetime-local"
              id="expiresAt"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
            />
            <p className="text-sm text-gray-500 mt-1">
              Leave blank for announcements that don't expire
            </p>
          </div>
          
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded mr-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded flex items-center"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Announcement
                </>
              )}
            </button>
          </div>
        </form>
      )}
      
      {/* Announcements List */}
      <div className="bg-gray-800 rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Title
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Created
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Target
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
                  </div>
                </td>
              </tr>
            ) : announcements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                  No announcements found
                </td>
              </tr>
            ) : (
              announcements.map(announcement => (
                <tr key={announcement.id} className="hover:bg-gray-800">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-white">
                      {announcement.title}
                    </div>
                    <div className="text-sm text-gray-400 mt-1 line-clamp-2">
                      {announcement.message}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {new Date(announcement.created_at).toLocaleString()}
                    {announcement.expires_at && (
                      <div className="text-xs text-gray-500 mt-1">
                        Expires: {new Date(announcement.expires_at).toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {announcement.target_users === 'all' ? 'All Users' :
                     announcement.target_users === 'male' ? 'Male Users' :
                     announcement.target_users === 'female' ? 'Female Users' : 
                     announcement.target_users}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                      ${announcement.is_active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`}
                    >
                      {announcement.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => toggleAnnouncementStatus(announcement.id, announcement.is_active)}
                      className={`mr-3 ${announcement.is_active 
                        ? 'text-yellow-400 hover:text-yellow-300' 
                        : 'text-green-400 hover:text-green-300'}`}
                    >
                      {announcement.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    
                    <button
                      onClick={() => deleteAnnouncement(announcement.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BroadcastMessages;
