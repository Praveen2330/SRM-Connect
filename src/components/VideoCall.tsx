import React, { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { supabase } from '../lib/supabase';
import type { VideoSession } from '../lib/supabase';
import { Video, VideoOff, Mic, MicOff, PhoneOff } from 'lucide-react';

interface VideoCallProps {
  sessionId: string;
  userId: string;
  onEndCall: () => void;
}

export default function VideoCall({ sessionId, userId, onEndCall }: VideoCallProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        initializePeerConnection(stream);
      } catch (error) {
        console.error('Error accessing media devices:', error);
      }
    };

    initializeMedia();

    return () => {
      localStream?.getTracks().forEach(track => track.stop());
      peerRef.current?.destroy();
    };
  }, [sessionId]);

  const initializePeerConnection = (stream: MediaStream) => {
    const peer = new SimplePeer({
      initiator: true,
      stream: stream,
      trickle: false
    });
    peer.on('signal', async data => {
      // Send the signal data to the other peer through Supabase
      // Include sender ID to differentiate signals
      await supabase
        .from('video_sessions')
        .update({
          signal_data: {
            senderId: userId, // Assuming userId is available in scope
            signal: data
          }
        })
        .eq('id', sessionId);
    });

      peer.on('stream', stream => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });

      peerRef.current = peer;

      // Listen for the other peer's signal
      const subscription = supabase
        .channel(`video_session_${sessionId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_sessions',
          filter: `id=eq.${sessionId}`,
        }, async (payload) => {
          const session = payload.new as VideoSession;
          if (session.signal_data && peer) {
            peer.signal(session.signal_data.signal);
          }
        })
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    };

    const toggleMute = () => {
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.enabled = !track.enabled;
        });
        setIsMuted(!isMuted);
      }
    };

    const toggleVideo = () => {
      if (localStream) {
        localStream.getVideoTracks().forEach(track => {
          track.enabled = !track.enabled;
        });
        setIsVideoEnabled(!isVideoEnabled);
      }
    };

    const handleEndCall = async () => {
      localStream?.getTracks().forEach(track => track.stop());
      peerRef.current?.destroy();
      await supabase
        .from('video_sessionIds')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
      onEndCall();
    };

    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="flex-1 relative">
          {/* Remote Video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Local Video Preview */}
          <div className="absolute bottom-4 right-4 w-48 h-36 bg-zinc-900 rounded-lg overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 p-4">
          <div className="max-w-md mx-auto flex items-center justify-center gap-4">
            <button
              onClick={toggleMute}
              className={`p-4 rounded-full ${isMuted ? 'bg-red-500' : 'bg-zinc-700'
                } hover:opacity-80 transition-opacity`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>

            <button
              onClick={handleEndCall}
              className="p-4 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
            >
              <PhoneOff className="w-6 h-6" />
            </button>

            <button
              onClick={toggleVideo}
              className={`p-4 rounded-full ${!isVideoEnabled ? 'bg-red-500' : 'bg-zinc-700'
                } hover:opacity-80 transition-opacity`}
            >
              {isVideoEnabled ? (
                <Video className="w-6 h-6" />
              ) : (
                <VideoOff className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }