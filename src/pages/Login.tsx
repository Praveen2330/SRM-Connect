import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User } from 'lucide-react';

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

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!displayName && isSignUp) {
      setError('Please enter a display name');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: displayName
          },
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (error) throw error;
      setError('Check your email for the confirmation link');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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
          <div className="bg-red-500/10 border border-red-500 text-red-500 rounded-lg p-3 mb-6">
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
                disabled={loading}
              />
            </div>
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
              onClick={() => setIsSignUp(!isSignUp)}
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