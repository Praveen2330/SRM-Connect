const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Get the allowed origins
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  frontendUrl
];

console.log('Allowed origins for CORS:', allowedOrigins);

// Configure CORS
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Add a health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is healthy' });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'SRM Connect Server is running', 
    version: '1.0.0',
    env: process.env.NODE_ENV
  });
});

// Configure Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Store active users and their socket IDs
const activeUsers = new Map();
// Store waiting users with their user IDs
const waitingUsers = new Set();
// Store active matches with user IDs
const activeMatches = new Map();

// Socket.IO middleware for authentication
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.error('No authentication token provided');
      return next(new Error('Authentication token required'));
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error('Auth error:', error);
      return next(new Error('Invalid authentication token'));
    }

    console.log('User authenticated:', user.id);
    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket auth error:', error);
    next(new Error('Authentication failed'));
  }
});

// Function to update user's online status
async function updateUserOnlineStatus(userId, isOnline) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ 
        is_online: isOnline,
        last_seen: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error(`Error updating online status for user ${userId}:`, error);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error in updateUserOnlineStatus for user ${userId}:`, error);
    return false;
  }
}

// Function to broadcast active users
async function broadcastActiveUsers() {
  try {
    const { data: onlineUsers, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, is_online, last_seen')
      .eq('is_online', true);

    if (error) {
      console.error('Error fetching online users:', error);
      return;
    }

    console.log('Broadcasting active users:', onlineUsers);
    io.emit('activeUsers', onlineUsers);
  } catch (error) {
    console.error('Error in broadcastActiveUsers:', error);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);

  if (!socket.user) {
    console.error('No user data in socket');
    socket.disconnect();
    return;
  }

  const userId = socket.user.id;
  console.log('User connected:', userId);

  // Store user's socket connection
  activeUsers.set(userId, socket.id);

  // Handle find match request
  socket.on('findMatch', async () => {
    console.log('Find match request from:', userId);
    
    if (waitingUsers.has(userId)) {
      console.log('User already in waiting list:', userId);
      return;
    }

    // Add user to waiting list
    waitingUsers.add(userId);
    console.log('Added to waiting list:', userId);
    console.log('Current waiting users:', waitingUsers.size);

    // Try to find a match
    for (const potentialMatchId of waitingUsers) {
      if (potentialMatchId !== userId) {
        // Found a match
        waitingUsers.delete(userId);
        waitingUsers.delete(potentialMatchId);

        const roomId = `room_${Date.now()}`;
        activeMatches.set(roomId, { user1: userId, user2: potentialMatchId });

        const user1Socket = io.sockets.sockets.get(activeUsers.get(userId));
        const user2Socket = io.sockets.sockets.get(activeUsers.get(potentialMatchId));

        if (user1Socket && user2Socket) {
          user1Socket.join(roomId);
          user2Socket.join(roomId);

          user1Socket.emit('matchFound', { roomId, partnerId: potentialMatchId, isInitiator: true });
          user2Socket.emit('matchFound', { roomId, partnerId: userId, isInitiator: false });

          console.log('Match created:', { roomId, user1: userId, user2: potentialMatchId });
        }
        break;
      }
    }
  });

  // Handle WebRTC signaling
  socket.on('signal', ({ to, signal }) => {
    const toSocket = io.sockets.sockets.get(activeUsers.get(to));
    if (toSocket) {
      toSocket.emit('signal', { from: userId, signal });
    }
  });

  // Handle message sending
  socket.on('message', async (data) => {
    try {
      const { content, receiver_id, type = 'text', media_url, auto_delete_after_read = false } = data;
      
      console.log('Processing message:', {
        sender: userId,
        receiver: receiver_id,
        type,
        content: content.substring(0, 50) // Log first 50 chars only
      });

      // Save message to database
      const { data: message, error: dbError } = await supabase
        .from('messages')
        .insert({
          sender_id: userId,
          receiver_id,
          content,
          type,
          media_url,
          read: false,
          auto_delete_after_read,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        socket.emit('messageError', { error: 'Failed to save message: ' + dbError.message });
        return;
      }

      // Send to recipient if online
      const recipientSocket = activeUsers.get(receiver_id);
      if (recipientSocket) {
        io.to(recipientSocket).emit('newMessage', message);
      }

      // Confirm to sender
      socket.emit('messageSent', message);
    } catch (error) {
      console.error('Message handling error:', error);
      socket.emit('messageError', { error: error.message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', userId);
    
    // Remove from active users
    activeUsers.delete(userId);
    
    // Remove from waiting list
    waitingUsers.delete(userId);
    
    // Notify partner if in active match
    for (const [roomId, match] of activeMatches.entries()) {
      if (match.user1 === userId || match.user2 === userId) {
        const partnerId = match.user1 === userId ? match.user2 : match.user1;
        const partnerSocket = io.sockets.sockets.get(activeUsers.get(partnerId));
        
        if (partnerSocket) {
          partnerSocket.emit('partnerDisconnected');
        }
        
        activeMatches.delete(roomId);
        break;
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Health check at: http://localhost:${PORT}/health`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
}); 