import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

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

// Use environment variable for development, but always use Render Socket.IO server in production
const SOCKET_URL =
  import.meta.env.MODE === 'production'
    ? 'https://srm-connect-socketio.onrender.com'
    : (import.meta.env.VITE_SOCKET_SERVER_URL || 'https://srm-connect-socketio.onrender.com');

console.log('Using Socket.IO server URL:', SOCKET_URL);
console.log('Current environment:', import.meta.env.MODE);
console.log('Current protocol:', window.location.protocol);
console.log('Current hostname:', window.location.hostname);

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
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartTimeRef = useRef<string | null>(null);
  
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
  const [isRemoteMuted, setIsRemoteMuted] = useState(true);
  const [intentionalDisconnect, setIntentionalDisconnect] = useState(false);
  const [reconnectionAttempts, setReconnectionAttempts] = useState(0);
  const [connectionState, setConnectionState] = useState<'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'failed'>('idle');

  // NEW: mic / camera / report error state
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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
        const pc = peerConnectionRef.current;
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
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
    setIsMicMuted(false);
    setIsVideoMuted(false);
  }, []);
  
  const endVideoSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
  
    try {
      const endedAt = new Date().toISOString();
      let durationSeconds: number | null = null;
  
      if (sessionStartTimeRef.current) {
        const start = Date.parse(sessionStartTimeRef.current);
        const end = Date.parse(endedAt);
        if (!isNaN(start) && !isNaN(end)) {
          durationSeconds = Math.max(0, Math.floor((end - start) / 1000));
        }
      }
  
      const { error } = await supabase
        .from('video_sessions')
        .update({
          ended_at: endedAt,
          duration_seconds: durationSeconds,
        })
        .eq('id', sessionIdRef.current);
  
      if (error) throw error;
  
      console.log('Logged video session end:', {
        sessionId: sessionIdRef.current,
        endedAt,
        durationSeconds,
      });
    } catch (err) {
      console.error('Error logging video session end:', err);
    } finally {
      sessionIdRef.current = null;
      sessionStartTimeRef.current = null;
    }
  }, []);
  
  const handleEndCall = () => {
    if (socketRef.current) {
      socketRef.current.emit('end-call');
    }
    endVideoSession();
    cleanupCall();
  };

  // NEW: toggle mic mute/unmute
  const handleToggleMic = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    if (!audioTracks.length) return;

    const newMutedState = !isMicMuted;
    audioTracks.forEach((track) => {
      track.enabled = !newMutedState;
    });
    setIsMicMuted(newMutedState);
  }, [isMicMuted]);

  // NEW: toggle camera on/off
  const handleToggleVideo = useCallback(() => {
    if (!localStreamRef.current) return;

    const videoTracks = localStreamRef.current.getVideoTracks();
    if (!videoTracks.length) return;

    const newMutedState = !isVideoMuted;
    videoTracks.forEach((track) => {
      track.enabled = !newMutedState;
    });
    setIsVideoMuted(newMutedState);
  }, [isVideoMuted]);

  const handleReportSubmit = async () => {
    setReportError(null);
  
    if (!user) {
      setReportError('You must be logged in to submit a report.');
      return;
    }
  
    if (!partnerProfile) {
      setReportError(
        'Could not find the user you are trying to report. Please try again while in an active call.'
      );
      return;
    }
  
    if (!reportReason.trim()) {
      setReportError('Please describe the issue before submitting.');
      return;
    }
  
    setIsReportSubmitting(true);
  
    try {
      const reportTimestamp = new Date().toISOString();
  
      const reporterDisplayName =
        user.user_metadata?.display_name || user.email || 'Unknown User';
  
      const reportedDisplayName =
        partnerProfile.display_name ||
        partnerProfile.name ||
        partnerProfile.email ||
        'Unknown User';
  
      const reportContext = {
        session_start_time: sessionStartTimeRef.current,
        report_location: 'video_chat',
        client_timestamp: reportTimestamp,
        reporter_display_name: reporterDisplayName,
        reported_display_name: reportedDisplayName,
      };
  
      const reportData: any = {
        reporter_id: user.id,
        reported_user_id: partnerProfile.id,
        reason: reportReason.trim(),
        details: reportReason.trim(),
        reported_at: reportTimestamp,
        created_at: reportTimestamp,
        context: reportContext,
        // chat_session_id: null, // ← leave this out for now to avoid FK errors
      };

      const { error } = await supabase.from('user_reports').insert([reportData]);
      if (error) throw error;
  
      setReportSuccess(true);
      setTimeout(() => {
        setIsReporting(false);
        setReportReason('');
        setReportSuccess(null);
        setReportError(null);
      }, 2000);
    } catch (error) {
      console.error('Error submitting report:', error);
      setReportError('There was a problem submitting your report. Please try again.');
      setReportSuccess(false);
    } finally {
      setIsReportSubmitting(false);
    }
  };
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
      reconnectionAttempts: 15, // Increased from 10
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 30000, // Increased from 20000
      query: { userId: user.id },
      transports: ['websocket', 'polling'],
      forceNew: true, // Force a new connection
      autoConnect: true, // Ensure auto connection is enabled
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
        transport: newSocket.io.opts.transports,
      });

      // Re-join queue if we were matching before reconnection
      if (isMatching && user) {
        console.log('Rejoining queue after reconnection');
        newSocket.emit('join_queue', {
          userId: user.id,
          displayName: user.user_metadata?.display_name || 'Anonymous',
          email: user.email,
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
        console.log(
          'Available media devices:',
          await navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => devices.map((d) => ({ kind: d.kind, label: d.label })))
            .catch((err) => `Error enumerating devices: ${err}`)
        );

        // Try with more permissive constraints first
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: true,
        };

        console.log('Requesting media with constraints:', JSON.stringify(constraints));
        const stream = await navigator.mediaDevices
          .getUserMedia(constraints)
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
        disconnected: newSocket.disconnected,
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
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [user, loading, navigate, cleanupCall, socket, isMatching, intentionalDisconnect]);

  // Define setupPeerConnection function
  const setupPeerConnection = useCallback(() => {
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

    // Add local tracks to the connection if we already have a stream
    if (localStreamRef.current) {
      console.log('[setupPeerConnection] Adding local tracks to new peer connection');
      localStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });
    } else {
      console.warn('[setupPeerConnection] localStreamRef is null; will add tracks when stream becomes available');
    }

    pc.ontrack = (event: RTCTrackEvent) => {
      console.log('[ontrack] Received remote track', event.track);
      let [remoteStream] = event.streams;

      // If no stream is present in event.streams, build one manually
      if (!remoteStream) {
        console.warn('[ontrack] No stream in event.streams, creating MediaStream manually');
        if (!remoteMediaStreamRef.current) {
          remoteMediaStreamRef.current = new MediaStream();
        }
        remoteMediaStreamRef.current.addTrack(event.track);
        remoteStream = remoteMediaStreamRef.current;
      }

      // Store the latest remote stream in state and ref
      if (remoteStream) {
        setRemoteStream(remoteStream);
        remoteMediaStreamRef.current = remoteStream;
      }

      if (!remoteVideoRef.current) {
        console.warn('[ontrack] remoteVideoRef is null, buffering remote stream until video element mounts');
        return;
      }

      const videoEl = remoteVideoRef.current as HTMLVideoElement;

      // Only set srcObject if it's different
      if (videoEl.srcObject !== remoteStream) {
        console.log('[ontrack] Setting remote video srcObject');
        videoEl.srcObject = remoteStream;
      }
      // Debug dump: receivers, transceivers, and a quick stats snapshot
      try {
        console.debug('[ontrack] pc receivers', pc.getReceivers());
        console.debug('[ontrack] pc transceivers', pc.getTransceivers());
        (async () => {
          try {
            const stats = await pc.getStats();
            const reports = [] as any[];
            stats.forEach((r) => reports.push(r));
            console.debug('[ontrack] pc.getStats snapshot', reports.filter(r => r.type && r.type.startsWith('inbound')));
          } catch (e) {
            console.warn('[ontrack] failed to getStats', e);
          }
        })();
      } catch (e) {
        console.warn('[ontrack] debug dump failed', e);
      }

      const attemptPlay = () => {
        console.log('[ontrack] attempting remote video play()');
        videoEl
          .play()
          .then(() => console.log('[ontrack] Remote video playing'))
          .catch((err) => {
            if (err.name === 'AbortError') {
              console.warn('[ontrack] play() aborted, ignoring');
              return;
            }
            console.warn('[ontrack] play blocked, waiting for user interaction', err);
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
        if (remoteVideoRef.current) {
          console.log('[connection] Auto-unmuting remote video');
          remoteVideoRef.current.muted = false;
          setIsRemoteMuted(false);
    
          remoteVideoRef.current
            .play()
            .then(() => console.log('[connection] Remote video playing'))
            .catch((e) => console.warn('[connection] play blocked', e));
        }
        setError(null);

        // After connection is established, try to ensure remote video is playing
        if (remoteVideoRef.current && remoteVideoRef.current.paused) {
          console.log('Attempting to play remote video after connection established');
          setTimeout(() => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current
                .play()
                .then(() => console.log('Remote video playing after connection established'))
                .catch((e) =>
                  console.error('Error playing remote video after connection established:', e)
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
  }, [socket, partnerProfile, user, isRemoteMuted]);

  // When we obtain a local stream after the peer connection has been created,
  // make sure its tracks are added to the connection.
  useEffect(() => {
    if (!peerConnectionRef.current || !localStreamRef.current) {
      return;
    }

    const pc = peerConnectionRef.current;
    const stream = localStreamRef.current;

    console.log('[local stream] Ensuring local tracks are added to peer connection');
    const existingTracks = pc
      .getSenders()
      .map((sender) => sender.track)
      .filter((track): track is MediaStreamTrack => !!track);

    stream.getTracks().forEach((track) => {
      if (!existingTracks.includes(track)) {
        console.log('[local stream] Adding missing local track to peer connection:', track.kind);
        pc.addTrack(track, stream);
      }
    });
  }, [localStream]);

  // When the remote video element mounts and we already have a remote stream buffered,
  // attach it and try to play it.
  useEffect(() => {
    if (remoteVideoRef.current && remoteMediaStreamRef.current) {
      const videoEl = remoteVideoRef.current;
      const stream = remoteMediaStreamRef.current;

      console.log('[remote video] Attaching buffered remote stream after ref mount');
      videoEl.srcObject = stream;

      const attemptPlay = () => {
        console.log('[remote video] calling videoEl.play() after ref mount');
        videoEl
          .play()
          .then(() => console.log('[remote video] Playing after ref mount'))
          .catch((err) => {
            if (err.name === 'AbortError') {
              console.warn('[remote video] play() aborted after ref mount, ignoring');
              return;
            }
            console.warn(
              '[remote video] play blocked after ref mount, waiting for user interaction',
              err
            );
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

  // When the local video element mounts and we already have a local stream,
  // attach it and try to play it.
  useEffect(() => {
    if (!localVideoRef.current || !localStreamRef.current) {
      return;
    }

    const videoEl = localVideoRef.current;
    const stream = localStreamRef.current;

    console.log('[local video] Attaching local stream after ref mount');
    videoEl.srcObject = stream;

    const handleLoadedMetadata = () => {
      videoEl
        .play()
        .then(() => console.log('[local video] playing after ref mount'))
        .catch((err) => {
          console.error('[local video] play error after ref mount:', err);
        });
    };

    if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      handleLoadedMetadata();
    } else {
      videoEl.onloadedmetadata = () => {
        videoEl.onloadedmetadata = null;
        handleLoadedMetadata();
      };
    }

    return () => {
      if (videoEl.onloadedmetadata === handleLoadedMetadata) {
        videoEl.onloadedmetadata = null;
      }
    };
  }, [localStream]);

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
    if (
      peerConnectionRef.current?.connectionState === 'disconnected' &&
      reconnectionAttempts < MAX_RECONNECTION_ATTEMPTS &&
      !intentionalDisconnect &&
      isCalling
    ) {
      const attemptReconnection = async () => {
        console.log(
          `Attempting reconnection (${reconnectionAttempts + 1}/${MAX_RECONNECTION_ATTEMPTS})`
        );
        setReconnectionAttempts((prev) => prev + 1);

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
                  from: user?.id,
                },
                to: partnerProfile.id,
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
  }, [
    peerConnectionRef.current?.connectionState,
    reconnectionAttempts,
    intentionalDisconnect,
    isCalling,
    socket,
    partnerProfile,
    user,
  ]);

  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (data: any) => {
      try {
        console.log('[offer] Waiting for local stream before processing remote offer');
    
        // Wait up to 5 seconds for local camera stream
        const waitForLocalStream = async (timeoutMs = 5000) => {
          const start = Date.now();
          while (!localStreamRef.current && Date.now() - start < timeoutMs) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 100));
          }
          return !!localStreamRef.current;
        };
    
        const hasLocal = await waitForLocalStream(5000);
        if (!hasLocal) {
          console.warn('[offer] Local stream not ready after wait — continuing anyway');
        }
    
        const pc = setupPeerConnection();
        if (!pc) return;
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
            from: user?.id,
          },
          to: data.from || data.partnerId,
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
          sdp: data.sdp,
        };

        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answerDescription)
        );
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
          if (
            !data.candidate.candidate ||
            data.candidate.sdpMid == null ||
            data.candidate.sdpMLineIndex == null
          ) {
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

    const handleMatchFound = async (data: {
      partnerId: string;
      isInitiator: boolean;
      partnerProfile: UserProfile;
    }) => {
      setIsMatching(false);
      setIsCalling(true);
      setPartnerProfile(data.partnerProfile);
    
      // Only initiator logs the session row to avoid duplicates
      if (user && data.isInitiator) {
        const startedAt = new Date().toISOString();
        sessionStartTimeRef.current = startedAt;
    
        try {
          const { data: inserted, error } = await supabase
            .from('video_sessions')
            .insert([
              {
                user1_id: user.id,
                user2_id: data.partnerProfile.id,
                started_at: startedAt,
                signal_data: null,
              },
            ])
            .select()
            .single();
    
          if (error) throw error;
    
          if (inserted) {
            sessionIdRef.current = inserted.id as string;
            console.log('Logged video session start to Supabase:', {
              sessionId: inserted.id,
              user1_id: user.id,
              user2_id: data.partnerProfile.id,
              started_at: startedAt,
            });
          }
        } catch (err) {
          console.error('Error logging video session start:', err);
        }
      }
    
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
              from: user?.id,
            },
            to: partnerId,
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

    const handleRemoteCallEnded = () => {
      endVideoSession();
      cleanupCall();
    };
    
    socket.on('match-found', handleMatchFound);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-ended', handleRemoteCallEnded);
    socket.on('disconnect', handleDisconnect);
    socket.on('error', (error: { message: string }) => setError(error.message));

    return () => {
      // Clean up event listeners
      socket.off('match-found', handleMatchFound);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-ended', handleRemoteCallEnded);
      socket.off('disconnect', handleDisconnect);
      socket.off('error');
    };
  }, [
    socket,
    setupPeerConnection,
    cleanupCall,
    endVideoSession,
    reconnectionAttempts,
    intentionalDisconnect,
    isCalling,
    partnerProfile,
    user,
  ]);

  const handleSendMessage = useCallback(() => {
    if (!socket || !currentMessage.trim() || !user) return;

    // Create a message object that matches the ExtendedChatMessage interface
    const newMessage: ExtendedChatMessage = {
      id: Date.now().toString(),
      content: currentMessage.trim(),
      timestamp: Date.now(),
      fromSelf: true,
      text: currentMessage.trim(),
      from: user.id,
    };

    setMessages((prev) => [...prev, newMessage]);
    socket.emit('chat-message', {
      message: currentMessage.trim(),
      from: user.id,
      to: partnerProfile?.id,
      senderName: user.user_metadata?.display_name || 'Anonymous',
    });
    setCurrentMessage('');

    // Auto-scroll the message container to the bottom
    const chatContainer = document.querySelector('.chat-messages-container');
    if (chatContainer) {
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100); // Add a small delay to ensure content is rendered
    }
  }, [socket, currentMessage, user, partnerProfile]);

  // Listen for incoming chat messages from the server
  useEffect(() => {
    if (!socket) return;
    const handleIncomingMessage = (messageObj: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: messageObj.id || Date.now().toString(),
          content: messageObj.message || messageObj.text || '',
          timestamp: messageObj.timestamp || Date.now(),
          fromSelf: false,
          text: messageObj.message || messageObj.text || '',
          from: messageObj.from || undefined,
        },
      ]);
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
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
          SRM Connect
        </h1>
        <span className="ml-4 text-sm text-gray-400">Status: {connectionState}</span>
        <div className="flex space-x-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 rounded-md text-sm font-medium bg-gray-900 hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Exit
          </button>
          {isCalling && (
            <button
              onClick={() => setIsReporting(true)}
              className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
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
              </>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 text-gray-500 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-gray-400">Local camera not available</p>
              </div>
            )}
          </div>
          <div
            className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-lg border border-gray-800 video-container"
            style={{ display: 'flex' }}
          >
            {/* Always present video element so pc.ontrack can attach immediately */}
            <video
              id="remoteVideo"
              key={partnerProfile?.id || 'remote-video'}
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={isRemoteMuted}
              controls={false}
              className="w-full h-full object-cover"
              style={{ backgroundColor: '#111', display: 'block', width: '100%', height: '100%' }}
            />

            {/* Overlay UI shown only when no remote stream is available yet */}
            {!remoteStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 text-gray-300 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                  />
                </svg>
                <p className="text-gray-200">
                  {isMatching ? 'Finding a match...' : 'Waiting for a peer...'}
                </p>
              </div>
            )}

            {/* Info overlay and manual play/unmute controls */}
            <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 px-2 py-1 rounded-md text-sm">
              {partnerProfile ? partnerProfile.display_name || partnerProfile.name : 'Partner'}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="my-6 flex flex-wrap justify-center gap-4 items-center">
          {!isCalling ? (
            <button
              onClick={handleFindMatch}
              className="px-6 py-3 rounded-full font-medium bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-lg transform transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              Find Match
            </button>
          ) : (
            <>
              <button
                onClick={handleToggleMic}
                className={`px-4 py-3 rounded-full font-medium flex items-center gap-2 shadow-lg transform transition-all hover:scale-105 focus:outline-none focus:ring-2 ${
                  isMicMuted
                    ? 'bg-gray-800 text-red-400 focus:ring-red-500'
                    : 'bg-gray-900 text-white focus:ring-blue-500'
                }`}
                title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={
                      isMicMuted
                        ? 'M9 9v3a3 3 0 004.243 2.828M15 11V9a3 3 0 00-5.356-1.857M19 11a7 7 0 01-11.667 5M5 5l14 14'
                        : 'M12 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3zm-7 10a7 7 0 0014 0M5 11v2m14-2v2M12 19v4'
                    }
                  />
                </svg>
                {isMicMuted ? 'Unmute' : 'Mute'}
              </button>

              <button
                onClick={handleToggleVideo}
                className={`px-4 py-3 rounded-full font-medium flex items-center gap-2 shadow-lg transform transition-all hover:scale-105 focus:outline-none focus:ring-2 ${
                  isVideoMuted
                    ? 'bg-gray-800 text-red-400 focus:ring-red-500'
                    : 'bg-gray-900 text-white focus:ring-blue-500'
                }`}
                title={isVideoMuted ? 'Turn camera on' : 'Turn camera off'}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={
                      isVideoMuted
                        ? 'M3 5l18 14M3 7a2 2 0 012-2h7m2 0h1a2 2 0 012 2v3.5l1.553-1.036A1 1 0 0121 9.382v5.236a1 1 0 01-1.447.894L17 14.5V17a2 2 0 01-2 2H7a2 2 0 01-2-2V7z'
                        : 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
                    }
                  />
                </svg>
                {isVideoMuted ? 'Camera Off' : 'Camera On'}
              </button>

              <button
                onClick={handleEndCall}
                className="px-6 py-3 rounded-full font-medium bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-lg transform transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                End Call
              </button>
            </>
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

            <div
              className="h-64 overflow-y-auto p-4 chat-messages-container"
              style={{ scrollBehavior: 'smooth' }}
            >
              {messages.length === 0 ? (
                <div className="text-center text-gray-400 py-4">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`mb-3 ${message.fromSelf ? 'text-right' : 'text-left'}`}
                  >
                    <span
                      className={`inline-block px-4 py-2 rounded-lg ${
                        message.fromSelf
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                          : 'bg-gray-900 text-gray-100'
                      }`}
                    >
                      {message.text}
                    </span>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 mr-2 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              Report User
            </h3>

            {reportSuccess === null ? (
              <>
                <p className="mb-4 text-gray-300">
                  Please provide details about why you're reporting{' '}
                  {partnerProfile?.display_name || partnerProfile?.name || 'this user'}.
                </p>

                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Describe the issue..."
                  className="w-full p-3 rounded-lg bg-black text-white border border-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  rows={4}
                  required
                />

                {reportError && (
                  <p className="text-sm text-red-400 mb-2">
                    {reportError}
                  </p>
                )}

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setIsReporting(false);
                      setReportReason('');
                      setReportError(null);
                    }}
                    className="px-4 py-2 rounded-md text-sm font-medium bg-gray-900 hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReportSubmit}
                    disabled={!reportReason.trim() || isReportSubmitting}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      !reportReason.trim() || isReportSubmitting
                        ? 'bg-gray-500 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700'
                    } transition-colors flex items-center gap-2`}
                  >
                    {isReportSubmitting ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      'Submit Report'
                    )}
                  </button>
                </div>
              </>
            ) : reportSuccess ? (
              <div className="text-center py-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 text-green-500 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-xl font-semibold text-white">Report Submitted</p>
                <p className="text-gray-300 mt-2">
                  Thank you for helping to keep our community safe.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 text-red-500 mx-auto mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <p className="text-xl font-semibold text-white">Submission Failed</p>
                <p className="text-gray-300 mt-2">
                  There was a problem submitting your report. Please try again later.
                </p>
                <button
                  onClick={() => {
                    setReportSuccess(null);
                    setReportError(null);
                  }}
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