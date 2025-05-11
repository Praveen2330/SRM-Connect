import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';

// Direct access admin debug page
const AdminDebug: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'authorized' | 'unauthorized'>('checking');
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [adminEnabled, setAdminEnabled] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      if (loading) return;
      
      if (!user) {
        setStatus('unauthorized');
        setDebugInfo({ error: 'Not logged in' });
        return;
      }

      try {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        // Check admin_users table
        const { data: adminCheck, error: adminError } = await supabase
          .from('admin_users')
          .select('*')
          .eq('user_id', user.id);

        // Check if table exists
        const tableExists = !(adminError && adminError.code === '42P01');

        // Compile debug info
        setDebugInfo({
          user: {
            id: user.id,
            email: user.email,
            role: user.role
          },
          profile: profile || { error: profileError?.message || 'No profile found' },
          adminCheck: adminCheck || { error: adminError?.message || 'No admin record found' },
          tableExists
        });

        // Even if not in admin_users table, we're enabling for your ID
        if (user.id === 'e1f9caeb-ae74-41af-984a-b44230ac7491') {
          setStatus('authorized');
        } else {
          setStatus('unauthorized');
        }
      } catch (error) {
        console.error('Debug error:', error);
        setDebugInfo({ error: 'Exception occurred' });
        setStatus('unauthorized');
      }
    };

    checkUser();
  }, [user, loading]);

  const enableAdminAccess = async () => {
    try {
      // First make sure we have admin_users table
      await supabase.rpc('create_admin_tables_if_needed');
      
      // Force add this user as admin
      const { error } = await supabase
        .from('admin_users')
        .upsert({
          user_id: user!.id,
          role: 'super_admin',
          created_at: new Date().toISOString()
        });
      
      if (error) throw error;
      
      setAdminEnabled(true);
      setTimeout(() => navigate('/admin'), 2000);
    } catch (error) {
      console.error('Error enabling admin:', error);
      alert('Error enabling admin access: ' + JSON.stringify(error));
    }
  };

  if (loading || status === 'checking') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-indigo-400">SRM Connect Admin Debug</h1>
        
        <div className="bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
          <p className="mb-2">
            Status: <span className={status === 'authorized' ? 'text-green-400' : 'text-red-400'}>
              {status === 'authorized' ? 'Authorized' : 'Unauthorized'}
            </span>
          </p>
          
          {user && (
            <div className="mb-4">
              <p>User ID: {user.id}</p>
              <p>Email: {user.email}</p>
            </div>
          )}
          
          {status === 'unauthorized' && user && user.id === 'e1f9caeb-ae74-41af-984a-b44230ac7491' && (
            <button 
              onClick={enableAdminAccess}
              disabled={adminEnabled}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded mt-4"
            >
              {adminEnabled ? 'Admin Access Granted! Redirecting...' : 'Grant Admin Access'}
            </button>
          )}
        </div>
        
        <div className="bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Debug Information</h2>
          <pre className="bg-gray-800 p-4 rounded overflow-x-auto text-xs">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
        
        <div className="mt-6 space-y-4">
          <button
            onClick={() => navigate('/dashboard')} 
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded mr-4"
          >
            Back to Dashboard
          </button>
          
          {status === 'authorized' && (
            <button
              onClick={() => navigate('/admin')} 
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
            >
              Go to Admin Panel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDebug;
