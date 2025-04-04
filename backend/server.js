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

// Configure CORS
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', process.env.FRONTEND_URL],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Configure Socket.IO
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', process.env.FRONTEND_URL],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Store active users and their socket IDs
const activeUsers = new Map();
// Store waiting users
let waitingUsers = new Set();
// Store active matches
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
    console.log('User connected:', socket.id);
    console.log('Authenticated user:', socket.user.id);

    // Store user connection
    activeUsers.set(socket.user.id, socket.id);

    // Update user's online status
    const statusUpdated = await updateUserOnlineStatus(socket.user.id, true);
    if (statusUpdated) {
      console.log('Updated online status for user:', socket.user.id);
      await broadcastActiveUsers();
    }

    // Handle find match request
    socket.on('findMatch', () => {
      console.log('User looking for match:', socket.id);

      // If user was already waiting, remove them
      waitingUsers.delete(socket.id);

      // If there's someone waiting, create a match
      if (waitingUsers.size > 0) {
        const iterator = waitingUsers.values();
        const partnerId = iterator.next().value;
        waitingUsers.delete(partnerId);

        // Create a unique room ID
        const roomId = `${socket.id}-${partnerId}`;
        
        // Store the match
        activeMatches.set(socket.id, partnerId);
        activeMatches.set(partnerId, socket.id);

        // Notify both users
        io.to(socket.id).emit('matchFound', { roomId });
        io.to(partnerId).emit('matchFound', { roomId });

        console.log('Match created:', roomId);
      } else {
        // Add user to waiting list
        waitingUsers.add(socket.id);
        console.log('User added to waiting list:', socket.id);
      }
    });

    // Handle WebRTC signaling
    socket.on('signal', ({ signal, to }) => {
      console.log('Forwarding signal from', socket.id, 'to', to);
      io.to(to).emit('signal', {
        signal,
        from: socket.id
      });
    });

    // Handle message sending
    socket.on('message', async (data) => {
      try {
        const { content, receiver_id, type = 'text', media_url, auto_delete_after_read = false } = data;
        
        console.log('Processing message:', {
          sender: socket.user.id,
          receiver: receiver_id,
          type,
          content: content.substring(0, 50) // Log first 50 chars only
        });

        // Save message to database
        const { data: message, error: dbError } = await supabase
          .from('messages')
          .insert({
            sender_id: socket.user.id,
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
    socket.on('disconnect', async (reason) => {
      console.log('User disconnected:', socket.id, 'Reason:', reason);
      
      if (socket.user?.id) {
        activeUsers.delete(socket.user.id);

        // Update user's online status
        const statusUpdated = await updateUserOnlineStatus(socket.user.id, false);
        if (statusUpdated) {
          console.log('Updated offline status for user:', socket.user.id);
          await broadcastActiveUsers();
        }

        // Remove from waiting list if they were waiting
        waitingUsers.delete(socket.id);
        
        // If they were in a match, notify their partner
        const partnerId = activeMatches.get(socket.id);
        if (partnerId) {
          console.log('Notifying partner of disconnection:', partnerId);
          io.to(partnerId).emit('partnerDisconnected');
          
          // Clean up the match
          activeMatches.delete(socket.id);
          activeMatches.delete(partnerId);
        }
      }
    });

  } catch (error) {
    console.error('Socket connection error:', error);
    socket.disconnect();
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 