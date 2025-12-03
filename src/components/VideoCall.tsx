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
    const initialize = async () => {
      try {
        const { data } = await supabase
          .from("video_sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        const isInitiator = data.caller_id === userId;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        initializePeerConnection(stream, isInitiator);
      } catch (error) {
        console.error("Error setting up video call:", error);
      }
    };

    initialize();

    return () => {
      peerRef.current?.destroy();
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [sessionId]);

  const initializePeerConnection = (stream: MediaStream, isInitiator: boolean) => {
    const peer = new SimplePeer({
      initiator: isInitiator,
      stream,
      trickle: false
    });

    peer.on("signal", async (signal) => {
      await supabase
        .from("video_sessions")
        .update({
          signal_data: { senderId: userId, signal }
        })
        .eq("id", sessionId);
    });

    peer.on("stream", (remote) => {
      setRemoteStream(remote);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
    });

    peerRef.current = peer;

    supabase
      .channel(`video_session_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "video_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const session = payload.new as VideoSession;
          if (!session.signal_data) return;

          const { senderId, signal } = session.signal_data;
          if (senderId === userId) return; // ⛔ ignore own signal

          peer.signal(signal);
        }
      )
      .subscribe();
  };

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsMuted((prev) => !prev);
  };

  const toggleVideo = () => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setIsVideoEnabled((prev) => !prev);
  };

  const handleEndCall = async () => {
    peerRef.current?.destroy();
    localStream?.getTracks().forEach((t) => t.stop());

    await supabase
      .from("video_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    onEndCall();
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
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

      <div className="bg-zinc-900 p-4">
        <div className="max-w-md mx-auto flex items-center justify-center gap-4">
          <button onClick={toggleMute} className={`p-4 rounded-full ${isMuted ? "bg-red-500" : "bg-zinc-700"}`}>
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          <button onClick={handleEndCall} className="p-4 bg-red-500 rounded-full">
            <PhoneOff className="w-6 h-6" />
          </button>

          <button onClick={toggleVideo} className={`p-4 rounded-full ${!isVideoEnabled ? "bg-red-500" : "bg-zinc-700"}`}>
            {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
}