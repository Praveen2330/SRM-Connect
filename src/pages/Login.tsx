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

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;

      // Wait for the OAuth redirect to complete
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) throw sessionError;
      
      if (session?.user) {
        const userEmail = session.user.email;
        
        // Check if the email is an SRM email
        if (!userEmail?.endsWith('@srmist.edu.in')) {
          // Sign out the user if they don't have an SRM email
          await supabase.auth.signOut();
          setError('Please use your SRM email address (@srmist.edu.in) to sign in.');
          return;
        }

        // Check if profile exists
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code === 'PGRST116') {
          // Create profile if it doesn't exist
          const { error: createProfileError } = await supabase
            .from('profiles')
            .insert([
              {
                id: session.user.id,
                display_name: session.user.user_metadata.full_name || session.user.email?.split('@')[0],
                avatar_url: session.user.user_metadata.avatar_url,
                is_new_user: true, // Add flag for new users
              }
            ]);

          if (createProfileError) {
            console.error('Error creating profile:', createProfileError);
          }

          toast.success('Account created successfully! Please complete your profile.');
          navigate('/profile'); // Redirect new users to profile page first
        } else {
          // Check if user has completed profile and rules
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('is_new_user, has_accepted_rules')
            .eq('id', session.user.id)
            .single();

          if (userProfile?.is_new_user) {
            if (!userProfile.has_accepted_rules) {
              navigate('/rules'); // Redirect to rules if not accepted
            } else {
              navigate('/profile'); // Redirect to profile if rules accepted but profile incomplete
            }
          } else {
            toast.success('Successfully logged in!');
            navigate('/dashboard'); // Existing users go directly to dashboard
          }
        }
      }
    } catch (err) {
      console.error('Google sign in error:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An error occurred during Google sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Sign in the user
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) throw signInError;

      if (authData?.user) {
        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          // Create profile if it doesn't exist
          const { error: createProfileError } = await supabase
            .from('profiles')
            .insert([
              {
                id: authData.user.id,
                display_name: email.split('@')[0],
                is_new_user: true, // Add flag for new users
              }
            ]);

          if (createProfileError) {
            console.error('Error creating profile:', createProfileError);
          }

          toast.success('Account created successfully! Please complete your profile.');
          navigate('/profile'); // Redirect new users to profile page first
        } else {
          // Check if user has completed profile and rules
          if (profile.is_new_user) {
            if (!profile.has_accepted_rules) {
              navigate('/rules'); // Redirect to rules if not accepted
            } else {
              navigate('/profile'); // Redirect to profile if rules accepted but profile incomplete
            }
          } else {
            toast.success('Successfully logged in!');
            navigate('/dashboard'); // Existing users go directly to dashboard
          }
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err instanceof Error) {
        if (err.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.');
        } else {
          setError(err.message);
        }
      } else {
        setError('An error occurred during login. Please try again.');
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
      // First check if user already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('display_name', displayName)
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
              onClick={handleGoogleSignIn}
              className="w-full bg-[#4285F4] text-white py-2 rounded-lg font-semibold hover:bg-[#357ABD] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={loading}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isSignUp ? 'Sign up with Google' : 'Sign in with Google'}
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