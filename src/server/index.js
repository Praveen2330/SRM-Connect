import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();

// Configure CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));

// Handle Vite HMR requests
app.get('/vite.svg', (req, res) => {
  res.status(204).end();
});

// Basic route for health check
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Socket.io path route
app.get('/socket.io/', (req, res) => {
  res.json({ status: 'socket.io endpoint' });
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3002', 'http://localhost:5174'],
    methods: ['GET', 'POST']
  }
});

// Store active users, their profiles and sockets
const activeUsers = new Map(); // userId -> socket
const userProfiles = new Map(); // userId -> profile data
const userQueue = new Set(); // Set of userIds in queue

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let userId = null;

  // Log authentication token
  const token = socket.handshake.auth.token;
  console.log('Auth token received:', token ? 'Yes' : 'No');

  // Log transport type
  console.log('Transport type:', socket.conn.transport.name);

  socket.on('join_queue', (data) => {
    userId = data.userId;
    console.log('Received join_queue from:', userId);
    
    if (!userId) {
      console.log('No userId provided');
      return;
    }

    // Store user profile information
    const userProfile = {
      id: data.userId,
      name: data.email || 'Anonymous',
      display_name: data.displayName || 'Anonymous User',
      email: data.email
    };
    
    // Store the profile
    userProfiles.set(userId, userProfile);
    console.log(`Stored profile for ${userId}:`, userProfile);

    // Remove user from any existing matches
    if (activeUsers.has(userId)) {
      console.log(`User ${userId} already in active users, cleaning up...`);
      const oldSocket = activeUsers.get(userId);
      oldSocket.disconnect();
      activeUsers.delete(userId);
      userQueue.delete(userId);
    }

    // Add user to active users and queue
    activeUsers.set(userId, socket);
    userQueue.add(userId);

    console.log(`User ${userId} joined queue`);
    console.log('Active users:', Array.from(activeUsers.keys()));
    console.log('Current queue:', Array.from(userQueue));
    
    // Try to find a match
    findMatch();
  });

  socket.on('chat_message', (data) => {
    const { message, to } = data;
    if (!message || !to) return;

    const recipientSocket = activeUsers.get(to);
    if (recipientSocket) {
      recipientSocket.emit('chat_message', {
        message,
        from: userId
      });
    }
  });

  socket.on('offer', (data) => {
    console.log('Received offer:', data);
    const recipientSocket = activeUsers.get(data.to);
    if (recipientSocket) {
      // Pass the offer exactly as received to maintain proper structure
      recipientSocket.emit('offer', data.offer);
      console.log('Forwarded offer to', data.to);
    } else {
      console.log('Recipient socket not found for', data.to);
    }
  });

  socket.on('leave_queue', () => {
    if (userId) {
      userQueue.delete(userId);
      console.log('User left queue:', userId);
    }
  });

  socket.on('disconnect', () => {
    if (userId) {
      userQueue.delete(userId);
      activeUsers.delete(userId);
      console.log(`User ${userId} disconnected`);
      console.log('Current queue:', Array.from(userQueue));
    }
  });

  // Handle WebRTC signaling
  socket.on('answer', (data) => {
    console.log('Received answer:', data);
    const recipientSocket = activeUsers.get(data.to);
    if (recipientSocket) {
      // Pass the answer exactly as received to maintain proper structure
      recipientSocket.emit('answer', data.answer);
      console.log('Forwarded answer to', data.to);
    } else {
      console.log('Recipient socket not found for', data.to);
    }
  });

  socket.on('ice-candidate', (data) => {
    console.log('Received ICE candidate');
    const recipientSocket = activeUsers.get(data.to);
    if (recipientSocket) {
      recipientSocket.emit('ice-candidate', data.candidate);
      console.log('Forwarded ICE candidate to', data.to);
    } else {
      console.log('Recipient socket not found for', data.to);
    }
  });

  socket.on('end_call', (data) => {
    const partnerSocket = activeUsers.get(data.partnerId);
    if (partnerSocket) {
      partnerSocket.emit('call_ended');
    }
  });

  socket.on('next_match', (data) => {
    const partnerSocket = activeUsers.get(data.partnerId);
    if (partnerSocket) {
      partnerSocket.emit('call_ended');
    }
    if (userId) {
      userQueue.add(userId);
      findMatch(userId);
    }
  });

  socket.on('report_user', (data) => {
    console.log('User reported:', data);
    // TODO: Implement report handling
  });
});

// Function to find a match for a user
const findMatch = () => {
  console.log('Finding match... Queue size:', userQueue.size);
  console.log('Users in queue:', Array.from(userQueue));
  
  if (userQueue.size >= 2) {
    const users = Array.from(userQueue);
    const user1 = users[0];
    const user2 = users[1];

    console.log(`Attempting to match ${user1} with ${user2}`);

    const socket1 = activeUsers.get(user1);
    const socket2 = activeUsers.get(user2);

    if (socket1 && socket2) {
      console.log(`Found valid sockets for both users, creating match`);
      
      // Remove from queue first
      userQueue.delete(user1);
      userQueue.delete(user2);

      // Get user profiles
      const profile1 = userProfiles.get(user1) || { id: user1, name: 'Unknown User' };
      const profile2 = userProfiles.get(user2) || { id: user2, name: 'Unknown User' };
      
      console.log('Sending match with profiles:', profile1, profile2);
      
      // Notify both users of the match with profile information
      socket1.emit('match_found', {
        partnerId: user2,
        isInitiator: true,
        partnerProfile: profile2
      });
      socket2.emit('match_found', {
        partnerId: user1,
        isInitiator: false,
        partnerProfile: profile1
      });

      console.log('Match created and notifications sent');
      console.log('Remaining queue:', Array.from(userQueue));
    } else {
      console.log('Some sockets not found:');
      console.log('socket1:', !!socket1);
      console.log('socket2:', !!socket2);

      // If sockets are not found, clean up
      if (!socket1) {
        console.log(`Cleaning up invalid user ${user1}`);
        userQueue.delete(user1);
        activeUsers.delete(user1);
      }
      if (!socket2) {
        console.log(`Cleaning up invalid user ${user2}`);
        userQueue.delete(user2);
        activeUsers.delete(user2);
      }
    }
  } else {
    console.log('Not enough users in queue for matching');
  }
};

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
