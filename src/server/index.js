import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? 'https://your-domain.com' 
      : 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// WebSocket handling for real-time features
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle video chat matching
  socket.on('find_match', async (userData) => {
    try {
      // Find a suitable match based on preferences
      const { data: potentialMatches, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', userData.userId)
        .eq('is_online', true)
        .limit(1);

      if (error) throw error;

      if (potentialMatches?.length > 0) {
        const match = potentialMatches[0];
        // Create a video session
        const { data: session, error: sessionError } = await supabase
          .from('video_sessions')
          .insert([{
            user1_id: userData.userId,
            user2_id: match.id,
            status: 'pending'
          }])
          .select()
          .single();

        if (sessionError) throw sessionError;

        // Notify both users
        io.to(socket.id).emit('match_found', { sessionId: session.id, match });
        socket.to(match.id).emit('match_found', { sessionId: session.id, match: userData });
      } else {
        socket.emit('no_match_found');
      }
    } catch (error) {
      console.error('Error in match finding:', error);
      socket.emit('error', { message: 'Failed to find match' });
    }
  });

  // Handle chat messages
  socket.on('send_message', async (messageData) => {
    try {
      const { data: message, error } = await supabase
        .from('messages')
        .insert([{
          match_id: messageData.matchId,
          sender_id: messageData.senderId,
          content: messageData.content
        }])
        .select()
        .single();

      if (error) throw error;

      // Broadcast message to the recipient
      socket.to(messageData.recipientId).emit('new_message', message);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle video chat signaling
  socket.on('signal', (data) => {
    socket.to(data.recipientId).emit('signal', {
      signal: data.signal,
      senderId: socket.id
    });
  });

  socket.on('disconnect', async () => {
    try {
      // Update user's online status
      await supabase
        .from('profiles')
        .update({ 
          is_online: false,
          last_seen: new Date().toISOString()
        })
        .eq('id', socket.id);
    } catch (error) {
      console.error('Error updating offline status:', error);
    }
  });
});

// API Routes
app.get('/api/matches/:userId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        user1:user1_id(id, display_name, avatar_url),
        user2:user2_id(id, display_name, avatar_url)
      `)
      .or(`user1_id.eq.${req.params.userId},user2_id.eq.${req.params.userId}`)
      .eq('status', 'accepted');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:matchId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('match_id', req.params.matchId)
      .order('sent_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});