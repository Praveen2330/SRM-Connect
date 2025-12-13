import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Moon, Sun, Book, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ArrowLeft } from 'lucide-react';

function Settings() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(true);
  const [displayName, setDisplayName] = useState<string>('Loading...');

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Prefer display_name, fallback to email prefix
        const name =
          (user.user_metadata && user.user_metadata.display_name) ||
          (user.email ? user.email.split('@')[0] : 'User');

        setDisplayName(name);
      }
    };

    loadProfile();
  }, []);

  const containerClasses = darkMode
  ? 'min-h-screen bg-black text-white p-8'
  : 'min-h-screen bg-white text-black p-8';

const cardClasses = darkMode
  ? 'bg-zinc-900 p-6 rounded-xl'
  : 'bg-zinc-100 p-6 rounded-xl';

const secondaryTextClasses = darkMode ? 'text-gray-400' : 'text-gray-600';

const themeButtonClasses = darkMode
  ? 'bg-zinc-800 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors'
  : 'bg-zinc-200 px-4 py-2 rounded-lg hover:bg-zinc-300 transition-colors';

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const toggleTheme = () => {
    setDarkMode((prev) => !prev);
  };

  return (
    <div className={containerClasses}>

    {/* Top Bar with Back + Heading */}
    <div className="flex items-center justify-center relative mb-8">
      {/* Back Button */}
      <button
        onClick={() => navigate('/dashboard')}
        className="absolute left-0 flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </button>
  
      {/* Center Heading */}
      <h1 className="text-2xl font-semibold">Settings</h1>
    </div>
    
        <div className="max-w-4xl mx-auto">

        <div className="space-y-6">
          {/* Profile Section */}
          <div className={cardClasses}>
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/profile')}>
              <User className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-semibold">Profile Settings</h2>
                <p className={secondaryTextClasses}>{displayName}</p>
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
                className={themeButtonClasses}
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
                className={darkMode
                  ? 'bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-white'
                  : 'bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-white'}
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