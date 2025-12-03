import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { FileX2 } from 'lucide-react';

// Define UserProfile interface as it's missing from types
interface UserProfile {
  id: string;
  name: string;
  email?: string; // Added email property
  avatar_url?: string;
  display_name?: string;
}

// Use the socket.io-client type
type SocketType = ReturnType<typeof io>;

// Define a more complete ChatMessage type that matches the usage in this component
interface ExtendedChatMessage {
  id: string;
  content: string;
  timestamp: number;
  fromSelf: boolean;
  text: string;
  from?: string;
}

// Use environment variable for production or fallback to localhost for development
// Socket.IO will automatically handle protocol conversion (http->ws, https->wss)
// Ensure we're using the correct protocol and port
const SOCKET_URL = import.meta.env.VITE_SOCKET_SERVER_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3002' : 
   `${window.location.protocol}//${window.location.hostname}:3002`);

// Log the socket URL and current environment
console.log('Using Socket.IO server URL:', SOCKET_URL);
console.log('Current environment:', import.meta.env.MODE);
console.log('Current protocol:', window.location.protocol);
console.log('Current hostname:', window.location.hostname);

// Socket.IO connection options
const SOCKET_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 30000,  // Increased timeout
  autoConnect: true,
  transports: ['polling', 'websocket'],  // Try polling first, then websocket
  pingTimeout: 120000, 
  pingInterval: 30000,
  forceNew: true,  // Force a new connection
};
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

interface Auth {
  user: {
    id: string;
    email: string;
    user_metadata?: {
      display_name?: string;
    };
  } | null;
  loading: boolean;
}

const VideoChat = (): JSX.Element => {
  const { user, loading } = useAuth() as Auth;
  const navigate = useNavigate();
  const socketRef = useRef<SocketType | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mountTimeRef = useRef<number>(Date.now()); // Track when component mounted

  const [socket, setSocket] = useState<SocketType | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSuccess, setReportSuccess] = useState<boolean | null>(null);
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);
  const [intentionalDisconnect, setIntentionalDisconnect] = useState(false);
  const [reconnectionAttempts, setReconnectionAttempts] = useState(0);
  const [connectionState, setConnectionState] = useState<'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'failed'>('idle');

  const MAX_RECONNECTION_ATTEMPTS = 3;
  
  const initCameraRef = useRef<() => Promise<void>>();
const remoteMediaStreamRef = useRef<MediaStream | null>(null);

  // (removed: useEffect for auto-matchmaking on socket/localStream ready)

  const handleFindMatch = async () => {
    if (!socket || !user) return;

    // Don't re-join queue if we're already searching or already in a call
    if (isMatching || isCalling) {
      console.log('Already matching or in a call, skipping join_queue');
      return;
    }

    setIsMatching(true);
    console.log('Sending join_queue request');
    socket.emit('join_queue', {
      userId: user.id,
      displayName: user.user_metadata?.display_name || 'Anonymous',
      email: user.email,
    });
  };

  const handleEndCall = () => {
    if (socketRef.current) {
      socketRef.current.emit('end-call');
    }
    cleanupCall();
  };

  const handleReportSubmit = async () => {
    if (!user || !partnerProfile || !reportReason.trim()) return;
    
    setIsReportSubmitting(true);
    try {
      // Get the current timestamp
      const reportTimestamp = new Date().toISOString();
      
      // Create a report object with more detailed information
      const reportData = {
        reporter_id: user.id,
        reported_user_id: partnerProfile.id,
        reason: reportReason,
        reported_at: reportTimestamp,
        status: 'pending',
        report_type: 'video_chat',
        reporter_email: user.email,
        reporter_display_name: user.user_metadata?.display_name || 'Anonymous',
        reported_user_email: partnerProfile.email || 'Unknown',
        reported_user_display_name: partnerProfile.display_name || partnerProfile.name || 'Unknown',
        // Include metadata about the report context
        context: {
          session_start_time: new Date(isCalling ? Date.now() - 600000 : Date.now()).toISOString(), // Approximate session start time
          report_location: 'video_chat',
          client_timestamp: reportTimestamp
        }
      };
      
      // Submit the report to Supabase
      const { error } = await supabase
        .from('user_reports')
        .insert([reportData]);
      
      if (error) throw error;
      
      console.log('Report submitted successfully:', reportData);
      
      // Show success message and reset form
      setReportSuccess(true);
      setTimeout(() => {
        setIsReporting(false);
        setReportReason('');
        setReportSuccess(null);
      }, 2000);
    } catch (error) {
      console.error('Error submitting report:', error);
      setReportSuccess(false);
    } finally {
      setIsReportSubmitting(false);
    }
  };

  const cleanupCall = useCallback(() => {
    console.log('Cleaning up call resources');
    
    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
        console.log('Stopping track:', track.kind);
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // Close peer connection
    if (peerConnectionRef.current) {
      try {
        // Remove all event listeners
        const pc = peerConnectionRef.current;
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
        
        // Close the connection
        pc.close();
        console.log('Peer connection closed');
      } catch (err) {
        console.error('Error closing peer connection:', err);
      }
      peerConnectionRef.current = null;
    }

    // Clear any buffered remote media
    remoteMediaStreamRef.current = null;

    // Clear remote video element srcObject if present
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Reset state
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
    setPartnerProfile(null);
    setMessages([]);
  }, []);

  useEffect(() => {
    // Add tab visibility handler for reconnect logic
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket && !socket.connected) {
        console.log('[Tab] Tab became visible, attempting to reconnect socket...');
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/');
      return;
    }

    // Initialize socket for authenticated users
    console.log('Initializing socket connection to:', SOCKET_URL);
    console.log('Environment variables available:', import.meta.env.VITE_SOCKET_SERVER_URL ? 'Yes' : 'No');
    
    // Debug the current URL and connection environment
    console.log('Current URL:', window.location.href);
    console.log('Using socket URL:', SOCKET_URL);
  
    // Enhanced socket options with better reconnection settings
    const enhancedOptions = {
      ...SOCKET_OPTIONS,
      reconnection: true,
      reconnectionAttempts: 15,  // Increased from 10
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000,  // Increased from 20000
      query: { userId: user.id },
      transports: ['websocket', 'polling'],
      forceNew: true,  // Force a new connection
      autoConnect: true  // Ensure auto connection is enabled
    };
    
    console.log('Socket connection options:', enhancedOptions);
    
    // Check if we already have a socket and it's connected
    if (socket && socket.connected) {
      console.log('Socket already connected, reusing existing connection');
      setConnectionState('connected');
      return;
    }

    // Check if we have a socket but it's not connected
    if (socket && !socket.connected) {
      console.log('Socket exists but not connected, attempting to reconnect');
      socket.connect();
      return;
    }
    
    const newSocket = io(SOCKET_URL, enhancedOptions);
    
    // Reset intentional disconnect flag on new connection
    setIntentionalDisconnect(false);

    setSocket(newSocket);
    socketRef.current = newSocket;

    // Socket connection event handlers
    const handleConnect = () => {
      console.log('Socket connected successfully with ID:', newSocket.id);
      setConnectionState('connected');
      setError(null); // Clear any connection errors
      
      // Log detailed connection information
      console.log('Socket connection details:', {
        id: newSocket.id,
        connected: newSocket.connected,
        disconnected: newSocket.disconnected,
        transport: newSocket.io.opts.transports
      });
      
      // Re-join queue if we were matching before reconnection
      if (isMatching && user) {
        console.log('Rejoining queue after reconnection');
        newSocket.emit('join_queue', {
          userId: user.id,
          displayName: user.user_metadata?.display_name || 'Anonymous',
          email: user.email
        });
      }
    };

    const handleReconnect = (attemptNumber: number) => {
      console.log(`Socket reconnected after ${attemptNumber} attempts`);
      setConnectionState('connected');
      setError(null); // Clear any connection errors
    };

    const handleReconnectAttempt = (attemptNumber: number) => {
      console.log(`Socket reconnection attempt ${attemptNumber}...`);
    };

    const handleReconnectError = (error: Error) => {
      console.error('Socket reconnection error:', error);
      setConnectionState('disconnected');
      setError('Connection lost. Attempting to reconnect...');
      
      // Try to reconnect manually after a delay
      setTimeout(() => {
        console.log('Manually attempting to reconnect socket...');
        newSocket.connect();
      }, 3000);
    };
    
    const handleConnectError = (error: Error) => {
      console.error('Socket connection error:', error);
      setConnectionState('disconnected');
      
      // Check if the error is related to CORS or network issues
      const errorMessage = error.toString();
      if (errorMessage.includes('CORS') || errorMessage.includes('transport')) {
        console.log('Detected CORS or transport error, trying alternative connection method');
        // Try with different transport options
        newSocket.io.opts.transports = ['polling', 'websocket'];
        setTimeout(() => newSocket.connect(), 1000);
      }
    };
    
    const handleDisconnect = (reason: string) => {
      console.log('Socket disconnected, reason:', reason);
      setConnectionState('disconnected');
      
      // If the disconnection wasn't initiated by the client, try to reconnect
      if (reason !== 'io client disconnect' && !intentionalDisconnect) {
        console.log('Unintentional disconnect, attempting to reconnect...');
        setTimeout(() => {
          if (newSocket) {
            console.log('Attempting to reconnect socket after disconnect...');
            newSocket.connect();
          }
        }, 2000);
      }
    };

    // Register connection event handlers
    newSocket.on('connect', handleConnect);
    newSocket.on('reconnect', handleReconnect);
    newSocket.on('reconnect_attempt', handleReconnectAttempt);
    newSocket.on('reconnect_error', handleReconnectError);
    newSocket.on('connect_error', handleConnectError);
    newSocket.on('disconnect', handleDisconnect);

    // Initialize camera with enhanced error handling and compatibility checks
    const initCamera = async () => {
      // Store reference to initCamera for use in other effects
      initCameraRef.current = initCamera;
      try {
        // Check if mediaDevices API is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.error('MediaDevices API not supported in this browser');
          setError('Your browser does not support video calls. Please try a different browser like Chrome or Firefox.');
          return;
        }
        
        console.log('Browser supports mediaDevices API, requesting camera access...');
        console.log('Available media devices:', await navigator.mediaDevices.enumerateDevices()
          .then(devices => devices.map(d => ({ kind: d.kind, label: d.label })))
          .catch(err => `Error enumerating devices: ${err}`));
        
        // Try with more permissive constraints first
        const constraints = { 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }, 
          audio: true 
        };
        
        console.log('Requesting media with constraints:', JSON.stringify(constraints));
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
          .catch(async (err) => {
            console.warn('Failed to get media with ideal constraints:', err);
            console.log('Trying with basic constraints...');
            // Fallback to basic constraints
            return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          });
        
        console.log('Camera access granted, setting up local video');
        // Set the stream to state and refs
        setLocalStream(stream);
        localStreamRef.current = stream;
        
        // Ensure video plays immediately with enhanced error handling and retry mechanism
        const setupLocalVideo = (retryCount = 0, maxRetries = 5) => {
          if (localVideoRef.current) {
            console.log('Setting local video srcObject with stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, muted: t.muted })));
            localVideoRef.current.srcObject = stream;
            
            // Force a reload of the video element
            localVideoRef.current.load();
            
            // Add event listeners to debug video element state
            localVideoRef.current.onloadedmetadata = () => {
              console.log('Local video loadedmetadata event fired');
              localVideoRef.current?.play()
                .then(() => console.log('Local video playing successfully'))
                .catch(e => {
                  console.error('Error playing local video after metadata loaded:', e);
                  // Try playing again with a timeout
                  setTimeout(() => {
                    localVideoRef.current?.play()
                      .then(() => console.log('Local video playing after retry'))
                      .catch(e => console.error('Error playing local video after retry:', e));
                  }, 1000);
                });
            };
            
            localVideoRef.current.onerror = (e) => {
              console.error('Local video element error:', e);
            };
          } else {
            console.error(`Local video ref is not available (attempt ${retryCount + 1} of ${maxRetries})`);
            if (retryCount < maxRetries) {
              // Retry after a delay - the ref might not be available immediately
              setTimeout(() => {
                console.log(`Retrying local video setup (attempt ${retryCount + 2} of ${maxRetries})`);
                setupLocalVideo(retryCount + 1, maxRetries);
              }, 500); // Increase delay between retries
            } else {
              console.error('Max retries reached for local video setup');
              setError('Could not initialize video. Please refresh the page or try a different browser.');
            }
          }
        };
        
        // Start the setup process
        setupLocalVideo();
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError('Could not access camera or microphone');
      }
    };

    initCamera();

    return () => {
      // Set flag to prevent unnecessary cleanup on intentional disconnect
      setIntentionalDisconnect(true);
      
      // Clean up event listeners
      newSocket.off('connect', handleConnect);
      newSocket.off('reconnect', handleReconnect);
      newSocket.off('reconnect_attempt', handleReconnectAttempt);
      newSocket.off('reconnect_error', handleReconnectError);
      newSocket.off('connect_error', handleConnectError);
      newSocket.off('disconnect', handleDisconnect);
      
      // Log socket state before disconnecting
      console.log('Socket state before disconnection:', {
        id: newSocket.id,
        connected: newSocket.connected,
        disconnected: newSocket.disconnected
      });
      
      // Close socket connection with proper error handling
      try {
        if (newSocket.connected) {
          console.log('Socket is connected, disconnecting properly...');
          newSocket.disconnect();
        } else {
          console.log('Socket is already disconnected');
        }
      } catch (error) {
        console.error('Error during socket disconnection:', error);
      }
      
      // Clean up camera when component unmounts
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [user, loading, navigate, cleanupCall]);
  
    // Define setupPeerConnection function
    const setupPeerConnection = useCallback(() => {
      if (!localStreamRef.current) return null;
  
      // Always create a brand new peer connection to avoid reused-state bugs
      if (peerConnectionRef.current) {
        try {
          console.log('Disposing existing peer connection before creating a new one');
          const oldPc = peerConnectionRef.current;
          oldPc.ontrack = null;
          oldPc.onicecandidate = null;
          oldPc.oniceconnectionstatechange = null;
          oldPc.onconnectionstatechange = null;
          oldPc.close();
        } catch (err) {
          console.error('Error closing existing peer connection:', err);
        }
      }
  
      console.log('Setting up new peer connection');
      const pc = new RTCPeerConnection(ICE_SERVERS);
  
      // Add local tracks to the connection
      localStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });
  
      pc.ontrack = (event: RTCTrackEvent) => {
        console.log('[ontrack] Received remote track', event.track);
        const [remoteStream] = event.streams;
  
        // Store the latest remote stream in state and ref
        if (remoteStream) {
          setRemoteStream(remoteStream);
          remoteMediaStreamRef.current = remoteStream;
        }
  
        if (!remoteVideoRef.current) {
          console.warn(
            '[ontrack] remoteVideoRef is null, buffering remote stream until video element mounts'
          );
          return;
        }
  
        const videoEl = remoteVideoRef.current as HTMLVideoElement;
  
        // Only set srcObject if it's different
        if (videoEl.srcObject !== remoteStream) {
          console.log('[ontrack] Setting remote video srcObject');
          videoEl.srcObject = remoteStream;
        }
  
        const attemptPlay = () => {
          videoEl
            .play()
            .then(() => console.log('[ontrack] Remote video playing'))
            .catch((err) => {
              if (err.name === 'AbortError') {
                console.warn('[ontrack] play() aborted, ignoring');
                return;
              }
              console.warn('[ontrack] play blocked, waiting for user interaction');
              const resume = () => {
                videoEl.play().catch(() => {});
                document.removeEventListener('click', resume);
              };
              document.addEventListener('click', resume, { once: true });
            });
        };
  
        if (videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
          attemptPlay();
        } else {
          videoEl.onloadeddata = () => {
            videoEl.onloadeddata = null;
            attemptPlay();
          };
        }
      };
  
      pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate && socket) {
          console.log('Sending ICE candidate', event.candidate);
          socket.emit('ice-candidate', {
            candidate: event.candidate,
            to: partnerProfile?.id,
            from: user?.id,
          });
        } else if (!event.candidate) {
          console.log('All ICE candidates gathered');
        }
      };
  
      pc.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', pc.iceGatheringState);
      };
  
      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
      };
  
      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
  
        if (pc.connectionState === 'connected') {
          console.log('Peer connection established successfully');
          setError(null);
  
          // After connection is established, try to ensure remote video is playing
          if (remoteVideoRef.current && remoteVideoRef.current.paused) {
            console.log('Attempting to play remote video after connection established');
            setTimeout(() => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current
                  .play()
                  .then(() =>
                    console.log('Remote video playing after connection established')
                  )
                  .catch((e) =>
                    console.error(
                      'Error playing remote video after connection established:',
                      e
                    )
                  );
              }
            }, 1000);
          }
        } else if (pc.connectionState === 'failed') {
          console.log('Peer connection failed');
          setError('Connection to peer failed. Attempting to reconnect...');
        }
      };
  
      peerConnectionRef.current = pc;
      return pc;
    }, [socket, partnerProfile, user]);
  // When the remote video element mounts and we already have a remote stream buffered,
  // attach it and try to play it.
  useEffect(() => {
    if (remoteVideoRef.current && remoteMediaStreamRef.current) {
      const videoEl = remoteVideoRef.current;
      const stream = remoteMediaStreamRef.current;

      console.log('[remote video] Attaching buffered remote stream after ref mount');
      videoEl.srcObject = stream;

      const attemptPlay = () => {
        videoEl
          .play()
          .then(() => console.log('[remote video] Playing after ref mount'))
          .catch((err) => {
            if (err.name === 'AbortError') {
              console.warn('[remote video] play() aborted after ref mount, ignoring');
              return;
            }
            console.warn('[remote video] play blocked after ref mount, waiting for user interaction');
            const resume = () => {
              videoEl.play().catch(() => {});
              document.removeEventListener('click', resume);
            };
            document.addEventListener('click', resume, { once: true });
          });
      };

      if (videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        attemptPlay();
      } else {
        videoEl.onloadeddata = () => {
          videoEl.onloadeddata = null;
          attemptPlay();
        };
      }

      remoteMediaStreamRef.current = null;
    }
  }, [remoteStream]);

  // This effect manages peer connection reconnection attempts
  
  // Heartbeat interval to keep connections alive
  useEffect(() => {
    if (!socket || !isCalling) return;
    
    // Send a heartbeat every 15 seconds to keep the connection alive
    const heartbeatInterval = setInterval(() => {
      if (socket && peerConnectionRef.current?.connectionState === 'connected') {
        console.log('Sending heartbeat to keep connection alive');
        socket.emit('heartbeat');
      }
    }, 15000);
    
    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [socket, isCalling]);
  
  // Effect to handle connection recovery
  useEffect(() => {
    // If disconnected and within retry limit, attempt reconnection
    if (peerConnectionRef.current?.connectionState === 'disconnected' && 
        reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS && 
        !intentionalDisconnect && 
        isCalling) {
      
      const attemptReconnection = async () => {
        console.log(`Attempting reconnection (${reconnectionAttempts + 1}/${MAX_RECONNECTION_ATTEMPTS})`);
        setReconnectionAttempts(prev => prev + 1);
        
        // Create a new offer to restart ICE
        try {
          if (peerConnectionRef.current) {
            // Create restart offer
            const offer = await peerConnectionRef.current.createOffer({ iceRestart: true });
            await peerConnectionRef.current.setLocalDescription(offer);
            
            if (socket && partnerProfile) {
              socket.emit('offer', {
                offer: {
                  type: offer.type,
                  sdp: offer.sdp,
                  from: user?.id
                },
                to: partnerProfile.id
              });
              console.log('Sent reconnection offer');
            }
          }
        } catch (error) {
          console.error('Failed to create reconnection offer:', error);
        }
      };
      
      // Wait 2 seconds before attempting reconnection
      const timer = setTimeout(attemptReconnection, 2000);
      return () => clearTimeout(timer);
    }
  }, [peerConnectionRef.current?.connectionState, reconnectionAttempts, intentionalDisconnect, isCalling, socket, partnerProfile, user]);


  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (data: any) => {
      try {
        const pc = setupPeerConnection();
        if (!pc || !socket) return;
        const offerDescription = data.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
        console.log('Remote description set. Adding buffered ICE candidates...');
        for (const candidate of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added buffered ICE candidate');
          } catch (e) {
            console.error('Error adding buffered ICE candidate:', e);
          }
        }
        pendingCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
          answer: {
            type: answer.type,
            sdp: answer.sdp,
            from: user?.id
          },
          to: data.from || data.partnerId
        });
        console.log('Sent answer to server');
      } catch (error) {
        console.error('Error handling offer:', error);
        setError('Failed to establish connection');
      }
    };

    const handleAnswer = async (data: any) => {
      console.log('Received answer:', data);
      if (!peerConnectionRef.current) return;
      
      try {
        // Make sure data has the required type property
        const answerDescription = {
          type: data.type || 'answer',
          sdp: data.sdp
        };
        
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answerDescription));
        console.log('Remote description set. Adding buffered ICE candidates...');
        for (const candidate of pendingCandidatesRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('Added buffered ICE candidate');
          } catch (e) {
            console.error('Error adding buffered ICE candidate:', e);
          }
        }
        pendingCandidatesRef.current = [];
        console.log('Successfully set remote description from answer');
      } catch (error) {
        console.error('Error handling answer:', error);
        setError('Failed to establish connection');
      }
    };

    const handleIceCandidate = async (data: any) => {
      if (!peerConnectionRef.current) return;
      try {
        if (data.candidate) {
          // Defensive: check for required fields
          if (!data.candidate.candidate || data.candidate.sdpMid == null || data.candidate.sdpMLineIndex == null) {
            console.error('[ICE] Malformed ICE candidate received:', data.candidate);
            return;
          }
          const pc = peerConnectionRef.current;
          if (!pc.remoteDescription || !pc.remoteDescription.type) {
            // Buffer candidate until remoteDescription is set
            pendingCandidatesRef.current.push(data.candidate);
            console.log('[ICE] Buffered candidate (remoteDescription not set yet)', data.candidate);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('Added ICE candidate successfully');
          }
        }
      } catch (error) {
        console.error('Error adding ice candidate:', error);
      }
    };

    const handleMatchFound = (data: { partnerId: string; isInitiator: boolean; partnerProfile: UserProfile }) => {
      setIsMatching(false);
      setIsCalling(true);
      setPartnerProfile(data.partnerProfile);

      if (data.isInitiator) {
        console.log('[match-found] You are the initiator, creating peer connection and offer');
        const peerConnection = setupPeerConnection();
        if (!peerConnection) return;
        handleCreateOffer(peerConnection, data.partnerId);
      } else {
        console.log('[match-found] Match found, waiting for offer from partner');
        // The non-initiator will create the RTCPeerConnection in handleOffer
      }
    };

    const handleCreateOffer = async (peerConnection: RTCPeerConnection, partnerId: string) => {
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        if (socket) {
          console.log('Sending offer to partner:', partnerId);
          // Make sure the offer is properly structured with type and sdp fields
          const offerToSend = {
            offer: {
              type: offer.type,
              sdp: offer.sdp,
              from: user?.id
            },
            to: partnerId
          };
          
          socket.emit('offer', offerToSend);
          console.log('Sent offer data:', offerToSend);
        }
      } catch (error) {
        console.error('Error creating offer:', error);
        cleanupCall();
      }
    };

    // Define socket event handlers
    const handleDisconnect = (reason: string) => {
      console.log('Socket disconnected:', reason);
      
      // Only clean up the call if this wasn't a navigation or intentional disconnect
      if (reason !== 'io client disconnect' || !intentionalDisconnect) {
        if (reason === 'io server disconnect' && socket) {
          console.log('Server disconnected, attempting to reconnect');
          socket.connect();
        }
        
        // If this was a transport close or other network issue, try to recover before cleanup
        if (['transport close', 'ping timeout', 'transport error'].includes(reason)) {
          console.log('Network issue detected, trying to reconnect socket...');
          setTimeout(() => {
            if (socket && !socket.connected) {
              socket.connect();
            }
          }, 1000);
          
          // Don't immediately clean up - give reconnection a chance
          if (reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
            console.log('Exceeded max reconnection attempts, cleaning up call');
            cleanupCall();
          }
        } else {
          cleanupCall();
        }
      }
    };
    
    // Register socket event listeners
    socket.on('match-found', handleMatchFound); 
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-ended', cleanupCall);
    socket.on('disconnect', handleDisconnect);
    socket.on('error', (error: { message: string }) => setError(error.message));

    return () => {
      // Clean up event listeners
      socket.off('match-found', handleMatchFound); 
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-ended', cleanupCall);
      socket.off('disconnect', handleDisconnect);
      socket.off('error');
    };
  }, [socket, setupPeerConnection, cleanupCall]);

  const handleSendMessage = useCallback(() => {
    if (!socket || !currentMessage.trim() || !user) return;

    // Create a message object that matches the ExtendedChatMessage interface
    const newMessage: ExtendedChatMessage = {
      id: Date.now().toString(),
      content: currentMessage.trim(),
      timestamp: Date.now(),
      fromSelf: true,
      text: currentMessage.trim(),
      from: user.id
    };

    setMessages((prev) => [...prev, newMessage]);
    socket.emit('chat-message', {
      message: currentMessage.trim(),
      from: user.id,
      to: partnerProfile?.id,
      senderName: user.user_metadata?.display_name || 'Anonymous'
    });
    setCurrentMessage('');
    
    // Auto-scroll the message container to the bottom
    const chatContainer = document.querySelector('.chat-messages-container');
    if (chatContainer) {
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100); // Add a small delay to ensure content is rendered
    }
  }, [socket, currentMessage, user]);

  // Listen for incoming chat messages from the server
  useEffect(() => {
    if (!socket) return;
    const handleIncomingMessage = (messageObj: any) => {
      setMessages(prev => [...prev, {
        id: messageObj.id || Date.now().toString(),
        content: messageObj.message || messageObj.text || '',
        timestamp: messageObj.timestamp || Date.now(),
        fromSelf: false,
        text: messageObj.message || messageObj.text || '',
        from: messageObj.from || undefined,
      }]);
    };
    socket.on('chat-message', handleIncomingMessage);
    return () => {
      socket.off('chat-message', handleIncomingMessage);
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center">
      {/* Header with app name and buttons */}
      <header className="w-full bg-black border-b border-gray-800 p-4 flex justify-between items-center shadow-md sticky top-0 z-10">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">SRM Connect</h1>
        <div className="flex space-x-3">
          <button 
            onClick={() => navigate('/dashboard')} 
            className="px-4 py-2 rounded-md text-sm font-medium bg-gray-900 hover:bg-gray-800 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Exit
          </button>
          {isCalling && (
            <button 
              onClick={() => setIsReporting(true)}
              className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 transition-colors flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Report
            </button>
          )}
        </div>
      </header>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-3 bg-red-500 text-white rounded-md shadow-lg animate-pulse max-w-3xl w-full">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center w-full max-w-5xl p-4">
        {/* Video section - at the top */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-lg border border-gray-800 video-container">
            {localStream ? (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  controls={false}
                  className="w-full h-full object-cover"
                  onCanPlay={() => console.log('Local video can play event fired')}
                  onPlaying={() => console.log('Local video playing event fired')}
                  style={{ backgroundColor: '#111' }}
                />
                <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 px-2 py-1 rounded-md text-sm">
                  You
                </div>
                <button 
                  onClick={() => {
                    if (localVideoRef.current) {
                      console.log('Manual play button clicked');
                      localVideoRef.current.play()
                        .then(() => console.log('Local video playing after manual click'))
                        .catch(e => console.error('Error playing local video after manual click:', e));
                    }
                  }}
                  className="absolute top-3 right-3 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full"
                  title="Restart video"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-400">Local camera not available</p>
              </div>
            )}
          </div>
          <div 
            className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-lg border border-gray-800 video-container"
            style={{ display: 'flex' }} // Always display the container
          >
            {remoteStream ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  className="w-full h-full object-cover"
                  style={{ backgroundColor: '#111', display: 'block', width: '100%', height: '100%' }}
                />
                <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 px-2 py-1 rounded-md text-sm">
                  {partnerProfile ? (partnerProfile.display_name || partnerProfile.name) : 'Partner'}
                </div>
                <button 
                  onClick={() => {
                    if (remoteVideoRef.current) {
                      console.log('Manual play button clicked for remote video');
                      remoteVideoRef.current.play()
                        .then(() => console.log('Remote video playing after manual click'))
                        .catch(e => console.error('Error playing remote video after manual click:', e));
                    }
                  }}
                  className="absolute top-3 right-3 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full"
                  title="Restart video"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
                <p className="text-gray-400">{isMatching ? 'Finding a match...' : 'Waiting for a peer...'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="my-6 flex justify-center gap-4">
          {!isCalling ? (
            <button
              onClick={handleFindMatch}
              className="px-6 py-3 rounded-full font-medium bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg transform transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              Find Match
            </button>
          ) : (
            <button
              onClick={handleEndCall}
              className="px-6 py-3 rounded-full font-medium bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-lg transform transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              End Call
            </button>
          )}
        </div>

        {/* Chat section - at the bottom, always visible when in a call */}
        {isCalling && (
          <div className="w-full bg-black border border-gray-800 rounded-lg shadow-lg overflow-hidden transition-all mt-4">
            {partnerProfile && (
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-3 rounded-t-lg flex items-center">
                <div className="w-8 h-8 rounded-full bg-blue-300 mr-3 flex items-center justify-center font-bold">
                  {(partnerProfile.display_name || partnerProfile.name || '?')[0].toUpperCase()}
                </div>
                <span>Talking to: {partnerProfile.display_name || partnerProfile.name}</span>
              </div>
            )}
            
            <div className="h-64 overflow-y-auto p-4 chat-messages-container" style={{scrollBehavior: 'smooth'}}>
              {messages.length === 0 ? (
                <div className="text-center text-gray-400 py-4">No messages yet. Start the conversation!</div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`mb-3 ${message.fromSelf ? 'text-right' : 'text-left'}`}
                  >
                    <span className={`inline-block px-4 py-2 rounded-lg ${message.fromSelf 
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white' 
                      : 'bg-gray-900 text-gray-100'}`}>
                      {message.text}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-3 border-t border-gray-800">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 p-3 bg-black border border-gray-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSendMessage}
                  className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {isReporting && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-20 p-4">
          <div className="bg-black border border-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-semibold mb-4 text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Report User
            </h3>
            
            {reportSuccess === null ? (
              <>
                <p className="mb-4 text-gray-300">
                  Please provide details about why you're reporting {partnerProfile?.display_name || partnerProfile?.name || 'this user'}.
                </p>
                
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the issue..."
                  className="w-full p-3 rounded-lg bg-black text-white border border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                  rows={4}
                  required
                />
                
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setIsReporting(false);
                      setReportReason('');
                    }}
                    className="px-4 py-2 rounded-md text-sm font-medium bg-gray-900 hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReportSubmit}
                    disabled={!reportReason.trim() || isReportSubmitting}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${!reportReason.trim() || isReportSubmitting ? 'bg-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'} transition-colors flex items-center gap-2`}
                  >
                    {isReportSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting...
                      </>
                    ) : 'Submit Report'}
                  </button>
                </div>
              </>
            ) : reportSuccess ? (
              <div className="text-center py-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-xl font-semibold text-white">Report Submitted</p>
                <p className="text-gray-300 mt-2">Thank you for helping to keep our community safe.</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <p className="text-xl font-semibold text-white">Submission Failed</p>
                <p className="text-gray-300 mt-2">There was a problem submitting your report. Please try again later.</p>
                <button
                  onClick={() => setReportSuccess(null)}
                  className="mt-4 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoChat;
