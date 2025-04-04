import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Moon, Sun, Book, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

function Settings() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(true);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
    // You can implement theme switching logic here
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-12">Settings</h1>

        <div className="space-y-6">
          {/* Profile Section */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/profile')}>
              <User className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-semibold">Profile Settings</h2>
                <p className="text-gray-400">Manage your profile information and preferences</p>
              </div>
            </div>
          </div>

          {/* Theme Section */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {darkMode ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                <div>
                  <h2 className="text-xl font-semibold">Theme</h2>
                  <p className="text-gray-400">Switch between light and dark mode</p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className="bg-zinc-800 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors"
              >
                {darkMode ? 'Switch to Light' : 'Switch to Dark'}
              </button>
            </div>
          </div>

          {/* Rules and Regulations */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/rules')}>
              <Book className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-semibold">Rules and Regulations</h2>
                <p className="text-gray-400">View community guidelines and terms of service</p>
              </div>
            </div>
          </div>

          {/* Sign Out */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <LogOut className="w-6 h-6 text-red-500" />
                <div>
                  <h2 className="text-xl font-semibold">Sign Out</h2>
                  <p className="text-gray-400">Log out from your account</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings; 