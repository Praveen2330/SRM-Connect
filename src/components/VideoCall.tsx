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
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  useEffect(() => {
    const setupCall = async () => {
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

        initPeer(stream, isInitiator);
      } catch (err) {
        console.error("Video call setup error:", err);
      }
    };

    setupCall();

    return () => {
      peerRef.current?.destroy();
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, [sessionId]);

  const initPeer = (stream: MediaStream, isInitiator: boolean) => {
    const peer = new SimplePeer({
      initiator: isInitiator,
      stream,
      trickle: false,
      config: {
        iceServers: [
          { urls: "stun:openrelay.metered.ca:80" },
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
          },
          {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject"
          }
        ]
      }
    });

    peerRef.current = peer;

    peer.on("signal", async (data) => {
      await supabase
        .from("video_sessions")
        .update({ signal_data: { senderId: userId, signal: data } })
        .eq("id", sessionId);
    });

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
          if (session.signal_data.senderId === userId) return;
          peer.signal(session.signal_data.signal);
        }
      )
      .subscribe();

    peer.on("stream", (remote: MediaStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remote;
        remoteVideoRef.current.play().catch(() => {});
      }
    });

    peer.on("error", (err) => console.error("Peer error:", err));
  };

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setIsMuted(prev => !prev);
  };

  const toggleVideo = () => {
    localStream?.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
    setIsVideoEnabled(prev => !prev);
  };

  const endCall = async () => {
    peerRef.current?.destroy();
    localStream?.getTracks().forEach(t => t.stop());

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

      <div className="bg-zinc-900 p-4 flex justify-center gap-4">
        <button onClick={toggleMute} className={`p-4 rounded-full ${isMuted ? "bg-red-500" : "bg-zinc-700"}`}>
          {isMuted ? <MicOff /> : <Mic />}
        </button>

        <button onClick={endCall} className="p-4 bg-red-500 rounded-full">
          <PhoneOff />
        </button>

        <button onClick={toggleVideo} className={`p-4 rounded-full ${!isVideoEnabled ? "bg-red-500" : "bg-zinc-700"}`}>
          {isVideoEnabled ? <Video /> : <VideoOff />}
        </button>
      </div>
    </div>
  );
}