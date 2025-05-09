import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Profile from './pages/Profile';
import VideoChat from './pages/VideoChat';
import Messages from './pages/Messages';
import Settings from './pages/Settings';
import Rules from './pages/Rules';
import Admin from './pages/Admin';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabaseClient';

// 404 Page Component
const NotFound = () => (
  <div className="min-h-screen bg-black text-white flex items-center justify-center flex-col">
    <h1 className="text-4xl mb-4">404 - Page Not Found</h1>
    <p className="mb-4">The page you're looking for doesn't exist.</p>
    <a href="/dashboard" className="text-blue-500 hover:text-blue-400">
      Return to Dashboard
    </a>
  </div>
);

// Require Authentication for protected routes
const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

// Require Admin Authentication
const RequireAdmin = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsChecking(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (error) throw error;
        
        setIsAdmin(!!data);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setIsChecking(false);
      }
    };
    
    checkAdminStatus();
  }, [user]);
  
  if (loading || isChecking) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }
  
  if (!user || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-black text-white">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/video-chat" element={<RequireAuth><VideoChat /></RequireAuth>} />
            <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/rules" element={<RequireAuth><Rules /></RequireAuth>} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;