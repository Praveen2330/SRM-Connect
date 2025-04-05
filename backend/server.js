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

// Configure allowed origins
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5173',
  'https://srm-connect.vercel.app',
  'https://srm-connect-git-main-praveen2330.vercel.app',
  'https://srm-connect-praveen2330.vercel.app',
  'https://srm-connect-nine.vercel.app'  // Add your actual production URL
];

console.log('Allowed origins for CORS:', allowedOrigins);

// Configure CORS
const corsOptions = {
  origin: function (origin, callback) {
    console.log('Incoming request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('Allowing request with no origin');
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('Origin allowed:', origin);
      callback(null, true);
    } else {
      console.error('Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Add OPTIONS handling for preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// Add a health check route
app.get('/health', (req, res) => {
  try {
    console.log('Health check request from:', req.get('origin'));
    res.status(200).json({ 
      status: 'ok', 
      message: 'Server is healthy',
      timestamp: new Date().toISOString(),
      cors: {
        origin: req.get('origin'),
        allowedOrigins
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
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
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
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

  // Handle find match request with improved logging
  socket.on('findMatch', async () => {
    const userId = socket.user.id;
    console.log('\n=== Find Match Request ===');
    console.log('Request from user:', userId);
    console.log('Current waiting users:', Array.from(waitingUsers));
    console.log('Current active matches:', Array.from(activeMatches.entries()));
    console.log('Active users:', Array.from(activeUsers.entries()));
    
    if (!userId) {
      console.error('No user ID in socket');
      socket.emit('error', { message: 'Authentication required' });
      return;
    }
    
    // Check if user is already in waiting list
    if (waitingUsers.has(userId)) {
      console.log('User already in waiting list:', userId);
      socket.emit('error', { message: 'Already waiting for a match' });
      return;
    }

    // Check if user is already in a match
    let userInMatch = false;
    for (const [roomId, match] of activeMatches.entries()) {
      if (match.user1 === userId || match.user2 === userId) {
        console.log('User already in a match:', userId);
        socket.emit('error', { message: 'Already in a match' });
        userInMatch = true;
        break;
      }
    }

    if (userInMatch) return;

    // Add user to waiting list
    waitingUsers.add(userId);
    console.log('Added to waiting list:', userId);
    console.log('Updated waiting users:', Array.from(waitingUsers));

    // Try to find a match
    let matchFound = false;
    for (const potentialMatchId of waitingUsers) {
      // Skip if trying to match with self
      if (potentialMatchId === userId) continue;

      console.log('Attempting to match with:', potentialMatchId);
      
      // Get sockets for both users
      const user1Socket = socket; // Use current socket for user1
      const user2SocketId = activeUsers.get(potentialMatchId);
      const user2Socket = io.sockets.sockets.get(user2SocketId);

      console.log('Socket check:', {
        user1: { id: userId, socketId: socket.id },
        user2: { id: potentialMatchId, socketId: user2SocketId }
      });

      if (!user2Socket) {
        console.error('Partner socket not found, removing from waiting list:', potentialMatchId);
        waitingUsers.delete(potentialMatchId);
        continue;
      }

      // Remove both users from waiting list
      waitingUsers.delete(userId);
      waitingUsers.delete(potentialMatchId);

      // Create a room for the match
      const roomId = `room_${Date.now()}_${userId}_${potentialMatchId}`;
      activeMatches.set(roomId, { 
        user1: userId, 
        user2: potentialMatchId,
        startTime: Date.now()
      });

      // Join both users to the room
      user1Socket.join(roomId);
      user2Socket.join(roomId);

      // Notify both users
      console.log('=== Match Created ===');
      console.log('Room ID:', roomId);
      console.log('User 1:', userId);
      console.log('User 2:', potentialMatchId);

      // Emit events to both users
      io.to(user1Socket.id).emit('matchFound', { 
        roomId, 
        partnerId: potentialMatchId, 
        isInitiator: true 
      });
      
      io.to(user2Socket.id).emit('matchFound', { 
        roomId, 
        partnerId: userId, 
        isInitiator: false 
      });

      // Store match in database
      try {
        const { error } = await supabase
          .from('matches')
          .insert([{
            room_id: roomId,
            user1_id: userId,
            user2_id: potentialMatchId,
            status: 'active',
            created_at: new Date().toISOString()
          }]);

        if (error) {
          console.error('Error storing match in database:', error);
        }
      } catch (error) {
        console.error('Database error:', error);
      }

      matchFound = true;
      break;
    }

    if (!matchFound) {
      console.log('No match found yet for user:', userId);
      socket.emit('status', { message: 'Waiting for a match...' });
    }
  });

  // Handle WebRTC signaling
  socket.on('signal', async ({ to, signal, roomId }) => {
    console.log('Received signal:', {
      from: socket.userId,
      to,
      roomId,
      signalType: signal.type
    });

    // Verify both users are in the same room
    const room = activeMatches.get(roomId);
    if (!room) {
      console.error('Room not found:', roomId);
      socket.emit('error', { message: 'Invalid room' });
      return;
    }

    if (!room.user1 === socket.userId || !room.user2 === to) {
      console.error('Unauthorized signal attempt:', {
        room: room,
        from: socket.userId,
        to
      });
      socket.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Get target socket
    const targetSocket = io.sockets.sockets.get(activeUsers.get(to));
    if (!targetSocket) {
      console.error('Target user not found:', to);
      socket.emit('error', { message: 'User disconnected' });
      
      // Clean up the match
      activeMatches.delete(roomId);
      
      // Update match status in database
      try {
        await supabase
          .from('matches')
          .update({ 
            status: 'disconnected',
            disconnect_reason: 'Partner disconnected during signaling'
          })
          .eq('room_id', roomId);
      } catch (error) {
        console.error('Error updating match status:', error);
      }
      return;
    }

    console.log('Forwarding signal to:', to);
    targetSocket.emit('signal', {
      from: socket.userId,
      signal,
      roomId
    });
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

  // Handle end call
  socket.on('endCall', async ({ partnerId }) => {
    console.log('End call request:', { from: userId, to: partnerId });
    
    // Find the room for this pair
    let roomToEnd = null;
    for (const [roomId, match] of activeMatches.entries()) {
      if ((match.user1 === userId && match.user2 === partnerId) ||
          (match.user1 === partnerId && match.user2 === userId)) {
        roomToEnd = roomId;
        break;
      }
    }

    if (roomToEnd) {
      console.log('Ending call in room:', roomToEnd);
      
      // Get partner's socket
      const partnerSocket = io.sockets.sockets.get(activeUsers.get(partnerId));
      if (partnerSocket) {
        partnerSocket.emit('callEnded', { 
          by: userId,
          roomId: roomToEnd
        });
      }

      // Update match status in database
      try {
        const { error } = await supabase
          .from('matches')
          .update({ 
            status: 'ended',
            ended_at: new Date().toISOString(),
            ended_by: userId
          })
          .eq('room_id', roomToEnd);

        if (error) {
          console.error('Error updating match status:', error);
        }
      } catch (error) {
        console.error('Database error:', error);
      }

      // Clean up the room
      activeMatches.delete(roomToEnd);
      
      // Make both users leave the room
      socket.leave(roomToEnd);
      if (partnerSocket) {
        partnerSocket.leave(roomToEnd);
      }
    }
  });

  // Handle disconnection with improved cleanup
  socket.on('disconnect', async () => {
    console.log('User disconnected:', userId);
    
    // Remove from active users
    activeUsers.delete(userId);
    
    // Remove from waiting list
    waitingUsers.delete(userId);
    
    // Update online status
    await updateUserOnlineStatus(userId, false);
    
    // Handle active matches
    for (const [roomId, match] of activeMatches.entries()) {
      if (match.user1 === userId || match.user2 === userId) {
        const partnerId = match.user1 === userId ? match.user2 : match.user1;
        const partnerSocket = io.sockets.sockets.get(activeUsers.get(partnerId));
        
        if (partnerSocket) {
          partnerSocket.emit('partnerDisconnected', {
            roomId,
            partnerId: userId
          });
        }
        
        // Update match status in database
        try {
          const { error } = await supabase
            .from('matches')
            .update({ 
              status: 'disconnected',
              ended_at: new Date().toISOString(),
              ended_by: userId,
              disconnect_reason: 'user_disconnected'
            })
            .eq('room_id', roomId);

          if (error) {
            console.error('Error updating match status:', error);
          }
        } catch (error) {
          console.error('Database error:', error);
        }
        
        // Clean up the room
        activeMatches.delete(roomId);
        socket.leave(roomId);
        if (partnerSocket) {
          partnerSocket.leave(roomId);
        }
        
        break;
      }
    }

    // Broadcast updated active users
    await broadcastActiveUsers();
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