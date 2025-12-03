require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js'); // Add this line

const app = express();
const server = http.createServer(app);

// CORS configuration - more permissive at the Express level
app.use(cors({
  origin: '*',  // Allow all origins for Express routes
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add specific CORS headers for preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.sendStatus(200);
});

// Get the port from environment variable or use 3002 as fallback
const PORT = process.env.PORT || 3002;

// Configure Socket.IO with CORS settings
const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : [
            'https://srmconnect2025.vercel.app',
            'https://srm-connect.vercel.app',
          ])
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
      ];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['*'],
  },
  // Explicitly configure transport options
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Allow Engine.IO v3 client compatibility
  pingTimeout: 120000, // Increased to 2 minutes to tolerate background tabs
  pingInterval: 30000, // Increased to 30 seconds for better tolerance
  // Use the default Socket.IO path (/socket.io). If you change this, also update the client.
  // path: '/socket.io',
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
// Active instant chats
const activeInstantChats = new Map();
// Chat messages buffer (for reporting)
const chatMessagesBuffer = new Map();
// Connection requests
const connectionRequests = new Map();
// Reports storage (in-memory for now)
const userReports = [];

// Function to broadcast active users count
const broadcastActiveUsersCount = () => {
  const count = activeConnections.size;
  io.emit('active_users_count', count);
  console.log(`Broadcasting active users count: ${count}`);
};

// Socket.IO connection handler
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  console.log(`User connected: ${userId}`);
  
  // Store user connection
  activeConnections.set(userId, socket.id);
  
  // Broadcast updated active users count
  broadcastActiveUsersCount();
  
  // Handle get active users count request
  socket.on('get_active_users', () => {
    socket.emit('active_users_count', activeConnections.size);
  });
  
  // Handle join queue request for video chat
  socket.on('join_queue', (userData) => {
    console.log(`User ${userData.userId} joined the video queue`);
    
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
      preferences: userData.preferences || {},
      joinTime: Date.now()
    });
    
    // Try to match users
    matchUsers();
  });

  // Handle join instant chat queue
  socket.on('join_instant_chat_queue', (userData) => {
    console.log(`User ${userData.userId} joined the instant chat queue`);
    
    // Check if user is already in an active chat
    for (const [chatId, chat] of activeInstantChats.entries()) {
      if (chat.user1Id === userData.userId || chat.user2Id === userData.userId) {
        console.log(`User ${userData.userId} is already in an active chat`);
        socket.emit('already-in-chat', { chatId });
        return;
      }
    }
    
    // Find a match based on preferences
    findInstantChatMatch(userData, socket);
  });
  
  // Handle instant chat messages
  socket.on('chat-message', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      // Generate a unique message ID
      const messageId = uuidv4();
      
      // Create message object
      const messageObj = {
        id: messageId,
        message: data.message,
        from: data.from,
        senderName: data.senderName || 'Anonymous',
        timestamp: Date.now()
      };
      
      // Store message in buffer for potential reporting
      for (const [chatId, chat] of activeInstantChats.entries()) {
        if ((chat.user1Id === data.from && chat.user2Id === data.to) || 
            (chat.user2Id === data.from && chat.user1Id === data.to)) {
          
          // Initialize chat buffer if it doesn't exist
          if (!chatMessagesBuffer.has(chatId)) {
            chatMessagesBuffer.set(chatId, []);
          }
          
          // Add message to buffer
          const chatBuffer = chatMessagesBuffer.get(chatId);
          chatBuffer.push(messageObj);
          
          // Limit buffer size to last 100 messages
          if (chatBuffer.length > 100) {
            chatBuffer.shift();
          }
          
          break;
        }
      }
      
      // Send message to recipient
      io.to(partnerSocketId).emit('chat-message', messageObj);
    }
  });
  
  // Handle end instant chat
  socket.on('end-chat', (data) => {
    endInstantChat(userId, data.partnerId);
  });
  
  // Handle skip and find new chat
  socket.on('skip-chat', (data) => {
    // Check if data and partnerId exist before proceeding
    if (data && data.partnerId) {
      // End current chat
      endInstantChat(userId, data.partnerId);
      
      // Find a new match
      const userData = {
        userId: userId,
        socketId: socket.id,
        displayName: data.displayName || 'Anonymous',
        preferences: data.preferences || {}
      };
      
      findInstantChatMatch(userData, socket);
    } else {
      console.log(`Skip chat called with invalid data from user ${userId}`);
      socket.emit('error', { message: 'Invalid skip chat request' });
    }
  });
  
  // Handle report user
  socket.on('report_user', async (reportData) => {
    console.log('Report received:', reportData);
    
    try {
      // Create report object
      const report = {
        id: Date.now().toString(),
        reporterId: reportData.reporterId,
        reportedUserId: reportData.reportedUserId,
        reason: reportData.reason,
        description: reportData.description,
        timestamp: new Date().toISOString(),
        chatTranscript: reportData.chatTranscript || [],
        status: 'pending'
      };
      
      // Store in memory (as fallback)
      userReports.push(report);
      
      // Store in Supabase if available
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('reported_chats')
            .insert([
              {
                reporter_id: reportData.reporterId,
                reported_id: reportData.reportedUserId,
                chat_session_id: reportData.sessionId || uuidv4(),
                reason: reportData.reason,
                description: reportData.description || '',
                transcript: reportData.chatTranscript || [],
                status: 'pending'
              }
            ]);
            
          if (error) {
            console.error('Error storing report in database:', error);
          } else {
            console.log('Report stored in database successfully');
          }
        } catch (dbError) {
          console.error('Exception storing report in database:', dbError);
        }
      }
      
      console.log(`Report stored. Total in-memory reports: ${userReports.length}`);
      
      // Acknowledge receipt
      socket.emit('report_submitted', { success: true });
    } catch (error) {
      console.error('Error processing report:', error);
      socket.emit('report_submitted', { success: false, error: error.message });
    }
  });
  
  // Admin endpoint to get all reports
  socket.on('admin_get_reports', async () => {
    if (supabase) {
      try {
        // Fetch reports from database
        const { data, error } = await supabase
          .from('reported_chats')
          .select('*')
          .order('reported_at', { ascending: false });
          
        if (error) {
          console.error('Error fetching reports from database:', error);
          socket.emit('admin_reports', userReports); // Fallback to in-memory reports
        } else {
          console.log(`Sending ${data.length} reports from database to admin`);
          socket.emit('admin_reports', data);
        }
      } catch (dbError) {
        console.error('Exception fetching reports from database:', dbError);
        socket.emit('admin_reports', userReports); // Fallback to in-memory reports
      }
    } else {
      console.log('Admin requested reports, sending in-memory reports:', userReports.length);
      socket.emit('admin_reports', userReports);
    }
  });
  
  // Admin endpoint to update report status
  socket.on('admin_update_report', async (data) => {
    const { reportId, status, adminNotes } = data;
    
    // Update in-memory report
    const reportIndex = userReports.findIndex(r => r.id === reportId);
    if (reportIndex !== -1) {
      userReports[reportIndex] = {
        ...userReports[reportIndex],
        status,
        adminNotes: adminNotes || userReports[reportIndex].adminNotes,
        reviewedAt: new Date().toISOString()
      };
    }
    
    // Update in database if available
    if (supabase) {
      try {
        const { data: updateData, error } = await supabase
          .from('reported_chats')
          .update({
            status: status,
            admin_notes: adminNotes,
            reviewed_at: new Date().toISOString()
          })
          .eq('id', reportId);
          
        if (error) {
          console.error('Error updating report in database:', error);
          // Still send success for in-memory update
          if (reportIndex !== -1) {
            socket.emit('admin_report_updated', { 
              success: true, 
              report: userReports[reportIndex],
              note: 'Updated in memory only, database update failed'
            });
          } else {
            socket.emit('admin_report_updated', { 
              success: false, 
              error: 'Report not found in memory and database update failed'
            });
          }
        } else {
          console.log(`Report ${reportId} updated in database to status: ${status}`);
          socket.emit('admin_report_updated', { 
            success: true, 
            report: reportIndex !== -1 ? userReports[reportIndex] : { id: reportId, status }
          });
        }
      } catch (dbError) {
        console.error('Exception updating report in database:', dbError);
        // Still send success for in-memory update
        if (reportIndex !== -1) {
          socket.emit('admin_report_updated', { 
            success: true, 
            report: userReports[reportIndex],
            note: 'Updated in memory only, database update failed'
          });
        } else {
          socket.emit('admin_report_updated', { 
            success: false, 
            error: 'Report not found in memory and database update failed'
          });
        }
      }
    } else {
      // No database, just use in-memory update
      if (reportIndex !== -1) {
        socket.emit('admin_report_updated', { success: true, report: userReports[reportIndex] });
        console.log(`Report ${reportId} updated in memory to status: ${status}`);
      } else {
        socket.emit('admin_report_updated', { success: false, error: 'Report not found' });
      }
    }
  });
  
  // Legacy report handler - keeping for backward compatibility
  socket.on('report-user', async (data) => {
    console.log(`Legacy report received from ${data.reporterId} for user ${data.reportedId}: ${data.reason}`);
    
    // Store in the new format as well
    const report = {
      id: Date.now().toString(),
      reporterId: data.reporterId,
      reportedUserId: data.reportedId,
      reason: data.reason,
      description: data.description || '',
      timestamp: new Date().toISOString(),
      chatTranscript: [],
      status: 'pending'
    };
    
    userReports.push(report);
    
    // Find the chat session
    let chatId = null;
    let transcript = [];
    
    for (const [id, chat] of activeInstantChats.entries()) {
      if ((chat.user1Id === data.reporterId && chat.user2Id === data.reportedId) ||
          (chat.user2Id === data.reporterId && chat.user1Id === data.reportedId)) {
        chatId = id;
        break;
      }
    }
    
    if (chatId) {
      // Get chat transcript from buffer
      transcript = chatMessagesBuffer.get(chatId) || [];
      
      // Store in Supabase if available
      if (supabase) {
        try {
          const { data: insertData, error } = await supabase
            .from('reported_chats')
            .insert([
              {
                reporter_id: data.reporterId,
                reported_id: data.reportedId,
                chat_session_id: chatId,
                reason: data.reason,
                description: data.description || '',
                transcript: transcript,
                status: 'pending'
              }
            ]);
            
          if (error) {
            console.error('Error storing legacy report in database:', error);
          } else {
            console.log('Legacy report stored in database successfully');
          }
        } catch (dbError) {
          console.error('Exception storing legacy report in database:', dbError);
        }
      }
      
      // Send transcript with the report
      socket.emit('report-received', { 
        success: true, 
        chatId,
        transcript
      });
      
      // End the chat
      endInstantChat(data.reporterId, data.reportedId);
    } else {
      socket.emit('report-received', { 
        success: false, 
        error: 'Chat session not found' 
      });
    }
  });
  
  // Handle connection request
  socket.on('connection-request', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      // Store connection request
      connectionRequests.set(`${userId}-${data.to}`, {
        from: userId,
        to: data.to,
        timestamp: Date.now()
      });
      
      // Notify partner
      io.to(partnerSocketId).emit('connection-request', {
        from: userId
      });
    }
  });
  
  // Handle connection acceptance
  socket.on('connection-accepted', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      // Remove connection request
      connectionRequests.delete(`${data.to}-${userId}`);
      
      // Notify partner
      io.to(partnerSocketId).emit('connection-accepted', {
        from: userId
      });
    }
  });
  
  // Handle connection rejection
  socket.on('connection-rejected', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      // Remove connection request
      connectionRequests.delete(`${data.to}-${userId}`);
      
      // Notify partner
      io.to(partnerSocketId).emit('connection-rejected', {
        from: userId
      });
    }
  });
  
  // Handle when a user creates an offer (for video chat)
  socket.on('offer', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('offer', {
        offer: data.offer,
        from: data.from
      });
    }
  });
  
  // Handle when a user sends an answer (for video chat)
  socket.on('answer', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('answer', {
        answer: data.answer,
        from: data.from
      });
    }
  });
  
  // Handle ICE candidates (for video chat)
  socket.on('ice-candidate', (data) => {
    const partnerSocketId = activeConnections.get(data.to);
    if (partnerSocketId) {
      // Relay the entire candidate object exactly as received
      io.to(partnerSocketId).emit('ice-candidate', {
        candidate: data.candidate, // full candidate object (should include candidate, sdpMid, sdpMLineIndex)
        from: data.from || socket.userId
      });
    }
  });
  
  // Handle end video call
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
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${userId}`);
    
    // Remove from active connections
    activeConnections.delete(userId);
    
    // Broadcast updated active users count
    broadcastActiveUsersCount();
    
    // Remove from queue if present
    const queueIndex = userQueue.findIndex(user => user.userId === userId);
    if (queueIndex !== -1) {
      userQueue.splice(queueIndex, 1);
    }
    
    // Handle active video matches
    for (const [matchId, match] of activeMatches.entries()) {
      if (match.user1Id === userId || match.user2Id === userId) {
        const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
        const partnerSocketId = activeConnections.get(partnerId);
        console.log(`[GracePeriod] Scheduling cleanup of matchId ${matchId} for disconnected user ${userId}`);
        // Add a 1-minute grace period before removing the match and notifying partner
        setTimeout(() => {
          // Double-check they're still disconnected
          if (!activeConnections.has(userId)) {
            activeMatches.delete(matchId);
            if (partnerSocketId) {
              io.to(partnerSocketId).emit('partner-disconnected', { reason: 'Partner disconnected (after grace period)' });
              console.log(`[GracePeriod] Notified partner (${partnerId}) about disconnection after grace period.`);
            }
            console.log(`[GracePeriod] Cleaned up matchId ${matchId} after grace period for user ${userId}`);
          } else {
            console.log(`[GracePeriod] User ${userId} reconnected, not cleaning up matchId ${matchId}`);
          }
        }, 60000); // 1 minute grace period
        break;
      }
    }
    
    // Handle active instant chats
    for (const [chatId, chat] of activeInstantChats.entries()) {
      if (chat.user1Id === userId || chat.user2Id === userId) {
        const partnerId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
        const partnerSocketId = activeConnections.get(partnerId);
        
        // Notify partner about disconnection
        if (partnerSocketId) {
          io.to(partnerSocketId).emit('chat-ended', { reason: 'Partner disconnected' });
        }
        
        // Remove chat and buffer
        activeInstantChats.delete(chatId);
        chatMessagesBuffer.delete(chatId);
        break;
      }
    }
  });
});

// Function to match users in the video chat queue
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
    
    console.log(`Matched users for video chat: ${user1.userId} and ${user2.userId}`);
  }
}

// Function to find a match for instant chat
function findInstantChatMatch(userData, socket) {
  // Find a suitable match based on preferences
  // In a real system, you would implement more sophisticated matching logic
  // For now, we'll just match with any available user
  
  // Check if there are any other users waiting
  for (const [otherUserId, otherSocketId] of activeConnections.entries()) {
    // Skip self
    if (otherUserId === userData.userId) continue;
    
    // Skip users already in a chat
    let alreadyInChat = false;
    for (const chat of activeInstantChats.values()) {
      if (chat.user1Id === otherUserId || chat.user2Id === otherUserId) {
        alreadyInChat = true;
        break;
      }
    }
    if (alreadyInChat) continue;
    
    // Create a new chat session
    const chatId = uuidv4();
    const chatSession = {
      chatId,
      user1Id: userData.userId,
      user2Id: otherUserId,
      startTime: Date.now(),
      // Set a timer of 5 minutes by default
      timerSeconds: 5 * 60
    };
    
    // Store the chat session
    activeInstantChats.set(chatId, chatSession);
    
    // Initialize message buffer
    chatMessagesBuffer.set(chatId, []);
    
    // Notify both users
    socket.emit('match-found', {
      partnerId: otherUserId,
      sessionId: chatId,
      timerSeconds: chatSession.timerSeconds,
      partnerProfile: {
        id: otherUserId,
        display_name: 'Chat Partner' // In a real system, you would fetch profile details
      }
    });
    
    io.to(otherSocketId).emit('match-found', {
      partnerId: userData.userId,
      sessionId: chatId,
      timerSeconds: chatSession.timerSeconds,
      partnerProfile: {
        id: userData.userId,
        display_name: userData.displayName || 'Chat Partner'
      }
    });
    
    console.log(`Matched users for instant chat: ${userData.userId} and ${otherUserId}`);
    return;
  }
  
  // If no match found, notify the user
  socket.emit('no-match-found', { message: 'No chat partners available at the moment. Please try again later.' });
}

// Function to end an instant chat
function endInstantChat(userId1, userId2) {
  // Find the chat session
  for (const [chatId, chat] of activeInstantChats.entries()) {
    if ((chat.user1Id === userId1 && chat.user2Id === userId2) ||
        (chat.user2Id === userId1 && chat.user1Id === userId2)) {
      
      // Notify both users
      const user1SocketId = activeConnections.get(chat.user1Id);
      const user2SocketId = activeConnections.get(chat.user2Id);
      
      if (user1SocketId) {
        io.to(user1SocketId).emit('chat-ended', { reason: 'Chat ended' });
      }
      
      if (user2SocketId) {
        io.to(user2SocketId).emit('chat-ended', { reason: 'Chat ended' });
      }
      
      // Keep the message buffer for a short time in case of reports
      setTimeout(() => {
        chatMessagesBuffer.delete(chatId);
      }, 60000); // Keep for 1 minute
      
      // Remove chat session
      activeInstantChats.delete(chatId);
      
      console.log(`Ended instant chat between ${chat.user1Id} and ${chat.user2Id}`);
      break;
    }
  }
}

// Move this code block from the end of the file to before the server.listen call (around line 740)

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase credentials in environment variables. Reports will only be stored in memory.');
}

let supabase;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
  console.log('Supabase client initialized');
}

// Start the server
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
