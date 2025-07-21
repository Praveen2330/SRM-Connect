import React, { createContext, useEffect, useState, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AdminRole = 'viewer' | 'moderator' | 'super_admin';

interface AdminStatus {
  isAdmin: boolean;
  role?: AdminRole;
  lastChecked: Date;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  adminStatus: AdminStatus | null;
  checkAdminStatus: () => Promise<AdminStatus>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);

  useEffect(() => {
    // Check active sessions and sets the user
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('Error getting session:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setAdminStatus(null);
  };

  // Centralized admin status check function
  const checkAdminStatus = async (): Promise<AdminStatus> => {
    if (!user) {
      const status = { isAdmin: false, lastChecked: new Date() };
      setAdminStatus(status);
      return status;
    }
    
    // PERMANENT SOLUTION: Check for specific admin user ID
    if (user.id === 'e1f9caeb-ae74-41af-984a-b44230ac7491') {
      console.log('PERMANENT ADMIN ACCESS GRANTED TO:', user.email);
      const status = { isAdmin: true, role: 'super_admin' as AdminRole, lastChecked: new Date() };
      setAdminStatus(status);
      return status;
    }
    
    try {
      // Standard check in the admin_users table
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Admin check error:', error);
        const status = { isAdmin: false, lastChecked: new Date() };
        setAdminStatus(status);
        return status;
      }
      
      if (data) {
        console.log('User is admin with role:', data.role);
        const status = { isAdmin: true, role: data.role, lastChecked: new Date() };
        setAdminStatus(status);
        return status;
      } else {
        console.log('User is not an admin');
        const status = { isAdmin: false, lastChecked: new Date() };
        setAdminStatus(status);
        return status;
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      const status = { isAdmin: false, lastChecked: new Date() };
      setAdminStatus(status);
      return status;
    }
  };

  // Auto-check admin status when user changes
  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  const value = {
    session,
    user,
    loading,
    signOut,
    adminStatus,
    checkAdminStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
