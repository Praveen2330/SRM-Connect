import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import UserManagement from '../components/admin/UserManagement';
import ReportHandling from '../components/admin/ReportHandling';
import ChatMonitoring from '../components/admin/ChatMonitoring';
import VideoSessionLogs from '../components/admin/VideoSessionLogs';
import AnalyticsDashboard from '../components/admin/AnalyticsDashboard';
import PlatformSettings from '../components/admin/PlatformSettings';
import BroadcastMessages from '../components/admin/BroadcastMessages';
import AdminAccessControl from '../components/admin/AdminAccessControl';

// This is a direct access version of the admin panel with no database checks
const DirectAdmin: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      // Direct check for the specific admin user ID
      if (user.id === 'e1f9caeb-ae74-41af-984a-b44230ac7491') {
        console.log('Direct admin access granted to:', user.email);
        setIsAllowed(true);
      } else {
        navigate('/dashboard');
      }
    } else if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  // If still loading or not the specific admin user
  if (loading || !isAllowed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto"></div>
          <p className="mt-4">Checking admin access...</p>
        </div>
      </div>
    );
  }

  // Hardcoded admin user object
  const adminUser = {
    user_id: user!.id,
    role: 'super_admin',
    created_at: new Date().toISOString(),
    last_sign_in: new Date().toISOString()
  };

  // Hardcoded permissions - all true for direct access
  const canViewUsers = true;
  const canManageUsers = true;
  const canViewReports = true;
  const canManageReports = true;
  const canViewChats = true;
  const canViewSessions = true;
  const canManageSettings = true;
  const canBroadcast = true;
  const canManageAdmins = true;

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
              Super Admin
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
          <h2 className="text-xl font-semibold">Admin Dashboard (Direct Access)</h2>
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

export default DirectAdmin;
