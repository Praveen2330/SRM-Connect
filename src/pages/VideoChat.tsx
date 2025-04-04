import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Peer from 'simple-peer';
import { supabase } from '../lib/supabase';
import { MessageCircle, X, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  content: string;
  timestamp: Date;
}

export default function VideoChat() {
  const navigate = useNavigate();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Starting camera...');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string>('');

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
    initializeMedia();

    return () => {
      stopAllMediaTracks();
      peerRef.current?.destroy();
    };
  }, [navigate]);

  const initializeMedia = async () => {
    try {
      setConnectionStatus('Requesting camera and microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      console.log('Got local media stream');
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      setConnectionStatus('Camera active. Join a call or wait for someone to connect.');
    } catch (err) {
      console.error('Failed to get user media:', err);
      setConnectionStatus('Failed to access camera');
      setError('Failed to access camera and microphone. Please ensure you have granted permission.');
      toast.error('Camera access failed. Please check your permissions.');
    }
  };

  const stopAllMediaTracks = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
      });
      setLocalStream(null);
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        track.stop();
      });
      setRemoteStream(null);
    }
  };

  const handleEndCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
    
    setIsConnected(false);
    setConnectionStatus('Call ended');
    toast.success('Call ended');
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    
    const message = {
      id: Date.now().toString(),
      content: newMessage,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, message]);
    setNewMessage('');
    
    // Scroll to bottom of chat
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-zinc-900">
        <h1 className="text-xl font-bold">SRM CONNECT</h1>
        <div>
          {isConnected && (
            <button 
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="mr-2 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700"
            >
              <MessageCircle size={20} />
            </button>
          )}
          <button 
            onClick={handleEndCall}
            className="p-2 rounded-full bg-red-600 hover:bg-red-700"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      
      {/* Video container */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 relative">
        {/* Local video */}
        <div className="relative bg-zinc-900 rounded-lg overflow-hidden">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded">
            You
          </div>
        </div>
        
        {/* Remote video or placeholder */}
        <div className="relative bg-zinc-900 rounded-lg overflow-hidden">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-center text-gray-400">
                {connectionStatus}
              </p>
            </div>
          )}
          {remoteStream && (
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded">
              Partner
            </div>
          )}
        </div>
      </div>
      
      {/* Chat sidebar */}
      {isChatOpen && (
        <div className="absolute right-0 top-0 h-full w-80 bg-zinc-900 shadow-lg flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h2 className="font-bold">Chat</h2>
            <button 
              onClick={() => setIsChatOpen(false)}
              className="p-1 rounded-full hover:bg-zinc-800"
            >
              <X size={16} />
            </button>
          </div>
          
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.map(msg => (
              <div key={msg.id} className="bg-zinc-800 p-2 rounded-lg">
                <p>{msg.content}</p>
                <p className="text-xs text-gray-400">
                  {msg.timestamp.toLocaleTimeString()}
                </p>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="text-center text-gray-400">No messages yet</p>
            )}
          </div>
          
          <div className="p-4 border-t border-zinc-800 flex">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-l-lg px-3 py-2 text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 rounded-r-lg px-3 hover:bg-blue-700"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-600 p-2 text-center">
          {error}
        </div>
      )}
    </div>
  );
}