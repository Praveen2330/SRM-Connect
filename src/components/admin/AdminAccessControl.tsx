import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AdminUser, AdminRole } from '../../types';
import { useAuth } from '../../hooks/useAuth';

const AdminAccessControl: React.FC = () => {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<AdminRole>('viewer');
  
  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Try to get admins from database
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select(`
            *,
            profile:user_id(id, full_name, avatar_url)
          `)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setAdmins(data as AdminUser[]);
          return; // Exit if successful
        }
      } catch (dbError) {
        console.error('Error fetching admins from database:', dbError);
        // Continue to fallback data
      }
      
      // If we reach here, use fallback data
      console.log('Using fallback admin data');
      
      // Create fallback admin data with current user as super_admin
      const fallbackAdmins: AdminUser[] = [
        {
          user_id: user?.id || 'e1f9caeb-ae74-41af-984a-b44230ac7491',
          role: 'super_admin',
          created_at: new Date().toISOString(),
          last_sign_in: new Date().toISOString(),
          created_by: user?.id || null,
          profile: {
            id: user?.id || 'e1f9caeb-ae74-41af-984a-b44230ac7491',
            full_name: user?.email?.split('@')[0] || 'Admin',
            avatar_url: null
          }
        }
      ];
      
      setAdmins(fallbackAdmins);
      setError('Database relationship error. Using fallback admin data.');
    } catch (error) {
      console.error('Critical error in admin management:', error);
      setError('Critical error loading admin data. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userEmail.trim()) {
      setError('Email is required');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    
    try {
      // First find the user by email
      const { data: userData, error: userError } = await supabase
        .rpc('get_user_id_by_email', { email_address: userEmail.trim() });
      
      if (userError) throw userError;
      
      if (!userData) {
        throw new Error('No user found with that email');
      }
      
      // Check if user is already an admin
      const { data: existingAdmin, error: checkError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', userData)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      if (existingAdmin) {
        throw new Error('This user is already an admin');
      }
      
      // Add user as admin
      const newAdmin = {
        user_id: userData,
        role: userRole,
        created_by: user?.id,
        created_at: new Date().toISOString()
      };
      
      const { error: insertError } = await supabase
        .from('admin_users')
        .insert(newAdmin);
      
      if (insertError) throw insertError;
      
      setSuccess(`Admin access granted to ${userEmail}`);
      
      // Reset form
      setUserEmail('');
      setUserRole('viewer');
      setShowAddForm(false);
      
      // Refresh admins list
      fetchAdmins();
      
    } catch (error) {
      console.error('Error adding admin:', error);
      setError((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (adminId: string, newRole: AdminRole) => {
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ role: newRole })
        .eq('user_id', adminId);
      
      if (error) throw error;
      
      setSuccess('Admin role updated successfully');
      
      // Update local state
      setAdmins(prevAdmins => 
        prevAdmins.map(admin => 
          admin.user_id === adminId 
            ? { ...admin, role: newRole } 
            : admin
        )
      );
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error updating admin role:', error);
      setError((error as Error).message);
    }
  };

  const handleRemoveAdmin = async (adminId: string, adminName: string) => {
    if (!confirm(`Are you sure you want to remove admin access from ${adminName}?`)) return;
    
    try {
      // Make sure we're not removing ourselves
      if (adminId === user?.id) {
        throw new Error('You cannot remove your own admin access');
      }
      
      const { error } = await supabase
        .from('admin_users')
        .delete()
        .eq('user_id', adminId);
      
      if (error) throw error;
      
      setSuccess('Admin access removed successfully');
      
      // Remove from local state
      setAdmins(prevAdmins => 
        prevAdmins.filter(admin => admin.user_id !== adminId)
      );
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error removing admin:', error);
      setError((error as Error).message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Admin Access Control</h2>
        
        <div className="flex space-x-2">
          <button
            onClick={fetchAdmins}
            className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
            title="Refresh admin list"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 rounded flex items-center"
          >
            {showAddForm ? (
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
                Add Admin
              </>
            )}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-900 text-white p-4 mb-4 rounded">
          <div className="flex items-center">
            <div className="mr-3 text-xl">⚠️</div>
            <div>
              <p className="font-semibold">Database Schema Error</p>
              <p className="text-sm">{error}</p>
              <p className="text-sm mt-1">
                Using fallback data. Full functionality is limited until database issues are resolved.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {success && (
        <div className="bg-green-900 bg-opacity-20 border border-green-800 rounded-lg p-4 mb-6">
          <p className="text-green-400">{success}</p>
        </div>
      )}
      
      {/* Add Admin Form */}
      {showAddForm && (
        <form onSubmit={handleAddAdmin} className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4">Add New Admin</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label htmlFor="userEmail" className="block text-sm font-medium text-gray-400 mb-1">
                User Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="userEmail"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="Enter existing user's email"
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                The user must already have an account in the system
              </p>
            </div>
            
            <div>
              <label htmlFor="userRole" className="block text-sm font-medium text-gray-400 mb-1">
                Admin Role
              </label>
              <select
                id="userRole"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as AdminRole)}
                className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
              >
                <option value="viewer">Viewer (Read-only)</option>
                <option value="moderator">Moderator</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">
                Determines what actions they can perform
              </p>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
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
                  Adding...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Admin
                </>
              )}
            </button>
          </div>
        </form>
      )}
      
      {/* Admins Table */}
      <div className="bg-gray-800 rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Admin
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Added
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Role
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Last Sign In
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
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-400">
                  No admins found
                </td>
              </tr>
            ) : (
              admins.map(admin => (
                <tr
                  key={admin.user_id}
                  className={`hover:bg-gray-800 ${
                    admin.user_id === user?.id ? 'bg-gray-800 bg-opacity-50' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {admin.profile?.avatar_url ? (
                          <img
                            className="h-10 w-10 rounded-full object-cover"
                            src={admin.profile.avatar_url}
                            alt={admin.profile?.full_name || 'Admin'}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                            <span className="text-xl text-gray-300">
                              {(admin.profile?.full_name || 'A')
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-white">
                          {admin.profile?.full_name || 'Unknown Admin'}
                          {admin.user_id === user?.id && (
                            <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-900 text-indigo-300">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400">
                          {admin.user_id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {new Date(admin.created_at).toLocaleDateString()}
                    {admin.created_by && (
                      <div className="text-xs text-gray-500 mt-1">
                        by {admin.created_by === user?.id ? 'You' : admin.created_by}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {admin.user_id !== user?.id ? (
                      <select
                        value={admin.role}
                        onChange={(e) =>
                          handleUpdateRole(
                            admin.user_id,
                            e.target.value as AdminRole
                          )
                        }
                        className="p-1 rounded bg-gray-700 border border-gray-600 text-white text-sm"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="moderator">Moderator</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    ) : (
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${
                          admin.role === 'super_admin'
                            ? 'bg-red-900 text-red-300'
                            : admin.role === 'moderator'
                            ? 'bg-yellow-900 text-yellow-300'
                            : 'bg-blue-900 text-blue-300'
                        }`}
                      >
                        {admin.role === 'super_admin'
                          ? 'Super Admin'
                          : admin.role === 'moderator'
                          ? 'Moderator'
                          : 'Viewer'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {admin.last_sign_in
                      ? new Date(admin.last_sign_in).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {admin.user_id !== user?.id && (
                      <button
                        onClick={() =>
                          handleRemoveAdmin(
                            admin.user_id,
                            admin.profile?.full_name || 'this admin'
                          )
                        }
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove Access
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6 bg-gray-800 p-4 rounded-lg">
        <h3 className="text-lg font-medium mb-2">Admin Role Permissions</h3>
        <ul className="text-sm text-gray-300 space-y-2">
          <li className="flex items-start">
            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-900 text-blue-300 mr-2 mt-0.5">
              Viewer
            </span>
            <span>
              Read-only access to admin dashboard. Can view users, reports, and
              sessions but cannot take actions.
            </span>
          </li>
          <li className="flex items-start">
            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900 text-yellow-300 mr-2 mt-0.5">
              Moderator
            </span>
            <span>
              Can manage users, handle reports, and send broadcasts. Cannot
              change system settings or manage admin access.
            </span>
          </li>
          <li className="flex items-start">
            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900 text-red-300 mr-2 mt-0.5">
              Super Admin
            </span>
            <span>
              Full access to all admin features including platform settings and
              admin access control.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AdminAccessControl;