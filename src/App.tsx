import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Profile from './pages/Profile';
// Import VideoChat component directly and suppress the type error
// @ts-ignore - VideoChat is exported as default but TypeScript doesn't recognize it
import VideoChat from './pages/VideoChat';
import Messages from './pages/Messages';
import InstantChat from './pages/InstantChat';
import ChatReports from './pages/ChatReports';
import Settings from './pages/Settings';
import Rules from './pages/Rules';
import Admin from './pages/Admin';
import AdminDebug from './pages/AdminDebug';
import DirectAdmin from './pages/DirectAdmin';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';

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

// Require Admin Authentication - Using our permanent solution from AuthContext
const RequireAdmin = ({ children }: { children: JSX.Element }) => {
  const { user, loading, adminStatus, checkAdminStatus } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const verifyAdminAccess = async () => {
      if (!user) {
        setIsChecking(false);
        return;
      }
      
      try {
        // Use the centralized admin status checking from AuthContext
        const status = await checkAdminStatus();
        
        console.log('Admin status verified:', status);
        
        if (!status.isAdmin) {
          // If not admin, check if we should show an error message
          if (status.lastChecked && new Date().getTime() - status.lastChecked.getTime() < 5000) {
            // Recently checked and failed, likely a database issue
            setError('Unable to verify admin status. This may be due to database access issues.');
          }
        }
      } catch (error) {
        console.error('Admin verification error:', error);
        setError('Failed to verify admin status');
      } finally {
        setIsChecking(false);
      }
    };
    
    verifyAdminAccess();
  }, [user, checkAdminStatus]);
  
  if (loading || isChecking) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center flex-col p-8">
        <h1 className="text-2xl font-bold mb-4">Admin Access Error</h1>
        <p className="mb-4">{error}</p>
        <div className="flex space-x-4">
          <a href="/dashboard" className="text-indigo-400 hover:text-indigo-300">
            Return to Dashboard
          </a>
          <a href="/direct-admin" className="text-green-400 hover:text-green-300">
            Use Direct Admin
          </a>
        </div>
      </div>
    );
  }
  
  if (!user || !adminStatus?.isAdmin) {
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
            <Route path="/instant-chat" element={<RequireAuth><InstantChat /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/rules" element={<RequireAuth><Rules /></RequireAuth>} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
            <Route path="/chat-reports" element={<RequireAdmin><ChatReports /></RequireAdmin>} />
            <Route path="/admin-debug" element={<AdminDebug />} />
            <Route path="/direct-admin" element={<DirectAdmin />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;