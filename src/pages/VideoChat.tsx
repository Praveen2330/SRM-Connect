import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'simple-peer';
import { supabase } from '../lib/supabase';
import { Heart, MessageCircle, X, Send } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  timestamp: Date;
  from: 'You' | 'Partner';
}

interface ChatMessage {
  content: string;
  from: string;
}

interface MatchFoundData {
  roomId: string;
  partnerId: string;
  isInitiator: boolean;
}

interface ExtendedPeer extends Peer.Instance {
  _pc: RTCPeerConnection;
}

export default function VideoChat() {
  const navigate = useNavigate();
  const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);
  const [remoteStream, setRemoteStream] = useState<MediaStream | undefined>(undefined);
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
  const [isSearching, setIsSearching] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isMatched, setIsMatched] = useState(false);

  const socketRef = useRef<Socket>();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const peerConnectionRef = useRef<ExtendedPeer | null>(null);

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

  // Page visibility handler
  useEffect(() => {
    const handleVisibilityChange = async () => {
      const isHidden = document.hidden;
      console.log('Page visibility changed:', {
        isHidden,
        isMatching,
        hasRemoteStream: !!remoteStream,
        hasLocalStream: !!localStream
      });

      if (isHidden) {
        // Only cleanup if we're not in an active call
        if (!remoteStream && !isMatching) {
          console.log('No active call or matching, stopping media tracks...');
          stopAllMediaTracks();
        }
      } else {
        // Page became visible
        console.log('Page visible, checking if media reinitialization needed...');
        if (!localStream && !remoteStream && !isMatching) {
          try {
            const stream = await initializeMedia();
            setLocalStream(stream);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
          } catch (error) {
            console.error('Error reinitializing media:', error);
            setError('Failed to reinitialize camera. Please refresh the page.');
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [localStream, remoteStream, isMatching]);

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
          timeout: 20000
        });

        socket.on('connect', () => {
          console.log('Socket connected successfully');
          setConnectionStatus('Connected to server');
          setIsConnected(true);
          setError('');
        });

        // Add signal handler at socket level
        socket.on('signal', ({ from, signal, roomId: signalRoomId }) => {
          console.log('Received signal:', {
            from,
            type: signal.type,
            roomId: signalRoomId,
            timestamp: new Date().toISOString()
          });

          if (peerConnectionRef.current && !peerConnectionRef.current.destroyed) {
            try {
              peerConnectionRef.current.signal(signal);
              console.log('Successfully applied received signal');
            } catch (error) {
              console.error('Error applying received signal:', error);
              setError('Failed to process connection signal');
            }
          } else {
            console.warn('Received signal but peer is not available');
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

  // Handle match found
  const handleMatchFound = async ({ roomId, partnerId, isInitiator }: MatchFoundData) => {
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

      if (!socketRef.current) {
        throw new Error('Socket connection not available');
      }

      // Initialize WebRTC connection with improved configuration
      const peer = new Peer({
        initiator: isInitiator,
        trickle: true,
        stream: mediaStream,
        config: {
          iceTransportPolicy: 'all',
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
          iceCandidatePoolSize: 1,
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
              urls: [
                'turn:a.relay.metered.ca:80',
                'turn:a.relay.metered.ca:80?transport=tcp',
                'turn:a.relay.metered.ca:443',
                'turn:a.relay.metered.ca:443?transport=tcp'
              ],
              username: 'e899a0e2c0e6a7c4d2b8f8d6',
              credential: 'SrmConnect123'
            }
          ]
        },
        sdpTransform: (sdp) => {
          // Add ICE restart support
          sdp = sdp.replace(/a=ice-options:trickle\r\n/g, 'a=ice-options:trickle renomination\r\n');
          // Increase UDP candidate priority
          sdp = sdp.replace(/a=candidate:(\S*)\s+udp/gi, 'a=candidate:$1 udp 2130706431');
          // Add bandwidth constraints
          sdp = sdp.replace(/c=IN IP4.*\r\n/g, '$&b=AS:2000\r\n');
          return sdp;
        }
      }) as ExtendedPeer;

      // Store peer reference immediately
      peerConnectionRef.current = peer;

      // Debug peer instance
      console.log('Peer instance created:', {
        initiator: isInitiator,
        hasStream: !!mediaStream,
        streamTracks: mediaStream ? {
          audio: mediaStream.getAudioTracks().length,
          video: mediaStream.getVideoTracks().length,
          tracks: mediaStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
          }))
        } : null
      });

      setCurrentPartnerId(partnerId);
      setIsMatched(true);
      setIsSearching(false);
      setConnectionStatus('Connected to partner');
      setCallStartTime(new Date());
      setError('');

      // Track connection state
      let isReconnecting = false;
      let reconnectAttempts = 0;
      const MAX_RECONNECT_ATTEMPTS = 5;
      const RECONNECT_DELAY = 1000;

      // Connection timeout handler with reconnection logic
      let connectionTimeout: number;
      const resetConnectionTimeout = () => {
        if (connectionTimeout) window.clearTimeout(connectionTimeout);
        connectionTimeout = window.setTimeout(() => {
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            console.log(`Connection timeout - attempting reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectAttempts++;
            isReconnecting = true;
            
            try {
              if (peer && !peer.destroyed) {
                // Clear existing event listeners
                peer.removeAllListeners();
                
                // Re-setup all event listeners
                setupPeerListeners(peer);
                
                // Force ICE restart
                if (peer._pc.connectionState !== 'closed') {
                  peer._pc.restartIce();
                  // Create and send a new offer if we're the initiator
                  if (isInitiator) {
                    peer._pc.createOffer({ iceRestart: true })
                      .then(offer => peer._pc.setLocalDescription(offer))
                      .catch(error => {
                        console.error('Error creating restart offer:', error);
                        cleanupCall();
                      });
                  }
                }
                resetConnectionTimeout();
              }
            } catch (error) {
              console.error('Error during reconnection attempt:', error);
              cleanupCall();
            }
          } else {
            console.error('Max reconnection attempts reached - destroying peer');
            peer.destroy();
            setError('Connection failed after multiple attempts. Please try again.');
            setConnectionStatus('Connection failed');
            cleanupCall();
          }
        }, isReconnecting ? RECONNECT_DELAY : 15000);
      };

      // Set up all peer event listeners
      const setupPeerListeners = (peer: ExtendedPeer) => {
        peer.on('signal', (signal) => {
          console.log('Generated signal:', {
            type: signal.type,
            isReconnecting,
            timestamp: new Date().toISOString()
          });

          if (!socketRef.current) {
            console.error('Socket not available when trying to send signal');
            return;
          }

          try {
            socketRef.current.emit('signal', {
              to: partnerId,
              signal,
              roomId,
              isReconnecting
            });
          } catch (error) {
            console.error('Error sending signal:', error);
          }
        });

        peer.on('connect', () => {
          console.log('Peer connection established');
          setConnectionStatus('Connected to partner');
          setError('');
          isReconnecting = false;
          reconnectAttempts = 0;
          if (connectionTimeout) window.clearTimeout(connectionTimeout);
        });

        peer.on('error', (err) => {
          console.error('Peer connection error:', err);
          if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            isReconnecting = true;
            resetConnectionTimeout();
          } else {
            setError(`Connection error: ${err.message}. Please try again.`);
            cleanupCall();
          }
        });

        peer.on('close', () => {
          console.log('Peer connection closed');
          if (connectionTimeout) window.clearTimeout(connectionTimeout);
          cleanupCall();
        });

        peer.on('stream', (incomingStream: MediaStream) => {
          console.log('Received remote stream:', {
            audioTracks: incomingStream.getAudioTracks().length,
            videoTracks: incomingStream.getVideoTracks().length,
            tracks: incomingStream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              muted: t.muted,
              readyState: t.readyState
            }))
          });
          
          setRemoteStream(incomingStream);
          
          // Make sure we have a valid video element
          if (remoteVideoRef.current) {
            console.log('Setting remote video source');
            remoteVideoRef.current.srcObject = incomingStream;
            
            // Play with fallback
            const playPromise = remoteVideoRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('Remote video playing successfully');
                  setError('');
                })
                .catch(err => {
                  console.error('Error playing remote video:', err);
                  // Try again with user interaction
                  const playButton = document.createElement('button');
                  playButton.textContent = 'Click to enable video';
                  playButton.className = 'absolute inset-0 bg-black/80 text-white flex items-center justify-center';
                  playButton.onclick = () => {
                    remoteVideoRef.current?.play();
                    playButton.remove();
                  };
                  if (remoteVideoRef.current.parentNode) {
                    remoteVideoRef.current.parentNode.appendChild(playButton);
                  }
                });
            }
          } else {
            console.error('Remote video ref is null');
            setError('Failed to display remote video');
          }
        });

        // Add ICE connection state monitoring
        peer.on('iceStateChange', (state) => {
          console.log('ICE connection state changed:', {
            state,
            timestamp: new Date().toISOString(),
            isReconnecting,
            reconnectAttempts
          });

          switch (state) {
            case 'checking':
              setConnectionStatus(isReconnecting ? 'Reconnecting...' : 'Establishing connection...');
              break;
            case 'connected':
            case 'completed':
              setConnectionStatus('Connected to partner');
              setError('');
              isReconnecting = false;
              reconnectAttempts = 0;
              if (connectionTimeout) window.clearTimeout(connectionTimeout);
              break;
            case 'disconnected':
              console.warn('ICE connection interrupted');
              setConnectionStatus('Connection interrupted. Trying to reconnect...');
              if (!isReconnecting) {
                isReconnecting = true;
                resetConnectionTimeout();
              }
              break;
            case 'failed':
              console.error('ICE connection failed');
              if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                resetConnectionTimeout();
              } else {
                setError('Connection failed. Please try again.');
                cleanupCall();
              }
              break;
            case 'closed':
              cleanupCall();
              break;
          }
        });
      };

      // Set initial timeout and set up listeners
      resetConnectionTimeout();
      setupPeerListeners(peer);
    } catch (error) {
      console.error('Error in handleMatchFound:', error);
      setError('Failed to establish connection. Please try again.');
      setConnectionStatus('Connection failed');
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
      peerConnectionRef.current.destroy();
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
      remoteStream.getTracks().forEach(track => {
        track.stop();
      });
      setRemoteStream(undefined);
    }

    // Clear remote video
      if (remoteVideoRef.current) {
      console.log('Clearing remote video element');
        remoteVideoRef.current.srcObject = null;
    }

    // Reset states
    setIsMatched(false);
    setCurrentPartnerId(null);
    setConnectionStatus('Call ended');
    setMessages([]);
    setLikes(0);
    setHasLiked(false);
    setIsSearching(false);
  }, [remoteStream]);

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