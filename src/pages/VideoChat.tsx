import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);
  const [remoteStream, setRemoteStream] = useState<MediaStream | undefined>(undefined);
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
  const [isMatched, setIsMatched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const socketRef = useRef<Socket>();
  const peerRef = useRef<Peer.Instance>();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const peerConnectionRef = useRef<Peer.Instance | null>(null);

  // Initialize media function with retries
  const initializeMedia = async (retryCount = 0) => {
    try {
      console.log('Requesting media permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      console.log('Media stream obtained:', {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
        console.log('Local video playing');
      }

      return stream;
    } catch (error) {
      console.error('Media initialization error:', error);
      setError('Failed to access camera/microphone. Please check permissions.');
      
      if (retryCount < 3) {
        console.log(`Retrying media initialization (attempt ${retryCount + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return initializeMedia(retryCount + 1);
      }
      
      throw error;
    }
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
      setLocalStream(undefined);
    }
    
    // Stop remote stream tracks
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        console.log(`Stopping remote stream track: ${track.kind}`);
        track.stop();
      });
      setRemoteStream(undefined);
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
            mode: 'cors',
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('Server health check response:', data);
          } else {
            console.error('Server health check failed:', response.status);
            throw new Error(`Server health check failed: ${response.status}`);
          }
        } catch (error) {
          console.error('Server ping failed:', error);
          setError('Unable to connect to video chat server. Please check your connection and try again.');
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
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          withCredentials: true,
          forceNew: true,
          extraHeaders: {
            'Access-Control-Allow-Origin': window.location.origin
          }
        });

        socket.on('connect', () => {
          console.log('Socket connected successfully');
          setConnectionStatus('Connected to server');
          setIsConnected(true);
          setError('');
        });

        socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          setError(`Connection error: ${error.message}. Please try refreshing the page.`);
          setIsConnected(false);
        });

        socket.on('disconnect', (reason) => {
          console.log('Socket disconnected:', reason);
          setConnectionStatus(`Disconnected: ${reason}. Attempting to reconnect...`);
          setIsConnected(false);
          
          // Handle specific disconnect reasons
          if (reason === 'io server disconnect') {
            // Server disconnected us, try to reconnect
            socket.connect();
          } else if (reason === 'transport close') {
            // Connection lost, will automatically try to reconnect
            setError('Connection lost. Attempting to reconnect...');
          }
        });

        socketRef.current = socket;

        // Handle match found event
        socket.on('matchFound', handleMatchFound);

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

  // Initialize WebRTC connection
  const initializePeerConnection = useCallback((isInitiator: boolean, mediaStream: MediaStream) => {
    if (!socketRef.current) {
      throw new Error('Socket connection not available');
    }

    const peer = new Peer({
      initiator: isInitiator,
      trickle: true,
      stream: mediaStream,
      config: {
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { 
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject',
          }
        ]
      },
      sdpTransform: (sdp) => {
        // Ensure we're using UDP for better real-time performance
        sdp = sdp.replace(/a=candidate.*tcp.*\r\n/g, '');
        return sdp;
      }
    });

    // Debug peer instance
    console.log('Peer instance created:', {
      initiator: isInitiator,
      hasStream: !!mediaStream,
      streamTracks: mediaStream ? {
        audio: mediaStream.getAudioTracks().length,
        video: mediaStream.getVideoTracks().length
      } : null
    });

    let iceConnectionTimeout: NodeJS.Timeout;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;

    // Handle ICE connection state changes with reconnection logic
    peer.on('iceStateChange', (state) => {
      console.log('ICE connection state changed:', {
        state,
        timestamp: new Date().toISOString(),
        hasRemoteStream: !!remoteStream,
        hasLocalStream: !!localStream
      });

      // Clear any existing timeout
      if (iceConnectionTimeout) {
        clearTimeout(iceConnectionTimeout);
      }

      switch (state) {
        case 'checking':
          setConnectionStatus('Establishing connection...');
          // Set a timeout for the checking state
          iceConnectionTimeout = setTimeout(() => {
            if (peer.iceState === 'checking') {
              console.warn('ICE connection checking timeout');
              if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting reconnection (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                peer.reconnect();
              } else {
                console.error('Max reconnection attempts reached');
                cleanupCall();
              }
            }
          }, 10000); // 10 seconds timeout
          break;

        case 'connected':
          reconnectAttempts = 0; // Reset reconnection attempts
          setConnectionStatus('Connected to partner');
          setError('');
          break;

        case 'completed':
          reconnectAttempts = 0; // Reset reconnection attempts
          setConnectionStatus('Connection established');
          break;

        case 'disconnected':
          setConnectionStatus('Connection interrupted. Trying to reconnect...');
          console.warn('ICE connection interrupted');
          // Set a timeout for reconnection attempt
          iceConnectionTimeout = setTimeout(() => {
            if (peer.iceState === 'disconnected') {
              if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting reconnection (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                peer.reconnect();
              } else {
                console.error('Max reconnection attempts reached');
                cleanupCall();
              }
            }
          }, 5000); // 5 seconds timeout
          break;

        case 'failed':
          console.error('ICE connection failed');
          setError('Connection failed. Please try again.');
          cleanupCall();
          break;

        case 'closed':
          console.log('ICE connection closed');
          cleanupCall();
          break;
      }
    });

    return peer;
  }, [remoteStream, localStream, cleanupCall]);

  // Handle match found
  const handleMatchFound = async ({ roomId, partnerId, isInitiator }) => {
    try {
      console.log('Match found:', { roomId, partnerId, isInitiator });
      setConnectionStatus('Match found! Establishing connection...');
      
      // Initialize media if not already done
      let mediaStream = localStream;
      if (!mediaStream) {
        console.log('Initializing media for new match...');
        mediaStream = await initializeMedia();
      }

      if (!mediaStream) {
        throw new Error('Failed to initialize media stream');
      }

      // Initialize WebRTC connection
      const peer = initializePeerConnection(isInitiator, mediaStream);

      setCurrentPartnerId(partnerId);
      setIsMatched(true);
      setIsSearching(false);
      setConnectionStatus('Connected to partner');
      setCallStartTime(new Date());
      setError('');

      // Handle peer signals
      peer.on('signal', (signal) => {
        console.log('Generated signal:', {
          type: signal.type,
          signalData: signal
        });

        if (!socketRef.current) {
          console.error('Socket not available when trying to send signal');
          setError('Connection error: Socket not available');
          return;
        }

        try {
          socketRef.current.emit('signal', {
            to: partnerId,
            signal,
            roomId
          });
        } catch (error) {
          console.error('Error sending signal:', error);
          setError('Failed to send connection signal');
        }
      });

      // Handle stream
      peer.on('stream', (incomingStream: MediaStream) => {
        console.log('Received remote stream:', {
          audioTracks: incomingStream.getAudioTracks().length,
          videoTracks: incomingStream.getVideoTracks().length,
          audioEnabled: incomingStream.getAudioTracks().some(track => track.enabled),
          videoEnabled: incomingStream.getVideoTracks().some(track => track.enabled)
        });
        
        setRemoteStream(incomingStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = incomingStream;
          remoteVideoRef.current.play().catch(err => {
            console.error('Error playing remote video:', err);
            setError('Failed to play remote video. Please check permissions.');
          });
        } else {
          console.error('Remote video ref not available');
          setError('Failed to display remote video');
        }
      });

    } catch (error) {
      console.error('Error in handleMatchFound:', error);
      setError('Failed to establish connection. Please try again.');
      setConnectionStatus('Connection failed');
      cleanupCall();
    }
  };

  // Handle find match click
  const handleFindMatch = useCallback(async () => {
    if (!localStream || !socketRef.current) {
      setError('Please allow camera access first');
      return;
    }

    try {
      setIsSearching(true);
      setConnectionStatus('Looking for a match...');
      setError('');

      console.log('Emitting findMatch event');
      socketRef.current.emit('findMatch');
    } catch (error) {
      console.error('Error in handleFindMatch:', error);
      setError('Failed to start match search. Please try again.');
      setIsSearching(false);
    }
  }, [localStream, socketRef]);

  // Cleanup function
  const cleanupCall = useCallback(() => {
    console.log('Cleaning up call...');
    
    // Clean up peer connection
    if (peerConnectionRef.current) {
      console.log('Destroying peer connection');
      try {
        peerConnectionRef.current.destroy();
      } catch (error) {
        console.error('Error destroying peer connection:', error);
      }
      peerConnectionRef.current = null;
    }

    // Clean up socket listeners
    if (socketRef.current) {
      console.log('Removing socket listeners');
      socketRef.current.off('signal');
      socketRef.current.off('stream');
      socketRef.current.off('connect');
      socketRef.current.off('error');
      socketRef.current.off('close');
      socketRef.current.off('chatMessage');
      socketRef.current.off('like');
      socketRef.current.off('partnerDisconnected');
    }

    // Stop remote stream
    if (remoteStream) {
      console.log('Stopping remote stream tracks');
      try {
        remoteStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.error('Error stopping remote track:', error);
          }
        });
      } catch (error) {
        console.error('Error stopping remote stream:', error);
      }
      setRemoteStream(undefined);
    }

    // Clear remote video with error handling
    if (remoteVideoRef.current) {
      console.log('Clearing remote video element');
      try {
        remoteVideoRef.current.srcObject = null;
      } catch (error) {
        console.error('Error clearing remote video:', error);
      }
    }

    // Reset states
    setIsMatched(false);
    setCurrentPartnerId(null);
    setConnectionStatus('Call ended');
    setMessages([]);
    setLikes(0);
    setHasLiked(false);
    setIsSearching(false);
    setError('');

    // Clear any existing timeouts
    if (window.iceTimeouts) {
      Object.values(window.iceTimeouts).forEach(timeout => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
      window.iceTimeouts = {};
    }
  }, [remoteStream]);

  // Add cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('Cleaning up media on unmount...');
      cleanupCall();
      
      // Stop local stream
      if (localStream) {
        console.log('Stopping local stream tracks');
        try {
          localStream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (error) {
              console.error('Error stopping local track:', error);
            }
          });
        } catch (error) {
          console.error('Error stopping local stream:', error);
        }
      }

      // Clean up socket connection
      if (socketRef.current) {
        console.log('Cleaning up socket connection...');
        try {
          socketRef.current.disconnect();
        } catch (error) {
          console.error('Error disconnecting socket:', error);
        }
      }
    };
  }, [cleanupCall, localStream]);

  // Handle end call
  const handleEndCall = useCallback(async () => {
    console.log('Ending call');
    
    // Store activity data if we have a partner and call start time
    if (socketRef.current && currentPartnerId) {
      // Notify server and partner
      socketRef.current.emit('endCall', { 
        partnerId: currentPartnerId 
      });

      // Store call activity in database
      if (callStartTime) {
        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - callStartTime.getTime()) / 1000); // duration in seconds
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            // Store activity in Supabase
            const { error } = await supabase
              .from('recent_activities')
              .insert({
                user_id: session.user.id,
                partner_id: currentPartnerId,
                activity_type: 'video_call',
                duration,
                likes_received: likes,
                messages_exchanged: messages.length,
                created_at: callStartTime.toISOString(),
                ended_at: endTime.toISOString()
              });

            if (error) {
              console.error('Failed to store activity:', error);
            }
          }
        } catch (error) {
          console.error('Error storing activity:', error);
        }
      }
    }
    
    // Clean up the call
    cleanupCall();

    // Navigate to dashboard after a short delay to allow cleanup
    setTimeout(() => {
      navigate('/dashboard');
    }, 500);
  }, [currentPartnerId, callStartTime, likes, messages.length, cleanupCall, navigate]);

  // Handle partner disconnection
  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on('partnerDisconnected', () => {
      console.log('Partner disconnected');
      setError('Your partner has disconnected');
      handleEndCall();
    });

    return () => {
      socketRef.current?.off('partnerDisconnected');
    };
  }, [handleEndCall]);

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
        {!isSearching && !remoteStream && (
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
        {isSearching && (
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