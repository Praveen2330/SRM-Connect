import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import socketIO from 'socket.io-client';
import { 
  Send, RefreshCw, Flag, ThumbsUp, X, Clock, 
  Shield, Eye, EyeOff
} from 'lucide-react';

import { toast } from 'react-hot-toast';

// Use environment variable for development, but always use Render Socket.IO server in production
const SOCKET_URL =
  import.meta.env.MODE === 'production'
    ? 'https://srm-connect-socketio.onrender.com'
    : (import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3002');

interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  timestamp: number;
  senderName?: string;
}

interface Profile {
  id: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

export default function InstantChat() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [showConnectionRequest, setShowConnectionRequest] = useState(false);
  const [connectionRequested, setConnectionRequested] = useState(false);
  const [connectionAccepted, setConnectionAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<number>(0);
  
  const socketRef = useRef<any>(null);
  const chatSessionIdRef = useRef<string | null>(null);
  const timerRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        fetchUserProfile(session.user.id);
      } else {
        navigate('/login');
      }
    };

    fetchCurrentUser();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [navigate]);
  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data) {
        setUserProfile(data);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };
  useEffect(() => {
    const setupSocket = async () => {
      if (!currentUser) return;

      try {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }

        const socketUrl = SOCKET_URL;
        console.log('Connecting to Socket.IO server at:', socketUrl);

        socketRef.current = socketIO(socketUrl, {
          query: { userId: currentUser.id },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 20000,
          autoConnect: true,
          forceNew: true
        });
        socketRef.current.on('connect', () => {
          console.log('Connected to instant chat server');
          toast.success('Connected to chat server');
          setError(null);
          
          socketRef.current.emit('get_active_users');
        });
        socketRef.current.on('active_users_count', (count: number) => {
          console.log('Active users count:', count);
          setActiveUsers(count);
        });

        socketRef.current.on('connect_error', (error: any) => {
          console.error('Socket connection error:', error);
          setError('Failed to connect to chat server. Please try again later.');
        });
        socketRef.current.on('match-found', (data: any) => {
          setIsSearching(false);
          setPartner({
            id: data.partnerId,
            display_name: data.partnerProfile?.display_name || 'Anonymous User',
            avatar_url: data.partnerProfile?.avatar_url
          });
          chatSessionIdRef.current = data.sessionId;
          if (data.timerSeconds) {
            const endTime = Date.now() + (data.timerSeconds * 1000);
            
            if (timerRef.current) {
              clearInterval(timerRef.current);
            }
            
            timerRef.current = setInterval(() => {
              const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
              setRemainingTime(remaining);
              
              if (remaining <= 0) {
                clearInterval(timerRef.current);
                toast('Chat time expired');
                endChat();
              }
            }, 1000);
          }
          setMessages([{
            id: 'system-connected',
            content: `You are now chatting with ${data.partnerProfile?.display_name || 'a new user'}`,
            senderId: 'system',
            timestamp: Date.now()
          }]);
        });
        socketRef.current.on('no-match-found', () => {
          setIsSearching(false);
          toast.error('No chat partners available. Please try again later.');
        });
        socketRef.current.on('chat-message', (message: any) => {
          setMessages(prev => [...prev, {
            id: message.id,
            content: message.message,
            senderId: message.from,
            timestamp: message.timestamp,
            senderName: message.senderName
          }]);
        });
        socketRef.current.on('chat-ended', (data: any) => {
          toast(data.reason || 'Chat ended');
          setPartner(null);
          
          if (timerRef.current) {
            clearInterval(timerRef.current);
            setRemainingTime(null);
          }
          
          setMessages(prev => [...prev, {
            id: 'system-ended',
            content: 'Chat ended',
            senderId: 'system',
            timestamp: Date.now()
          }]);
        });
        socketRef.current.on('partner-disconnected', () => {
          toast('Your chat partner disconnected');
          setPartner(null);
          
          if (timerRef.current) {
            clearInterval(timerRef.current);
            setRemainingTime(null);
          }
          
          setMessages(prev => [...prev, {
            id: 'system-disconnected',
            content: 'Your chat partner disconnected',
            senderId: 'system',
            timestamp: Date.now()
          }]);
        });
        socketRef.current.on('report-received', (data: any) => {
          if (data.success) {
            toast.success('Report submitted successfully');
          } else {
            toast.error(`Failed to submit report: ${data.error || 'Unknown error'}`);
          }
        });
        socketRef.current.on('connection-request', () => {
          setShowConnectionRequest(true);
        });

        socketRef.current.on('connection-accepted', () => {
          setConnectionAccepted(true);
          toast.success('Connection request accepted!');
        });

        socketRef.current.on('connection-rejected', () => {
          toast.error('Connection request rejected');
        });

      } catch (error: any) {
        console.error('Error setting up socket:', error);
        setError(`Failed to initialize chat connection: ${error.message}`);
      }
    };

    setupSocket();
  }, [currentUser]);
  const findChatPartner = () => {
    if (!socketRef.current) {
      toast.error('Not connected to chat server');
      return;
    }

    setIsSearching(true);
    setPartner(null);
    setMessages([]);
    setConnectionRequested(false);
    setConnectionAccepted(false);
    socketRef.current.emit('join_instant_chat_queue', {
      userId: currentUser.id,
      displayName: anonymousMode ? 'Anonymous User' : (userProfile?.display_name || currentUser.email),
      preferences: {}
    });
    
    toast('Looking for a chat partner...');
  };
  const sendMessage = () => {
    if (!newMessage.trim() || !socketRef.current || !partner) return;
    
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const messageObj = {
      id: messageId,
      content: newMessage,
      senderId: currentUser.id,
      timestamp: Date.now(),
      senderName: anonymousMode ? 'Anonymous' : (userProfile?.display_name || 'You')
    };
    setMessages(prev => [...prev, messageObj]);
    socketRef.current.emit('chat-message', {
      message: newMessage,
      to: partner.id,
      from: currentUser.id,
      senderName: anonymousMode ? 'Anonymous' : (userProfile?.display_name || 'User')
    });
    setNewMessage('');
  };
  const endChat = () => {
    if (!socketRef.current || !partner) return;
    
    socketRef.current.emit('end-chat', {
      partnerId: partner.id
    });
    
    setPartner(null);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      setRemainingTime(null);
    }
    setTimeout(() => {
      if (!showReportModal) {
        setMessages([]);
      }
    }, 500);
  };
  const skipAndFindNew = () => {
    endChat();
    findChatPartner();
  };
  const reportPartner = async () => {
    if (!socketRef.current || !partner) {
      toast.error('Cannot report: No active chat');
      return;
    }
    const loadingToast = toast.loading('Submitting report...');

    try {
      const simpleTranscript = messages.map(msg => (
        `${msg.senderName || 'User'}: ${msg.content}`
      ));
      
      console.log('Sending report via Socket.IO...');
      socketRef.current.emit('report-user', {
        reporterId: currentUser.id,
        reportedId: partner.id,
        sessionId: chatSessionIdRef.current || 'unknown',
        reason: reportReason,
        description: reportDescription,
        transcript: simpleTranscript,
        timestamp: new Date().toISOString()
      });
      const reportPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Report submission timed out'));
        }, 5000);
        socketRef.current?.once('report-received', (response: any) => {
          clearTimeout(timeout);
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Failed to submit report'));
          }
        });
      });
      await reportPromise;
      toast.dismiss(loadingToast);
      toast.success('Report submitted successfully');
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
      skipAndFindNew();
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report: ' + (error.message || 'Unknown error'));
    }
  };
  const requestConnection = () => {
    if (!socketRef.current || !partner) return;
    
    socketRef.current.emit('connection-request', {
      to: partner.id
    });
    
    setConnectionRequested(true);
    toast('Connection request sent');
  };
  const acceptConnection = async () => {
    if (!socketRef.current || !partner) return;
    
    try {
      try {
        await supabase
          .from('chat_connections')
          .insert([{
            user1_id: currentUser.id,
            user2_id: partner.id
          }]);
      } catch (error) {
        console.error('Error saving connection to database:', error);
      }
      socketRef.current.emit('connection-accepted', {
        to: partner.id
      });
      
      setConnectionAccepted(true);
      setShowConnectionRequest(false);
      toast.success('Connection accepted!');
    } catch (error) {
      console.error('Error accepting connection:', error);
      toast.error('Failed to accept connection');
    }
  };
  const rejectConnection = () => {
    if (!socketRef.current || !partner) return;
    
    socketRef.current.emit('connection-rejected', {
      to: partner.id
    });
    
    setShowConnectionRequest(false);
    toast('Connection request rejected');
  };


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      <header className="bg-zinc-900 p-4 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-xl font-bold mr-4">Instant Chat</h1>
          <div className="bg-indigo-900/40 px-3 py-1 rounded-full flex items-center text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            <span>{activeUsers} active users</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {partner && (
            <button
              onClick={() => setShowReportModal(true)}
              className="p-2 text-red-500 hover:bg-zinc-800 rounded-full"
              title="Report user"
            >
              <Flag size={20} />
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
          >
            Exit
          </button>
        </div>
      </header>
      
      <div className="flex-grow flex flex-col p-4 max-w-6xl mx-auto w-full">

        <div className="bg-zinc-900 p-3 rounded-lg mb-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="mr-3">
              {partner ? (
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${error ? 'bg-red-500' : 'bg-green-500'}`}></div>
                  <span>Chatting with: {partner.display_name}</span>
                </div>
              ) : isSearching ? (
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                  <span>Finding a chat partner...</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-gray-500 mr-2"></div>
                  <span>Not connected</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {remainingTime !== null && (
              <div className="flex items-center text-sm">
                <Clock size={16} className="mr-1" />
                <span>{formatTime(remainingTime)}</span>
              </div>
            )}
            
            <button
              onClick={() => setAnonymousMode(!anonymousMode)}
              className="p-2 text-gray-400 hover:text-white rounded-full"
              title={anonymousMode ? "Anonymous mode on" : "Anonymous mode off"}
            >
              {anonymousMode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-900/50 border border-red-700 p-3 rounded-lg mb-4">
            <p className="text-red-300">{error}</p>
          </div>
        )}
        
        <div className="flex-grow bg-zinc-900 rounded-lg mb-4 overflow-hidden flex flex-col">

          <div className="flex-grow p-4 overflow-y-auto">
            {messages.length === 0 && !isSearching && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <Shield size={48} className="text-zinc-700 mb-4" />
                <h3 className="text-xl font-bold mb-2">Instant Chat</h3>
                <p className="text-zinc-400 mb-6 max-w-md">
                  Connect with other users for a quick chat. Be respectful and follow our community guidelines.
                </p>
                <button
                  onClick={findChatPartner}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium"
                >
                  Find a Chat Partner
                </button>
              </div>
            )}
            
            {isSearching && messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                <p className="text-zinc-300">Looking for someone to chat with...</p>
              </div>
            )}
            
            {messages.length > 0 && (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.senderId === currentUser?.id ? 'justify-end' : message.senderId === 'system' ? 'justify-center' : 'justify-start'}`}
                  >
                    {message.senderId === 'system' ? (
                      <div className="bg-zinc-800 px-3 py-1 rounded-full text-sm text-zinc-400">
                        {message.content}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          message.senderId === currentUser?.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-800 text-white'
                        }`}
                      >
                        {message.senderId !== currentUser?.id && message.senderName && (
                          <div className="text-xs text-zinc-400 mb-1">{message.senderName}</div>
                        )}
                        <p>{message.content}</p>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          
          {partner && (
            <div className="p-3 border-t border-zinc-800">
              <div className="flex">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-grow bg-zinc-800 rounded-l-lg px-4 py-2 focus:outline-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 rounded-r-lg px-4 py-2 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          )}
          
          {partner && (
            <div className="p-3 border-t border-zinc-800 flex justify-between">
              <div>
                <button
                  onClick={endChat}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center"
                >
                  <X size={18} className="mr-2" />
                  End Chat
                </button>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={skipAndFindNew}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg flex items-center"
                >
                  <RefreshCw size={18} className="mr-2" />
                  Skip
                </button>


                
                <button
                  onClick={requestConnection}
                  disabled={connectionRequested || connectionAccepted}
                  className={`px-4 py-2 rounded-lg flex items-center ${
                    connectionAccepted
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <ThumbsUp size={18} className="mr-2" />
                  {connectionAccepted
                    ? 'Connected'
                    : connectionRequested
                    ? 'Requested'
                    : 'Request Connection'}
                </button>
              </div>
            </div>
          )}
          
          {!partner && !isSearching && (
            <div className="p-3 border-t border-zinc-800">
              <button
                onClick={findChatPartner}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium"
              >
                Find a Chat Partner
              </button>
            </div>
          )}
          
          {isSearching && !partner && (
            <div className="p-3 border-t border-zinc-800">
              <button
                onClick={() => setIsSearching(false)}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium"
              >
                Cancel Search
              </button>
            </div>
          )}
        </div>
      </div>
      
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center text-red-500 mb-4">
              <Shield size={24} className="mr-2" />
              <h3 className="text-xl font-bold">Report User</h3>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Reason for report</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full bg-zinc-800 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Select a reason</option>
                <option value="Inappropriate content">Inappropriate content</option>
                <option value="Harassment">Harassment</option>
                <option value="Spam">Spam</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Description (optional)</label>
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                className="w-full bg-zinc-800 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[100px]"
                placeholder="Please provide additional details..."
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={reportPartner}
                disabled={!reportReason}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
      {showConnectionRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Connection Request</h3>
            <p className="mb-6">Your chat partner would like to connect with you. Accepting will allow you to find each other later.</p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={rejectConnection}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Decline
              </button>
              <button
                onClick={acceptConnection}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
