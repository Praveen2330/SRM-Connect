import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

// Define admin types here to avoid import errors
type AdminRole = 'viewer' | 'moderator' | 'super_admin';

interface AdminUser {
  user_id: string;
  role: AdminRole;
  created_at: string;
  created_by?: string;
  last_sign_in?: string;
}

// Admin panel components
import UserManagement from '../components/admin/UserManagement';
import ReportHandling from '../components/admin/ReportHandling';
import ChatMonitoring from '../components/admin/ChatMonitoring';
import VideoSessionLogs from '../components/admin/VideoSessionLogs';
import AnalyticsDashboard from '../components/admin/AnalyticsDashboard';
import PlatformSettings from '../components/admin/PlatformSettings';
import BroadcastMessages from '../components/admin/BroadcastMessages';
import AdminAccessControl from '../components/admin/AdminAccessControl';

const Admin: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (loading) {
        // Still loading auth state, wait
        return;
      }
      
      if (!user) {
        // Not logged in, redirect to login
        navigate('/login');
        return;
      }
      
      // EMERGENCY BYPASS: Allow direct access for this specific user ID
      if (user.id === 'e1f9caeb-ae74-41af-984a-b44230ac7491') {
        console.log('*** DIRECT ADMIN ACCESS GRANTED FOR:', user.email);
        
        // Create a temporary admin user object for this session
        setAdminUser({
          user_id: user.id,
          role: 'super_admin',
          created_at: new Date().toISOString(),
          last_sign_in: new Date().toISOString()
        });
        
        setIsLoading(false);
        return;
      }
      
      try {
        // First make sure the admin_users table exists by checking for a single row
        const { error: tableCheckError } = await supabase
          .from('admin_users')
          .select('count')
          .limit(1);
          
        if (tableCheckError && tableCheckError.code === '42P01') {
          // Table doesn't exist - needs to be created
          console.error('Admin tables not set up:', tableCheckError);
          setIsLoading(false);
          return;
        }
        
        // Check if current user is an admin
        const { data, error } = await supabase
          .from('admin_users')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking admin status:', error);
          // Don't redirect immediately, give better feedback
          setIsLoading(false);
          return;
        }

        if (data) {
          // Update last sign-in time for admin
          await supabase
            .from('admin_users')
            .update({ last_sign_in: new Date().toISOString() })
            .eq('user_id', user.id);
            
          setAdminUser(data as AdminUser);
        } else {
          // User is not an admin, redirect after short delay
          setTimeout(() => navigate('/dashboard'), 1000);
        }
      } catch (error) {
        console.error('Admin panel error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, loading, navigate]);

  // Enhanced debugging information
  console.log('Admin component state:', {
    loading,
    isLoading,
    user: user?.id,
    adminUser: adminUser ? 'Set' : 'Not set'
  });
  
  // If still checking admin status, show loading
  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto"></div>
          <p className="mt-4">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Not an admin, show error message with more details
  if (!adminUser) {
    console.error('Admin access denied - adminUser is null/undefined');
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center bg-red-900 p-6 rounded-lg max-w-md">
          <div className="text-3xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold mb-4">Access Denied</h1>
          <p className="mb-6">You do not have permission to access the admin panel.</p>
          <div className="mb-4 text-left text-xs bg-black p-2 rounded">
            <p>Debug info:</p>
            <p>User ID: {user?.id}</p>
            <p>User Email: {user?.email}</p>
            <p>Target ID: e1f9caeb-ae74-41af-984a-b44230ac7491</p>
            <p>Match: {user?.id === 'e1f9caeb-ae74-41af-984a-b44230ac7491' ? 'Yes' : 'No'}</p>
          </div>
          <div className="flex space-x-2 justify-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-900 transition-colors"
            >
              Return to Dashboard
            </button>
            <button
              onClick={() => navigate('/direct-admin')}
              className="px-4 py-2 bg-indigo-800 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              Try Direct Admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check permissions for specific tabs
  const canViewUsers = true; // All admins can view users
  const canManageUsers = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canViewReports = true; // All admins can view reports
  const canManageReports = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canViewChats = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canViewSessions = true; // All admins can view session logs
  // All admins can view analytics (used directly in the component)
  const canManageSettings = adminUser?.role === 'super_admin';
  const canBroadcast = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canManageAdmins = adminUser?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-black text-white">
      {/* SRM Connect Header */}
      <header className="bg-black border-b border-gray-800 py-4 px-6 mb-6">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white flex items-center">
            <span className="text-indigo-500 mr-1">SRM</span> Connect <span className="ml-2 text-sm bg-red-600 text-white px-2 py-0.5 rounded">ADMIN</span>
          </h1>
          <div className="flex items-center space-x-4">
            <span className="text-gray-400">{user?.email}</span>
            <span className="px-2 py-1 bg-indigo-900 text-indigo-300 rounded text-xs">
              {adminUser?.role === 'super_admin' 
                ? 'Super Admin' 
                : adminUser?.role === 'moderator' 
                  ? 'Moderator' 
                  : 'Viewer'}
            </span>
            <button 
              onClick={() => navigate('/dashboard')}
              className="px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded text-sm flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Return to App
            </button>
          </div>
        </div>
      </header>
      
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Admin Dashboard</h2>
        </div>

        {/* Admin Navigation Tabs */}
        <div className="flex overflow-x-auto mb-6 bg-gray-900 rounded-t-lg p-1">
          <button
            className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'dashboard' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Analytics Dashboard
          </button>
          
          {canViewUsers && (
            <button
              className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'users' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('users')}
            >
              User Management
            </button>
          )}
          
          {canViewReports && (
            <button
              className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'reports' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('reports')}
            >
              Report Handling
            </button>
          )}
          
          {canViewChats && (
            <button
              className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'chats' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('chats')}
            >
              Chat Monitoring
            </button>
          )}
          
          {/* Chat Reports button removed as requested */}
          
          {canViewSessions && (
            <button
              className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'sessions' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('sessions')}
            >
              Video Sessions
            </button>
          )}
          
          {canManageSettings && (
            <button
              className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'settings' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('settings')}
            >
              Platform Settings
            </button>
          )}
          
          {canBroadcast && (
            <button
              className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'broadcast' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('broadcast')}
            >
              Broadcast Messages
            </button>
          )}
          
          {canManageAdmins && (
            <button
              className={`px-4 py-2 whitespace-nowrap rounded-t ${activeTab === 'admins' ? 'bg-black text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('admins')}
            >
              Admin Access
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="bg-black border border-gray-800 rounded-lg shadow-xl p-6">
          {activeTab === 'dashboard' && <AnalyticsDashboard />}
          {activeTab === 'users' && <UserManagement canManage={canManageUsers} />}
          {activeTab === 'reports' && <ReportHandling canManage={canManageReports} />}
          {activeTab === 'chats' && <ChatMonitoring />}
          {activeTab === 'sessions' && <VideoSessionLogs />}
          {activeTab === 'settings' && <PlatformSettings />}
          {activeTab === 'broadcast' && <BroadcastMessages />}
          {activeTab === 'admins' && <AdminAccessControl />}
        </div>
      </div>
    </div>
  );
};

export default Admin;
