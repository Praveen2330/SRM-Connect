require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// CORS configuration
app.use(cors());

// Get the port from environment variable or use 3002 as fallback
const PORT = process.env.PORT || 3002;

// Configure Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    // Allow connections from both the Vercel deployment and local development
    origin: [
      "https://srm-connect-nine.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173" // Vite's default port
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Simple route to check if server is running
app.get('/', (req, res) => {
  res.send('SRM Connect Socket.IO Server is running!');
});

// User queue for matching
const userQueue = [];
// Active connections
const activeConnections = new Map();
// Active matches
const activeMatches = new Map();

// Socket.IO connection handler
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  console.log(`User connected: ${userId}`);
  
  // Store user connection
  activeConnections.set(userId, socket.id);
  
  // Handle join queue request
  socket.on('join_queue', (userData) => {
    console.log(`User ${userData.userId} joined the queue`);
    
    // Remove user from queue if already there
    const existingIndex = userQueue.findIndex(user => user.userId === userData.userId);
    if (existingIndex !== -1) {
      userQueue.splice(existingIndex, 1);
    }
    
    // Add user to queue with timestamp
    userQueue.push({
      userId: userData.userId,
      socketId: socket.id,
      displayName: userData.displayName || 'Anonymous',
      email: userData.email,
      joinTime: Date.now()
    });
    
    // Try to match users
    matchUsers();
  });
  
  // Handle when a user creates an offer
  socket.on('offer', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('offer', {
        offer: data.offer,
        from: data.from
      });
    }
  });
  
  // Handle when a user sends an answer
  socket.on('answer', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('answer', {
        answer: data.answer,
        from: data.from
      });
    }
  });
  
  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('ice-candidate', {
        candidate: data.candidate,
        from: data.from
      });
    }
  });
  
  // Handle chat messages
  socket.on('chat-message', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('chat-message', {
        message: data.message,
        from: data.from,
        timestamp: Date.now(),
        id: uuidv4()
      });
    }
  });
  
  // Handle end call
  socket.on('end-call', () => {
    // Find the match for this user
    for (const [matchId, match] of activeMatches.entries()) {
      if (match.user1Id === userId || match.user2Id === userId) {
        const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
        const partnerSocketId = activeConnections.get(partnerId);
        
        // Notify partner that call has ended
        if (partnerSocketId) {
          io.to(partnerSocketId).emit('call-ended', { reason: 'Partner ended the call' });
        }
        
        // Remove match
        activeMatches.delete(matchId);
        break;
      }
    }
  });
  
  // Handle user reports
  socket.on('report-user', (data) => {
    console.log(`User ${data.reporterId} reported user ${data.reportedId}: ${data.reason}`);
    // Here you would typically store the report in a database
    // For now we just acknowledge it
    socket.emit('report-received', { success: true });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userId}`);
    
    // Remove from active connections
    activeConnections.delete(userId);
    
    // Remove from queue if present
    const queueIndex = userQueue.findIndex(user => user.userId === userId);
    if (queueIndex !== -1) {
      userQueue.splice(queueIndex, 1);
    }
    
    // Handle active matches
    for (const [matchId, match] of activeMatches.entries()) {
      if (match.user1Id === userId || match.user2Id === userId) {
        const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
        const partnerSocketId = activeConnections.get(partnerId);
        
        // Notify partner about disconnection
        if (partnerSocketId) {
          io.to(partnerSocketId).emit('partner-disconnected', { reason: 'Partner disconnected' });
        }
        
        // Remove match
        activeMatches.delete(matchId);
        break;
      }
    }
  });
});

// Function to match users in the queue
function matchUsers() {
  if (userQueue.length >= 2) {
    // Get the two users who have been waiting the longest
    const user1 = userQueue.shift();
    const user2 = userQueue.shift();
    
    const matchId = uuidv4();
    
    // Store the match
    activeMatches.set(matchId, {
      matchId,
      user1Id: user1.userId,
      user2Id: user2.userId,
      startTime: Date.now()
    });
    
    // Notify the first user
    io.to(user1.socketId).emit('match-found', {
      partnerId: user2.userId,
      isInitiator: true,
      partnerProfile: {
        id: user2.userId,
        name: user2.displayName,
        display_name: user2.displayName
      }
    });
    
    // Notify the second user
    io.to(user2.socketId).emit('match-found', {
      partnerId: user1.userId,
      isInitiator: false,
      partnerProfile: {
        id: user1.userId,
        name: user1.displayName,
        display_name: user1.displayName
      }
    });
    
    console.log(`Matched users: ${user1.userId} and ${user2.userId}`);
  }
}

// Start the server
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
