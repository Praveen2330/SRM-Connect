import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { AdminRole, AdminUser } from '../types';

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
      if (!loading && user) {
        try {
          const { data, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (error) {
            console.error('Error checking admin status:', error);
            navigate('/dashboard');
            return;
          }

          if (data) {
            setAdminUser(data as AdminUser);
          } else {
            // User is not an admin
            navigate('/dashboard');
          }
        } catch (error) {
          console.error('Error:', error);
          navigate('/dashboard');
        } finally {
          setIsLoading(false);
        }
      } else if (!loading && !user) {
        navigate('/login');
      }
    };

    checkAdminStatus();
  }, [user, loading, navigate]);

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

  // Check permissions for specific tabs
  const canViewUsers = true; // All admins can view users
  const canManageUsers = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canViewReports = true; // All admins can view reports
  const canManageReports = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canViewChats = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canViewSessions = true; // All admins can view session logs
  const canViewAnalytics = true; // All admins can view analytics
  const canManageSettings = adminUser?.role === 'super_admin';
  const canBroadcast = adminUser?.role === 'super_admin' || adminUser?.role === 'moderator';
  const canManageAdmins = adminUser?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">SRM Connect Admin Panel</h1>
          <div className="flex items-center space-x-4">
            <span>{user?.email}</span>
            <span className="px-2 py-1 bg-indigo-600 rounded text-sm">
              {adminUser?.role === 'super_admin' 
                ? 'Super Admin' 
                : adminUser?.role === 'moderator' 
                  ? 'Moderator' 
                  : 'Viewer'}
            </span>
            <button 
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded"
            >
              Exit to Dashboard
            </button>
          </div>
        </div>

        {/* Admin Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-800 mb-6">
          <button
            className={`px-4 py-2 whitespace-nowrap ${activeTab === 'dashboard' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Analytics Dashboard
          </button>
          
          {canViewUsers && (
            <button
              className={`px-4 py-2 whitespace-nowrap ${activeTab === 'users' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('users')}
            >
              User Management
            </button>
          )}
          
          {canViewReports && (
            <button
              className={`px-4 py-2 whitespace-nowrap ${activeTab === 'reports' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('reports')}
            >
              Report Handling
            </button>
          )}
          
          {canViewChats && (
            <button
              className={`px-4 py-2 whitespace-nowrap ${activeTab === 'chats' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('chats')}
            >
              Chat Monitoring
            </button>
          )}
          
          {canViewSessions && (
            <button
              className={`px-4 py-2 whitespace-nowrap ${activeTab === 'sessions' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('sessions')}
            >
              Video Sessions
            </button>
          )}
          
          {canManageSettings && (
            <button
              className={`px-4 py-2 whitespace-nowrap ${activeTab === 'settings' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('settings')}
            >
              Platform Settings
            </button>
          )}
          
          {canBroadcast && (
            <button
              className={`px-4 py-2 whitespace-nowrap ${activeTab === 'broadcast' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('broadcast')}
            >
              Broadcast Messages
            </button>
          )}
          
          {canManageAdmins && (
            <button
              className={`px-4 py-2 whitespace-nowrap ${activeTab === 'admins' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('admins')}
            >
              Admin Access
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="bg-gray-900 rounded-lg p-6">
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
