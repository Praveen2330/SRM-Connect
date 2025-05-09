import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

// Define UserProfile interface as it's missing from types
interface UserProfile {
  id: string;
  name: string;
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

const SOCKET_URL = 'http://localhost:3002';

// Socket.IO connection options
const SOCKET_OPTIONS = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  autoConnect: true,
  transports: ['websocket', 'polling']
};
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free STUN servers from various providers
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.ekiga.net:3478' },
    { urls: 'stun:stun.ideasip.com:3478' }
  ],
  iceCandidatePoolSize: 10
};

// WebRTC interfaces

// Define a type for the authentication data returned by useAuth
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

// handleMatchFound already uses the data type inline, so we don't need a separate type

const VideoChat = (): JSX.Element => {
  const { user, loading } = useAuth() as Auth;
  const navigate = useNavigate();
  const socketRef = useRef<SocketType | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

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
  const MAX_RECONNECTION_ATTEMPTS = 3;

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
      return;
    }
  }, [loading, user, navigate]);

  const handleFindMatch = async () => {
    if (!socket || !user) return;
    setIsMatching(true);
    console.log('Sending join_queue request');
    socket.emit('join_queue', {
      userId: user.id,
      displayName: user.user_metadata?.display_name || 'Anonymous',
      email: user.email
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
      // Submit the report to Supabase
      const { error } = await supabase
        .from('user_reports')
        .insert([
          {
            reporter_id: user.id,
            reported_user_id: partnerProfile.id,
            reason: reportReason,
            reported_at: new Date().toISOString(),
            status: 'pending'
          }
        ]);
      
      if (error) throw error;
      
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
    
    // Reset state
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
    setPartnerProfile(null);
    setMessages([]);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/');
      return;
    }

    // Configure socket with reconnection options
    const newSocket = io(SOCKET_URL, {
      ...SOCKET_OPTIONS,
      query: { userId: user.id }
    });
    
    // Reset intentional disconnect flag on new connection
    setIntentionalDisconnect(false);

    setSocket(newSocket);
    socketRef.current = newSocket;

    // Socket connection event handlers
    const handleConnect = () => {
      console.log('Socket connected successfully');
      setError(null); // Clear any connection errors
      
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
      console.log(`Socket reconnecting... attempt ${attemptNumber}`);
    };

    const handleReconnectError = (error: Error) => {
      console.error('Socket reconnection error:', error);
      setError('Connection lost. Please refresh the page.');
    };
    
    const handleConnectError = (error: Error) => {
      console.error('Socket connection error:', error);
    };

    // Register connection event handlers
    newSocket.on('connect', handleConnect);
    newSocket.on('reconnect', handleReconnect);
    newSocket.on('reconnect_error', handleReconnectError);
    newSocket.on('connect_error', handleConnectError);

    // Initialize camera
    const initCamera = async () => {
      try {
        console.log('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }, 
          audio: true 
        });
        
        console.log('Camera access granted, setting up local video');
        // Set the stream to state and refs
        setLocalStream(stream);
        localStreamRef.current = stream;
        
        // Ensure video plays immediately
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play()
            .then(() => console.log('Local video playing'))
            .catch(e => console.error('Error playing local video:', e));
        }
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
      newSocket.off('reconnect_error', handleReconnectError);
      newSocket.off('connect_error', handleConnectError);
      
      // Close socket connection
      newSocket.disconnect();
      
      // Clean up camera when component unmounts
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [user, loading, navigate, cleanupCall]);
  
  // Define setupPeerConnection function
  const setupPeerConnection = useCallback(() => {
    if (!localStreamRef.current) return null;

    console.log('Setting up new peer connection');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    // Add local tracks to the connection
    localStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => {
      if (localStreamRef.current) {
        pc.addTrack(track, localStreamRef.current);
      }
    });

    // Handle remote tracks
    pc.ontrack = (event: RTCTrackEvent) => {
      console.log('Received remote track', event.streams);
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // ICE candidate handling
    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate && socket) {
        console.log('Sending ICE candidate');
        socket.emit('ice-candidate', {
          candidate: event.candidate,
          to: partnerProfile?.id
        });
      } else if (!event.candidate) {
        console.log('All ICE candidates gathered');
      }
    };
    
    // Enable trickle ICE by buffering candidates
    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState);
    };
    
    // Monitor connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'disconnected') {
        console.log('ICE connection disconnected - waiting for recovery');
        // Don't immediately clean up - give it a chance to recover
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        console.log('ICE connection failed or closed');
        // Only clean up if this wasn't an intentional disconnect
        if (!intentionalDisconnect && reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
          cleanupCall();
        }
      }
    };
    
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        console.log('Peer connection established successfully');
        setError(null);
        // Reset reconnection attempts counter when connection succeeds
        setReconnectionAttempts(0);
      } else if (pc.connectionState === 'failed') {
        console.log('Peer connection failed');
        setError('Connection to peer failed. Attempting to reconnect...');
        // Only clean up if this wasn't an intentional disconnect
        if (!intentionalDisconnect && reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
          setError('Connection to peer failed. Please try again.');
          cleanupCall();
        }
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [socket, partnerProfile, intentionalDisconnect, cleanupCall, reconnectionAttempts]);

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

  // Main effect for creating and managing peer connection
  useEffect(() => {
    if (!socket || !localStream) return;
    
    // Reset reconnection attempts when creating a new connection
    setReconnectionAttempts(0);
    
    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event: RTCTrackEvent) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        socket.emit('ice-candidate', event.candidate);
      }
    };
    
    // Add connection state monitoring
    pc.onconnectionstatechange = () => {
      console.log(`Connection state changed: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        // Reset reconnection attempts when successfully connected
        setReconnectionAttempts(0);
      }
    };

    return () => {
      pc.close();
    };
  }, [socket, localStream]);

  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (data: any) => {
      console.log('Received offer:', data);
      const pc = setupPeerConnection();
      if (!pc || !socket) return;

      try {
        // Make sure data has the required type property
        const offerDescription = {
          type: data.type || 'offer',
          sdp: data.sdp
        };
        
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Include recipient info when sending answer
        socket.emit('answer', {
          answer: answer,
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
        console.log('Successfully set remote description from answer');
      } catch (error) {
        console.error('Error handling answer:', error);
        setError('Failed to establish connection');
      }
    };

    const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
      if (!peerConnectionRef.current) return;
      try {
        console.log('Received ICE candidate');
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added ICE candidate successfully');
      } catch (error) {
        console.error('Error adding ice candidate:', error);
      }
    };

    const handleMatchFound = (data: { partnerId: string, isInitiator: boolean, partnerProfile: UserProfile }) => {
      setIsMatching(false);
      setIsCalling(true);
      setPartnerProfile(data.partnerProfile);

      // Set up peer connection
      const peerConnection = setupPeerConnection();
      if (!peerConnection) return;

      // Only create offer if we are the initiator
      if (data.isInitiator) {
        handleCreateOffer(peerConnection, data.partnerId);
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
    socket.on('match_found', handleMatchFound);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-ended', cleanupCall);
    socket.on('disconnect', handleDisconnect);
    socket.on('error', (error: { message: string }) => setError(error.message));

    return () => {
      // Clean up event listeners
      socket.off('match_found', handleMatchFound);
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
    socket.emit('message', { text: currentMessage.trim() });
    setCurrentMessage('');
    
    // Auto-scroll the message container to the bottom
    const chatContainer = document.querySelector('.chat-messages-container');
    if (chatContainer) {
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100);
    }
  }, [socket, currentMessage, user]);

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
          <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-lg border border-gray-800">
            {localStream ? (
              <>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 px-2 py-1 rounded-md text-sm">
                  You
                </div>
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
          <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center relative shadow-lg border border-gray-800">
            {remoteStream ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-3 bg-black bg-opacity-50 px-2 py-1 rounded-md text-sm">
                  {partnerProfile ? (partnerProfile.display_name || partnerProfile.name) : 'Partner'}
                </div>
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
