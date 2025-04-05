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
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      var msg = 'The CORS policy for this site does not allow access from the specified origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
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
  pingInterval: 25000
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
io.on('connection', async (socket) => {
  try {
    if (!socket.user) {
      console.error('No user data in socket');
      socket.disconnect();
      return;
    }

    const userId = socket.user.id;
    console.log('User connected:', { socketId: socket.id, userId });

    // Store user connection
    activeUsers.set(userId, socket.id);

    // Update user's online status
    try {
      const { error: statusError } = await supabase
        .from('profiles')
        .update({ 
          is_online: true,
          last_seen: new Date().toISOString()
        })
        .eq('id', userId);

      if (statusError) {
        console.error('Error updating online status:', statusError);
      }
    } catch (error) {
      console.error('Error updating online status:', error);
    }

    // Handle find match request
    socket.on('findMatch', async () => {
      console.log('User looking for match:', { socketId: socket.id, userId });

      // Remove user from waiting list if they were waiting
      waitingUsers.delete(userId);

      // If there's someone waiting, create a match
      if (waitingUsers.size > 0) {
        // Find a waiting user that isn't the current user
        const waitingUser = Array.from(waitingUsers).find(id => id !== userId);
        
        if (waitingUser) {
          waitingUsers.delete(waitingUser);

          // Get socket IDs for both users
          const user1SocketId = activeUsers.get(userId);
          const user2SocketId = activeUsers.get(waitingUser);

          if (!user1SocketId || !user2SocketId) {
            console.error('Could not find socket IDs for users:', { userId, waitingUser });
            return;
          }

          // Create a unique room ID using user IDs
          const roomId = `${userId}-${waitingUser}`;
          
          // Store the match using user IDs
          activeMatches.set(userId, waitingUser);
          activeMatches.set(waitingUser, userId);

          // Notify both users with the room ID
          io.to(user1SocketId).emit('matchFound', { 
            roomId,
            partnerId: waitingUser
          });
          
          io.to(user2SocketId).emit('matchFound', { 
            roomId,
            partnerId: userId
          });

          console.log('Match created:', {
            roomId,
            user1: userId,
            user2: waitingUser
          });
        }
      } else {
        // Add user to waiting list
        waitingUsers.add(userId);
        console.log('User added to waiting list:', userId);
      }
    });

    // Handle WebRTC signaling
    socket.on('signal', ({ signal, to }) => {
      const partnerSocketId = activeUsers.get(to);
      if (partnerSocketId) {
        console.log('Forwarding signal from', userId, 'to', to);
        io.to(partnerSocketId).emit('signal', {
          signal,
          from: userId
        });
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
    socket.on('disconnect', async () => {
      console.log('User disconnected:', { socketId: socket.id, userId });
      
      // Remove from active users
      activeUsers.delete(userId);
      
      // Remove from waiting list
      waitingUsers.delete(userId);
      
      // Update online status
      try {
        const { error: statusError } = await supabase
          .from('profiles')
          .update({ 
            is_online: false,
            last_seen: new Date().toISOString()
          })
          .eq('id', userId);

        if (statusError) {
          console.error('Error updating offline status:', statusError);
        }
      } catch (error) {
        console.error('Error updating offline status:', error);
      }
      
      // If they were in a match, notify their partner
      const partnerId = activeMatches.get(userId);
      if (partnerId) {
        const partnerSocketId = activeUsers.get(partnerId);
        if (partnerSocketId) {
          console.log('Notifying partner of disconnection:', partnerId);
          io.to(partnerSocketId).emit('partnerDisconnected');
        }
        
        // Clean up the match
        activeMatches.delete(userId);
        activeMatches.delete(partnerId);
      }
    });

  } catch (error) {
    console.error('Socket connection error:', error);
    socket.disconnect();
  }
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