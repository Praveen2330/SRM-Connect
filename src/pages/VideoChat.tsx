import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'simple-peer';
import { supabase } from '../lib/supabase';
import { Heart, MessageCircle, X, Send } from 'lucide-react';
import { RecentActivity } from '../types/activity';

interface Message {
  id: string;
  content: string;
  timestamp: Date;
  from: 'You' | 'Partner';
}

interface SignalData {
  signal: any;
  from: string;
}

interface ChatMessage {
  content: string;
  from: string;
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

  // Initialize media function with retries
  const initializeMedia = async () => {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Requesting media permissions (attempt ${attempt}/${maxRetries})...`);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });

        console.log('Media permissions granted, checking stream...', {
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length
        });

        // Verify we have both audio and video tracks
        if (!stream.getAudioTracks().length || !stream.getVideoTracks().length) {
          throw new Error('Stream is missing audio or video tracks');
        }

        // Set up the stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setLocalStream(stream);
        setError('');
        
        console.log('Media initialization successful');
        return stream;
      } catch (error) {
        console.error(`Media initialization attempt ${attempt} failed:`, error);
        lastError = error;
        
        // Wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    console.error('All media initialization attempts failed');
    setError('Failed to access camera and microphone. Please check permissions.');
    throw lastError;
  };

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

  // Function to stop all media tracks
  const stopAllMediaTracks = () => {
    console.log('Stopping all media tracks...');
    
    // Stop local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log(`Stopping local stream track: ${track.kind}`);
        track.stop();
      });
      setLocalStream(null);
    }
    
    // Stop remote stream tracks
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        console.log(`Stopping remote stream track: ${track.kind}`);
        track.stop();
      });
      setRemoteStream(null);
    }

    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log('Page hidden, checking stream status...', {
          isMatching,
          hasRemoteStream: !!remoteStream,
          hasLocalStream: !!localStream
        });
        
        // Keep media active if we're matching or in a call
        if (isMatching || remoteStream) {
          console.log('Keeping media tracks active (matching or in call)');
        } else {
          console.log('No active call or matching, stopping media tracks...');
          stopAllMediaTracks();
        }
      } else {
        console.log('Page visible, checking if media reinitialization needed...');
        // Reinitialize if we're matching or in a call but don't have a stream
        if ((isMatching || remoteStream) && !localStream) {
          console.log('Reinitializing media...');
          try {
            await initializeMedia();
          } catch (error) {
            console.error('Failed to reinitialize media:', error);
            setError('Failed to reinitialize camera. Please refresh the page.');
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isMatching, localStream, remoteStream]);

  // Initialize media on component mount
  useEffect(() => {
    console.log('Initializing media on component mount...');
    initializeMedia().catch(error => {
      console.error('Failed to initialize media on mount:', error);
    });

    return () => {
      console.log('Cleaning up media on unmount...');
      stopAllMediaTracks();
    };
  }, []);

  // Remove the duplicate visibility change handler
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('Page unload detected, stopping media tracks...');
      stopAllMediaTracks();
      if (socketRef.current) {
        socketRef.current.disconnect();
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
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Socket connection setup
  useEffect(() => {
    const initializeSocket = async () => {
      try {
        console.log('Initializing socket connection...');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.error('No access token available');
          setError('Please log in to use video chat');
          return;
        }

        const backendUrl = import.meta.env.VITE_BACKEND_URL;
        console.log('Connecting to backend at:', backendUrl);

        // Try to ping the server first
        try {
          console.log('Pinging server attempt 1...');
          const response = await fetch(`${backendUrl}/health`, {
            credentials: 'include'
          });
          if (response.ok) {
            console.log('Server is awake and responding');
          } else {
            console.error('Server health check failed:', response.status);
            throw new Error('Server health check failed');
          }
        } catch (error) {
          console.error('Server ping failed:', error);
          setError('Unable to connect to video chat server. Please try again later.');
          return;
        }

        // Initialize socket connection with retry logic
        const socket = io(backendUrl, {
          auth: {
            token: session.access_token
          },
          query: {
            userId: session.user.id
          },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 3,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 10000,
          withCredentials: true,
          forceNew: true
        });

        socket.on('connect', () => {
          console.log('Socket connected successfully');
          setConnectionStatus('Connected to server');
          setIsConnected(true);
          setError('');
        });

        socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setError(`Failed to connect to video chat server: ${error.message}`);
          setIsConnected(false);
        });

        socket.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setConnectionStatus(`Disconnected from server: ${reason}`);
          setIsConnected(false);
          if (reason === 'io server disconnect') {
            // Server disconnected us, try to reconnect
            socket.connect();
          }
        });

        socketRef.current = socket;
      } catch (error) {
        console.error('Socket initialization error:', error);
        setError('Failed to initialize video chat. Please try again.');
      }
    };

    initializeSocket();

    return () => {
      if (socketRef.current) {
        console.log('Cleaning up socket connection...');
        socketRef.current.disconnect();
      }
    };
  }, []);

  const initializePeer = async (isInitiator: boolean, partnerId: string) => {
    if (!localStream) {
      throw new Error('No local stream available for peer connection');
    }

    console.log('Initializing peer connection:', { isInitiator, partnerId });

    try {
      // Remove any existing peer connection
      if (peerRef.current) {
        peerRef.current.destroy();
      }

      const peerOptions = {
        initiator: isInitiator,
        stream: localStream,
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            {
              urls: 'turn:global.turn.twilio.com:3478',
              username: 'your_username',  // Replace with your TURN server credentials
              credential: 'your_credential'
            }
          ]
        }
      };

      peerRef.current = new Peer(peerOptions);

      // When we have a signal to send
      peerRef.current.on('signal', signal => {
        console.log('Sending signal to partner:', partnerId);
        socketRef.current?.emit('signal', {
          signal,
          to: partnerId
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
        setError('Connection error occurred. Please try again.');
      });

      peerRef.current.on('connect', () => {
        console.log('Peer connection established successfully');
        setError(''); // Clear any existing errors
      });

      peerRef.current.on('close', () => {
        console.log('Peer connection closed');
        stopAllMediaTracks();
      });

      // Remove any existing signal handlers
      socketRef.current?.off('signal');

      // Handle incoming signals
      socketRef.current?.on('signal', ({ signal, from }: SignalData) => {
        if (from === partnerId) {
          console.log('Received signal from partner:', from);
          try {
            peerRef.current?.signal(signal);
          } catch (error) {
            console.error('Error processing signal:', error);
            setError('Failed to process connection signal. Please try again.');
          }
        }
      });

    } catch (err) {
      console.error('Error creating peer:', err);
      throw new Error('Failed to create peer connection');
    }
  };

  const handleFindMatch = async () => {
    if (!isConnected) {
      setError('Not connected to server. Please wait or refresh the page.');
      return;
    }

    try {
      setIsMatching(true);
      setError('');

      // Ensure we have a local stream before finding a match
      if (!localStream) {
        console.log('No local stream, initializing media...');
        const stream = await initializeMedia();
        if (!stream) {
          throw new Error('Failed to initialize media stream');
        }
      } else {
        console.log('Using existing local stream:', {
          audioTracks: localStream.getAudioTracks().length,
          videoTracks: localStream.getVideoTracks().length
        });
      }

      // Double check that we have a valid stream with tracks
      if (!localStream?.getTracks().length) {
        console.log('Stream has no tracks, reinitializing...');
        const stream = await initializeMedia();
        if (!stream) {
          throw new Error('Failed to initialize media stream');
        }
      }

      console.log('Starting match search with valid stream...');

      // Emit findMatch event to server
      console.log('Emitting findMatch event to server...');
      socketRef.current?.emit('findMatch');

      // Add a timeout to stop searching after 30 seconds
      setTimeout(() => {
        if (isMatching) {
          console.log('Match search timeout...');
          setIsMatching(false);
          setError('Could not find a match. Please try again.');
        }
      }, 30000);
    } catch (error) {
      console.error('Error in handleFindMatch:', error);
      setIsMatching(false);
      setError('Failed to initialize camera. Please check permissions and try again.');
    }
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

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socketRef.current) return;

    const message: Message = {
      id: Date.now().toString(),
      content: newMessage,
      timestamp: new Date(),
      from: 'You'
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

    socketRef.current.on('chatMessage', ({ content, from }: ChatMessage) => {
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
      {/* Connection status banner */}
      <div className={`fixed top-0 left-0 right-0 p-2 text-center text-white ${
        isConnected ? 'bg-green-500' : 'bg-red-500'
      } transition-colors duration-300`}>
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
              className="w-full h-[360px] rounded-lg bg-zinc-900 object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded">
              You
            </div>
            {!localStream && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/90 rounded-lg">
                <div className="text-center p-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto mb-2"></div>
                  <p>Initializing camera...</p>
                </div>
              </div>
            )}
          </div>

          {/* Remote video */}
          <div className="relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-[360px] rounded-lg bg-zinc-900 object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded">
              Partner
            </div>
          </div>
        </div>

        {/* Find match button */}
        {!isMatching && !remoteStream && (
          <button
            onClick={handleFindMatch}
            disabled={!isConnected || !localStream}
            className={`px-6 py-3 rounded-full text-lg font-semibold mb-4 ${
              isConnected && localStream
                ? 'bg-blue-600 hover:bg-blue-700 transition-colors'
                : 'bg-gray-600 cursor-not-allowed'
            }`}
          >
            {!isConnected 
              ? 'Connecting...' 
              : !localStream 
                ? 'Waiting for camera...'
                : 'Find Match'}
          </button>
        )}

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