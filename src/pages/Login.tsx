import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User } from 'lucide-react';
import toast from 'react-hot-toast';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!email.endsWith('@srmist.edu.in')) {
      setError('Please use your SRM email address (@srmist.edu.in)');
      setLoading(false);
      return;
    }

    try {
      // Sign in the user
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) throw signInError;

      if (authData?.user) {
        // Fetch profile
        const { data: userProfile, error: fetchProfileError } = await supabase
          .from('profiles')
          .select('id, bio, interests')
          .eq('id', authData.user.id)
          .single();

        if (fetchProfileError) {
          // If profile doesn't exist, create it
          const { error: createProfileError } = await supabase
            .from('profiles')
            .insert([
              {
                id: authData.user.id,
                display_name: email.split('@')[0],
                is_online: true,
                last_seen: new Date().toISOString()
              }
            ]);
          if (createProfileError) throw createProfileError;
          toast.success('Profile created. Please complete your profile.');
          navigate('/profile');
          return;
        }

        // Update last seen and online status
        await supabase
          .from('profiles')
          .update({ 
            is_online: true,
            last_seen: new Date().toISOString()
          })
          .eq('id', authData.user.id);

        if (!userProfile?.bio || !userProfile?.interests || userProfile.interests.length === 0) {
          toast.success('Please complete your profile.');
          navigate('/profile');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (error) {
      // Log everything for debugging
      console.error('Login error:', error);
      if (typeof error === 'object' && error !== null && 'message' in error) {
        setError((error as any).message || 'Login failed.');
      } else if (typeof error === 'string') {
        setError(error);
      } else {
        setError('An unknown error occurred during login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };


  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!displayName) {
      setError('Please enter a display name');
      setLoading(false);
      return;
    }

    if (!email.endsWith('@srmist.edu.in')) {
      setError('Please use your SRM email address (@srmist.edu.in)');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      // Check for display name uniqueness (case-insensitive)
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .ilike('display_name', displayName)
        .single();

      if (existingUser) {
        setError('This display name is already taken. Please choose another one.');
        setLoading(false);
        return;
      }

      // Create the user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: displayName
          }
        }
      });

      if (signUpError) throw signUpError;

      if (data?.user) {
        toast.success('Account created successfully! Please check your email for verification.');
        setIsSignUp(false); // Switch back to login view
        setEmail('');
        setPassword('');
        setDisplayName('');
        setError(null);
      }
    } catch (err) {
      console.error('Signup error:', err);
      if (err instanceof Error) {
        if (err.message.includes('User already registered')) {
          setError('An account with this email already exists. Please sign in.');
        } else if (err.message.includes('database')) {
          setError('Unable to create account. Please try again or contact support.');
        } else {
          setError(err.message);
        }
      } else {
        setError('An error occurred during signup. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900 rounded-xl p-8">
        <h2 className="text-3xl font-bold text-center mb-8">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>
        {error && (
          <div className={`border rounded-lg p-3 mb-6 ${
            error.startsWith('Success!') 
              ? 'bg-green-500/10 border-green-500 text-green-500'
              : 'bg-red-500/10 border-red-500 text-red-500'
          }`}>
            {error}
          </div>
        )}
        <form onSubmit={isSignUp ? handleSignUp : handleSubmit} className="space-y-6">
          {isSignUp && (
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium mb-2">
                Display Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full bg-black border border-zinc-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-white"
                  required={isSignUp}
                  disabled={loading}
                />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              SRM Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.name@srmist.edu.in"
                className="w-full bg-black border border-zinc-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-white"
                required
                pattern=".+@srmist\.edu\.in"
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-zinc-700 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-white"
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            {isSignUp && (
              <p className="text-sm text-gray-400 mt-1">
                Password must be at least 6 characters long
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              className="w-full bg-white text-black py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setEmail('');
                setPassword('');
                setDisplayName('');
              }}
              className="w-full bg-transparent border border-white text-white py-2 rounded-lg font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;