import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'simple-peer';
import { supabase } from '../lib/supabase';
import { Heart, MessageCircle, X, ThumbsUp, Send } from 'lucide-react';
import { RecentActivity } from '../types/activity';

interface Message {
  id: string;
  content: string;
  from: string;
  timestamp: Date;
}

export default function VideoChat() {
  const navigate = useNavigate();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [error, setError] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Connecting to server...');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [likes, setLikes] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [currentPartnerId, setCurrentPartnerId] = useState<string | null>(null);

  const socketRef = useRef<Socket>();
  const peerRef = useRef<Peer.Instance>();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
    };

    checkAuth();
  }, [navigate]);

  useEffect(() => {
    const initializeSocket = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.error('No access token available');
          navigate('/login');
          return;
        }

        console.log('Initializing socket connection...');
        console.log('Auth token available:', !!session.access_token);
        setConnectionStatus('Connecting to server...');
        
        // Initialize socket connection with proper configuration
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
        console.log('Connecting to backend at:', backendUrl);
        
        // Ping the server first to wake it up if it's sleeping
        try {
          console.log('Pinging server to wake it up...');
          const pingResponse = await fetch(`${backendUrl}/health`);
          console.log('Server ping response:', pingResponse.status);
        } catch (pingError) {
          console.warn('Ping failed, server might be starting up:', pingError);
        }
        
        socketRef.current = io(backendUrl, {
          auth: {
            token: session.access_token
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
          forceNew: true
        });

        // Add connection event handlers
        socketRef.current.on('connect', () => {
          console.log('Connected to server with ID:', socketRef.current?.id);
          setIsConnected(true);
          setConnectionStatus('Connected to server');
          setError('');
        });

        socketRef.current.on('connect_error', (err) => {
          console.error('Connection error:', err);
          console.error('Connection error details:', err.message);
          setIsConnected(false);
          setConnectionStatus('Failed to connect to server');
          setError('Failed to connect to server. Please try again.');
        });

        socketRef.current.on('disconnect', () => {
          console.log('Disconnected from server');
          setIsConnected(false);
          setConnectionStatus('Disconnected from server');
          setError('Disconnected from server');
        });

        // Handle partner disconnection
        socketRef.current.on('partnerDisconnected', () => {
          console.log('Partner disconnected');
          if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            setRemoteStream(null);
          }
          peerRef.current?.destroy();
          setError('Your partner has disconnected');
        });
      } catch (error) {
        console.error('Socket initialization error:', error);
        setError('Failed to initialize connection. Please try again.');
      }
    };

    initializeSocket();
    
    // Set up a ping interval to keep the server awake
    const pingInterval = setInterval(() => {
      if (socketRef.current?.connected) {
        console.log('Sending keep-alive ping');
        socketRef.current.emit('ping');
      }
    }, 60000); // ping every minute

    // Cleanup function
    return () => {
      console.log('Cleaning up VideoChat component...');
      clearInterval(pingInterval);
      stopAllMediaTracks();
      socketRef.current?.disconnect();
      peerRef.current?.destroy();
    };
  }, [navigate]);

  // Separate useEffect for media initialization
  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        console.log('Got local media stream');
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to get user media:', err);
        setError('Failed to access camera and microphone. Please ensure you have granted permission.');
      }
    };

    initializeMedia();

    return () => {
      stopAllMediaTracks();
    };
  }, []);

  // Function to stop all media tracks
  const stopAllMediaTracks = () => {
    console.log('Stopping all media tracks...');
    
    // Stop local stream tracks
    if (localVideoRef.current) {
      if (localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          console.log('Stopping local track:', track.kind);
          track.enabled = false;
          track.stop();
        });
      }
      localVideoRef.current.srcObject = null;
      localVideoRef.current.pause();
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Stopping local stream track:', track.kind);
        track.enabled = false;
        track.stop();
      });
      setLocalStream(null);
    }

    // Stop remote stream tracks
    if (remoteVideoRef.current) {
      if (remoteVideoRef.current.srcObject) {
        const stream = remoteVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          console.log('Stopping remote track:', track.kind);
          track.enabled = false;
          track.stop();
        });
      }
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.pause();
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        console.log('Stopping remote stream track:', track.kind);
        track.enabled = false;
        track.stop();
      });
      setRemoteStream(null);
    }
  };

  const initializePeer = (isInitiator: boolean, partnerId: string) => {
    if (!localStream) {
      console.error('No local stream available');
      setError('No local stream available');
      return;
    }

    console.log('Initializing peer connection:', { isInitiator, partnerId });

    try {
      // Remove any existing peer connection
      if (peerRef.current) {
        peerRef.current.destroy();
      }

      peerRef.current = new Peer({
        initiator: isInitiator,
        stream: localStream,
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      // When we have a signal to send
      peerRef.current.on('signal', signal => {
        console.log('Sending signal to partner:', partnerId);
        socketRef.current?.emit('signal', {
          signal,
          to: partnerId  // Send to partner's ID
        });
      });

      // When we receive the remote stream
      peerRef.current.on('stream', stream => {
        console.log('Received remote stream');
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });

      peerRef.current.on('error', (err) => {
        console.error('Peer error:', err);
        setError('Connection error occurred');
      });

      peerRef.current.on('connect', () => {
        console.log('Peer connection established');
      });

      peerRef.current.on('close', () => {
        console.log('Peer connection closed');
        stopAllMediaTracks();
      });

      // Remove any existing signal handlers
      socketRef.current?.off('signal');

      // Handle incoming signals
      socketRef.current?.on('signal', ({ signal, from }) => {
        if (from === partnerId) {  // Only accept signals from our partner
          console.log('Received signal from partner:', from);
          peerRef.current?.signal(signal);
        }
      });

    } catch (err) {
      console.error('Error creating peer:', err);
      setError('Failed to create peer connection');
    }
  };

  const handleFindMatch = () => {
    if (!isConnected) {
      setError('Not connected to server. Please wait or refresh the page.');
      return;
    }

    if (!localStream) {
      setError('No camera/microphone access. Please grant permission and try again.');
      return;
    }

    console.log('Finding match...');
    setIsMatching(true);
    setError('');
    
    // Remove any existing peer connection
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = undefined;
    }
    
    console.log('Emitting findMatch event to server...');
    socketRef.current?.emit('findMatch');

    // Log event listeners
    console.log('Setting up matchFound listener...');
    socketRef.current?.once('matchFound', ({ roomId }) => {
      console.log('Match found! Room ID:', roomId);
      setIsMatching(false);
      const [initiatorId, partnerId] = roomId.split('-');
      const isInitiator = socketRef.current?.id === initiatorId;
      const partnerSocketId = isInitiator ? partnerId : initiatorId;
      
      console.log('Match details:', {
        isInitiator,
        myId: socketRef.current?.id,
        partnerId: partnerSocketId,
        roomId
      });
      
      setCallStartTime(new Date());
      setCurrentPartnerId(partnerSocketId);
      initializePeer(isInitiator, partnerSocketId);
    });
  };

  const handleEndCall = async () => {
    console.log('Ending call...');
    
    // Store activity data if we have a partner
    if (currentPartnerId && callStartTime) {
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - callStartTime.getTime()) / 1000); // duration in seconds
      
      const activity: RecentActivity = {
        id: Date.now().toString(),
        partnerId: currentPartnerId,
        timestamp: callStartTime,
        duration,
        likes,
        messages: messages.length
      };

      try {
        // Get existing activities
        const { data: existingData } = await supabase
          .from('recent_activities')
          .select('activities')
          .single();

        const activities = existingData?.activities || [];
        
        // Add new activity and keep only last 10
        const updatedActivities = [activity, ...activities].slice(0, 10);

        // Update activities in database
        await supabase
          .from('recent_activities')
          .upsert({ activities: updatedActivities });

      } catch (error) {
        console.error('Failed to store activity:', error);
      }
    }
    
    // Stop all media tracks first
    stopAllMediaTracks();
    
    // Destroy peer connection
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = undefined;
    }
    
    // Clean up socket listeners and disconnect
    if (socketRef.current) {
      socketRef.current.off('signal');
      socketRef.current.off('partnerDisconnected');
      socketRef.current.disconnect();
    }

    // Force cleanup of video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
      localVideoRef.current.pause();
      localVideoRef.current.load();
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
      remoteVideoRef.current.pause();
      remoteVideoRef.current.load();
    }

    // Add a small delay to ensure all cleanup operations are completed
    setTimeout(() => {
      // Navigate back to dashboard
      navigate('/dashboard');
    }, 300);
  };

  // Add event listener for beforeunload and visibility change
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('Page unload detected, stopping media tracks...');
      stopAllMediaTracks();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('Page hidden, stopping media tracks...');
        stopAllMediaTracks();
      }
    };

    const handlePopState = () => {
      console.log('Navigation detected, stopping media tracks...');
      stopAllMediaTracks();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Cleanup effect
  useEffect(() => {
    return () => {
      console.log('Component unmounting, cleaning up...');
      stopAllMediaTracks();
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = undefined;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      // Force cleanup of video elements
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        localVideoRef.current.pause();
        localVideoRef.current.load();
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        remoteVideoRef.current.pause();
        remoteVideoRef.current.load();
      }
    };
  }, []);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socketRef.current) return;

    const message: Message = {
      id: Date.now().toString(),
      content: newMessage,
      from: 'You',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, message]);
    
    // Use the correct partner ID instead of channelName
    socketRef.current.emit('chatMessage', {
      to: currentPartnerId,
      content: newMessage
    });
    
    setNewMessage('');

    // Scroll to bottom of chat
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  const handleLike = () => {
    if (!hasLiked && socketRef.current) {
      setLikes(prev => prev + 1);
      setHasLiked(true);
      
      // Use the correct partner ID instead of channelName
      socketRef.current.emit('like', {
        to: currentPartnerId
      });
    }
  };

  // Add socket listeners for chat and likes
  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on('chatMessage', ({ content, from }) => {
      const message: Message = {
        id: Date.now().toString(),
        content,
        from: 'Partner',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, message]);

      // Scroll to bottom of chat
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });

    socketRef.current.on('like', () => {
      setLikes(prev => prev + 1);
    });

    return () => {
      socketRef.current?.off('chatMessage');
      socketRef.current?.off('like');
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Connection status bar */}
      <div className={`fixed top-0 left-0 right-0 p-2 text-center text-white ${
        isConnected ? 'bg-green-500' : 'bg-yellow-500'
      }`}>
        {connectionStatus}
      </div>

      {/* SRM CONNECT tag */}
      <div className="fixed top-14 left-4 bg-zinc-900 px-4 py-2 rounded-lg shadow-lg z-50">
        <span className="text-lg font-bold text-white">SRM CONNECT</span>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-16 flex flex-col items-center">
        {/* Video container */}
        <div className="relative w-full max-w-4xl grid grid-cols-2 gap-4 mb-4">
          {/* Local video */}
          <div className="relative">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-lg bg-zinc-900"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded">
              You
            </div>
          </div>

          {/* Remote video */}
          <div className="relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg bg-zinc-900"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded">
              Partner
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            <MessageCircle size={20} />
            Chat
          </button>
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${
              hasLiked ? 'bg-pink-600' : 'bg-zinc-800 hover:bg-zinc-700'
            } transition-colors`}
            disabled={hasLiked}
          >
            <Heart size={20} className={hasLiked ? 'fill-current' : ''} />
            {likes}
          </button>
          <button
            onClick={handleEndCall}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
          >
            <X size={20} />
            End Call
          </button>
        </div>

        {/* Chat sidebar */}
        {isChatOpen && (
          <div className="fixed right-0 top-0 bottom-0 w-80 bg-zinc-900 shadow-lg p-4 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Chat</h3>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1 hover:bg-zinc-800 rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto mb-4 space-y-4"
            >
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`flex flex-col ${
                    message.from === 'You' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.from === 'You'
                        ? 'bg-blue-600'
                        : 'bg-zinc-800'
                    }`}
                  >
                    <p>{message.content}</p>
                    <span className="text-xs text-gray-400">
                      {message.from} • {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Message input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-zinc-800 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                onClick={handleSendMessage}
                className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white p-4 rounded-lg">
            {error}
          </div>
        )}

        {/* Finding match overlay */}
        {isMatching && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-xl">Looking for a match...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}