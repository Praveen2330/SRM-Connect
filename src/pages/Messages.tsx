import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { io, Socket } from 'socket.io-client';
import { Send, RefreshCw, Users, X } from 'lucide-react';
import ProfilePicture from '../components/ProfilePicture';
import { toast } from 'react-hot-toast';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  read: boolean;
  type: 'text' | 'voice' | 'photo';
  media_url?: string;
  sender_name?: string;
}

interface Profile {
  id: string;
  display_name: string | null;
  bio: string | null;
  interests: string[] | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
}

interface Conversation {
  userId: string;
  messages: Message[];
  profile: Profile | null;
}

export default function Messages() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const socketRef = useRef<Socket>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout>();
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [activeUsers, setActiveUsers] = useState<Profile[]>([]);
  const [showActiveUsers, setShowActiveUsers] = useState(false);

  // Add authentication check on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Auth error:', error);
        navigate('/login');
        return;
      }

      if (!session) {
        console.log('No session found');
        navigate('/login');
        return;
      }

      setCurrentUser(session.user);

      // Set up auth state change listener
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          navigate('/login');
          return;
        }
        setCurrentUser(session.user);
      });

      return () => {
        subscription.unsubscribe();
      };
    };

    checkAuth();
  }, [navigate]);

  // Socket.IO connection setup
  useEffect(() => {
    const setupSocket = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.error('No access token available');
          return;
        }

        // Clean up existing socket if any
        if (socketRef.current) {
          console.log('Cleaning up existing socket connection');
          socketRef.current.disconnect();
        }

        // Initialize new socket connection
        console.log('Initializing new socket connection');
        socketRef.current = io('http://localhost:3000', {
          auth: {
            token: session.access_token
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          forceNew: true,
          path: '/socket.io/',
          withCredentials: true
        });

        // Connection event handlers
        socketRef.current.on('connect', () => {
          console.log('Socket connected successfully');
          setConnectionStatus('connected');
        });

        socketRef.current.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setConnectionStatus('error');
          toast.error('Failed to connect to chat server. Retrying...');
        });

        socketRef.current.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setConnectionStatus('disconnected');
          if (reason === 'io server disconnect') {
            // Server initiated disconnect, try to reconnect
            socketRef.current?.connect();
          }
        });

        // Message event handlers
        socketRef.current.on('newMessage', (message: Message) => {
          console.log('Received new message:', message);
          setConversations(prev => {
            const otherId = message.sender_id === currentUser?.id ? message.receiver_id : message.sender_id;
            const conversation = prev[otherId] || { userId: otherId, messages: [], profile: null };
            return {
              ...prev,
              [otherId]: {
                ...conversation,
                messages: [...conversation.messages, message]
              }
            };
          });
          if (message.sender_id !== currentUser?.id) {
            toast('New message from ' + (message.sender_name || 'User'));
          }
        });

        socketRef.current.on('messageSent', (message: Message) => {
          console.log('Message sent successfully:', message);
          setError(null);
        });

        socketRef.current.on('messageError', (error: { error: string }) => {
          console.error('Message error:', error);
          toast.error(error.error || 'Failed to send message');
        });

        // Active users event handler
        socketRef.current.on('activeUsers', (users: Profile[]) => {
          console.log('Received active users update:', users);
          const currentUserId = currentUser?.id;
          if (currentUserId) {
            setActiveUsers(users.filter(user => user.id !== currentUserId));
          } else {
            setActiveUsers(users);
          }
        });

        // Cleanup on unmount
        return () => {
          if (socketRef.current) {
            console.log('Cleaning up socket connection on unmount');
            socketRef.current.disconnect();
          }
        };
      } catch (error) {
        console.error('Error setting up socket:', error);
        toast.error('Failed to initialize chat connection');
      }
    };

    setupSocket();
  }, [currentUser?.id]);

  // Fetch conversations on mount
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: messages, error } = await supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: true });

        if (error) throw error;

        // Group messages by conversation
        const conversationsMap: Record<string, Conversation> = {};
        for (const message of messages) {
          const otherId = message.sender_id === user.id ? message.receiver_id : message.sender_id;
          if (!conversationsMap[otherId]) {
            const profile = await fetchUserProfile(otherId);
            conversationsMap[otherId] = {
              userId: otherId,
              messages: [],
              profile
            };
          }
          conversationsMap[otherId].messages.push(message);
        }

        setConversations(conversationsMap);
      } catch (error) {
        console.error('Error fetching conversations:', error);
        setError('Failed to load conversations: ' + (error instanceof Error ? error.message : String(error)));
      }
    };

    fetchConversations();
  }, []);

  // Fetch user profile
  const fetchUserProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return profile;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  };

  // Update message sending to include auth check and optimistic update
  const sendMessage = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('Please log in to send messages');
        navigate('/login');
        return;
      }

      if (!socketRef.current || !currentChat || !newMessage.trim()) {
        return;
      }

      // Create optimistic message
      const optimisticMessage: Message = {
        id: Date.now().toString(),
        content: newMessage.trim(),
        type: 'text',
        sender_id: session.user.id,
        receiver_id: currentChat,
        created_at: new Date().toISOString(),
        read: false
      };

      // Add message optimistically
      setConversations(prev => ({
        ...prev,
        [currentChat]: {
          ...prev[currentChat],
          messages: [...(prev[currentChat]?.messages || []), optimisticMessage]
        }
      }));

      console.log('Sending message:', {
        content: newMessage.trim(),
        type: 'text',
        receiver_id: currentChat
      });

      // Emit the message
      socketRef.current.emit('message', {
        content: newMessage.trim(),
        type: 'text',
        receiver_id: currentChat
      });

      // Clear input
      setNewMessage('');
      setError(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  };

  // Handle finding random chat
  const handleFindRandomChat = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('findRandomChat');
    setIsSearching(true);
  };

  // Handle ending chat
  const handleEndChat = () => {
    if (!socketRef.current || !currentChat) {
      console.log('Cannot end chat:', { 
        socketConnected: !!socketRef.current, 
        currentChat 
      });
      return;
    }

    console.log('Ending chat with:', currentChat);
    socketRef.current.emit('endChat', { partnerId: currentChat });
  };

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat, conversations]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleVoiceNoteUpload(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to start recording: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  // Update handleVoiceNoteUpload to include optimistic update
  const handleVoiceNoteUpload = async (audioBlob: Blob) => {
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      if (authError || !session) {
        console.error('Authentication error:', authError);
        setError('Authentication failed. Please try logging in again.');
        return;
      }

      if (!currentChat) {
        setError('No active chat found.');
        return;
      }

      const fileName = `${Date.now()}_voice.webm`;
      const filePath = `${session.user.id}/voice-notes/${fileName}`;

      console.log('Uploading voice note to path:', filePath);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, audioBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'audio/webm'
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get the URL
      const { data: urlData, error: urlError } = await supabase.storage
        .from('chat-media')
        .createSignedUrl(filePath, 31536000); // URL valid for 1 year

      if (urlError || !urlData?.signedUrl) {
        throw new Error('Failed to generate URL');
      }

      // Create optimistic message
      const optimisticMessage: Message = {
        id: Date.now().toString(),
        content: 'Voice Note',
        type: 'voice',
        media_url: urlData.signedUrl,
        sender_id: session.user.id,
        receiver_id: currentChat,
        created_at: new Date().toISOString(),
        read: false
      };

      // Add message optimistically
      setConversations(prev => ({
        ...prev,
        [currentChat]: {
          ...prev[currentChat],
          messages: [...(prev[currentChat]?.messages || []), optimisticMessage]
        }
      }));

      // Send through socket
      if (!socketRef.current) {
        throw new Error('Socket not connected');
      }

      socketRef.current.emit('message', {
        content: 'Voice Note',
        type: 'voice',
        media_url: urlData.signedUrl,
        receiver_id: currentChat
      });

      setError(null);
    } catch (error) {
      console.error('Error uploading voice note:', error);
      setError(error instanceof Error ? error.message : 'Failed to send voice note');
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) {
        console.log('No file selected');
        return;
      }

      const file = event.target.files[0];
      console.log('Selected file:', { name: file.name, type: file.type, size: file.size });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !currentChat) {
        console.error('No user or current chat:', { user, currentChat });
        return;
      }

      // Check file type and size
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('Image size should be less than 5MB');
        return;
      }

      // Create bucket if it doesn't exist
      try {
        const { data: buckets, error: bucketsError } = await supabase
          .storage
          .listBuckets();

        if (bucketsError) throw bucketsError;

        const chatMediaBucket = buckets.find(b => b.name === 'chat-media');
        if (!chatMediaBucket) {
          const { error: createError } = await supabase
            .storage
            .createBucket('chat-media', {
              public: false,
              fileSizeLimit: 5242880, // 5MB
              allowedMimeTypes: ['image/*', 'audio/webm']
            });

          if (createError) throw createError;
        }
      } catch (error) {
        console.error('Bucket setup error:', error);
        throw new Error('Failed to setup storage bucket');
      }

      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = `${user.id}/photos/${fileName}`;

      console.log('Uploading file to path:', filePath);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('Upload successful:', uploadData);

      // Get the URL
      const { data: urlData, error: urlError } = await supabase.storage
        .from('chat-media')
        .createSignedUrl(filePath, 31536000);

      if (urlError) {
        console.error('URL generation error:', urlError);
        throw new Error(`Failed to generate URL: ${urlError.message}`);
      }

      if (!urlData?.signedUrl) {
        throw new Error('No URL generated');
      }

      console.log('Generated signed URL:', urlData.signedUrl);

      // Send message through socket
      if (!socketRef.current) {
        throw new Error('Socket not connected');
      }

      socketRef.current.emit('message', {
        content: 'Photo',
        type: 'photo',
        media_url: urlData.signedUrl,
        receiver_id: currentChat
      });

      // Optimistically add message to conversation
      const newMsg: Message = {
        id: Date.now().toString(),
        content: 'Photo',
        type: 'photo',
        media_url: urlData.signedUrl,
        sender_id: user.id,
        receiver_id: currentChat,
        created_at: new Date().toISOString(),
        read: false
      };

      setConversations(prev => ({
        ...prev,
        [currentChat]: {
          ...prev[currentChat],
          messages: [...(prev[currentChat]?.messages || []), newMsg]
        }
      }));

      // Clear the file input
      event.target.value = '';

    } catch (error) {
      console.error('Error uploading photo:', error);
      setError(error instanceof Error ? error.message : 'Failed to send photo');
      // Clear the file input on error
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  // Update the message rendering in the return statement
  const renderMessage = (message: Message) => {
    const isOwnMessage = message.sender_id === currentUser?.id;
    
    return (
      <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}>
        <div className={`max-w-[70%] ${isOwnMessage ? 'bg-blue-600' : 'bg-zinc-800'} rounded-lg px-4 py-2`}>
          {message.type === 'text' && (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
          {message.type === 'voice' && message.media_url && (
            <div className="flex items-center gap-2">
              <audio controls className="max-w-full">
                <source src={message.media_url} type="audio/webm" />
                Your browser does not support the audio element.
              </audio>
              <span className="text-sm text-gray-300">Voice message</span>
            </div>
          )}
          {message.type === 'photo' && message.media_url && (
            <div className="space-y-2">
              <img 
                src={message.media_url} 
                alt="Shared photo" 
                className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(message.media_url, '_blank')}
              />
              <span className="text-sm text-gray-300">Photo message</span>
            </div>
          )}
          <span className="text-xs text-gray-400 mt-1 block">
            {new Date(message.created_at).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  };

  // Add message input field with proper attributes
  const renderMessageInput = () => (
    <div className="flex items-center gap-2 p-4 border-t border-zinc-800">
      <input
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
        id="photo-upload"
        name="photo-upload"
      />
      <label
        htmlFor="photo-upload"
        className="p-2 hover:bg-zinc-800 rounded-full cursor-pointer transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </label>
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={`p-2 rounded-full transition-colors ${
          isRecording ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-zinc-800'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        {isRecording && (
          <span className="ml-2">{recordingTime}s</span>
        )}
      </button>
      <input
        type="text"
        value={newMessage}
        onChange={(e) => setNewMessage(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        placeholder="Type a message..."
        className="flex-1 bg-zinc-800 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
        id="message-input"
        name="message-input"
      />
      <button
        onClick={sendMessage}
        className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
      >
        <Send className="w-6 h-6" />
      </button>
    </div>
  );

  // Add effect to fetch active users
  useEffect(() => {
    const fetchActiveUsers = async () => {
      if (!currentUser) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .neq('id', currentUser.id)
          .eq('is_online', true)
          .order('last_seen', { ascending: false });

        if (error) {
          console.error('Error fetching active users:', error);
          return;
        }

        setActiveUsers(data || []);
      } catch (error) {
        console.error('Error fetching active users:', error);
      }
    };

    fetchActiveUsers();
    const interval = setInterval(fetchActiveUsers, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [currentUser]);

  // Add function to start a new conversation
  const startConversation = async (userId: string) => {
    try {
      const profile = await fetchUserProfile(userId);
      if (!profile) {
        setError('Failed to fetch user profile');
        return;
      }

      setConversations(prev => ({
        ...prev,
        [userId]: {
          userId,
          messages: [],
          profile
        }
      }));

      setCurrentChat(userId);
      setShowActiveUsers(false);
    } catch (error) {
      console.error('Error starting conversation:', error);
      setError('Failed to start conversation');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-zinc-900">
        <h1 className="text-2xl font-bold">SRM CONNECT</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowActiveUsers(!showActiveUsers)}
            className="flex items-center gap-2 bg-zinc-800 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <Users className="w-5 h-5" />
            <span>Active Users</span>
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 bg-red-600 px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            <X className="w-5 h-5" />
            <span>Exit Chat</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-12 gap-4 h-[80vh]">
          {/* Conversations sidebar */}
          <div className="col-span-4 bg-zinc-900 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Messages</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleFindRandomChat}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <>
                      <RefreshCw className="animate-spin" size={20} />
                      Finding...
                    </>
                  ) : (
                    'Random Chat'
                  )}
                </button>
              </div>
            </div>

            {showActiveUsers ? (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-gray-400 mb-2">Active Users</h3>
                {activeUsers.length === 0 ? (
                  <p className="text-gray-500 text-sm">No active users at the moment</p>
                ) : (
                  activeUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => startConversation(user.id)}
                      className="w-full p-3 rounded-lg flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                    >
                      <ProfilePicture
                        avatarUrl={user.avatar_url}
                        size="sm"
                      />
                      <div className="text-left">
                        <div className="font-semibold">
                          {user.display_name || 'Anonymous'}
                        </div>
                        <div className="text-sm text-green-500">Online</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(conversations).map(([userId, conversation]) => (
                  <button
                    key={userId}
                    onClick={() => setCurrentChat(userId)}
                    className={`w-full p-3 rounded-lg flex items-center gap-3 ${
                      currentChat === userId ? 'bg-blue-600' : 'bg-zinc-800 hover:bg-zinc-700'
                    } transition-colors`}
                  >
                    <ProfilePicture
                      avatarUrl={conversation.profile?.avatar_url || null}
                      size="sm"
                    />
                    <div className="text-left">
                      <div className="font-semibold">
                        {conversation.profile?.display_name || 'Anonymous'}
                      </div>
                      {conversation.messages.length > 0 && (
                        <div className="text-sm text-gray-400 truncate">
                          {conversation.messages[conversation.messages.length - 1].content}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chat area */}
          <div className="col-span-8 bg-zinc-900 rounded-lg p-4 flex flex-col">
            {currentChat ? (
              <>
                {/* Chat header */}
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <ProfilePicture
                      avatarUrl={conversations[currentChat]?.profile?.avatar_url || null}
                      size="md"
                    />
                    <div>
                      <h3 className="font-semibold">
                        {conversations[currentChat]?.profile?.display_name || 'Anonymous'}
                      </h3>
                      <span className="text-sm text-gray-400">
                        {connectionStatus}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleEndChat}
                    className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-full transition-colors"
                  >
                    End Chat
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto py-4 space-y-4">
                  {conversations[currentChat]?.messages.map((message) => {
                    return (
                      <div key={message.id}>
                        {renderMessage(message)}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input */}
                {renderMessageInput()}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                Select a conversation or find a random chat partner
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Active Users Sidebar */}
      {showActiveUsers && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-900 shadow-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Active Users</h3>
            <button
              onClick={() => setShowActiveUsers(false)}
              className="p-1 hover:bg-zinc-800 rounded"
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-2">
            {activeUsers.map(user => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.display_name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-xl">👤</span>
                  )}
                </div>
                <div>
                  <div className="font-medium">{user.display_name}</div>
                  <div className="text-xs text-green-500">Online</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 