const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize Supabase client with retry logic
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

// Create Supabase client with custom fetch options
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js-node/2.39.7',
    },
  },
  db: {
    schema: 'public'
  }
});

// Test Supabase connection
async function testSupabaseConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const { data, error } = await supabase.from('profiles').select('count').limit(1);
      if (!error) {
        console.log('Successfully connected to Supabase');
        return true;
      }
      console.error(`Attempt ${i + 1}/${retries} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Exponential backoff
    } catch (err) {
      console.error(`Connection attempt ${i + 1}/${retries} failed:`, err);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
  return false;
}

// Test connection on startup
testSupabaseConnection().catch(err => {
  console.error('Failed to connect to Supabase after retries:', err);
  // Continue running the server even if Supabase is not available
});

// Configure allowed origins
const allowedOrigins = [
  'http://localhost:5173',
  'https://srm-connect.vercel.app',
  'https://srm-connect-git-main-praveen2330.vercel.app',
  'https://srm-connect-praveen2330.vercel.app',
  'https://srmconnect2025.vercel.app/'
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

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

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
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  allowUpgrades: true,
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true
  }
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
    // First, let's check ALL profiles to see if any have is_online = true
    const { data: allProfiles, error: allProfilesError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, is_online, last_seen');
      
    if (allProfilesError) {
      console.error('Error fetching all profiles:', allProfilesError);
      return;
    }
    
    console.log('All profiles:', allProfiles);
    console.log('Profiles with is_online=true:', allProfiles.filter(p => p.is_online));
    
    // Now let's try our original query
    const { data: onlineUsers, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, is_online, last_seen')
      .eq('is_online', true);

    if (error) {
      console.error('Error fetching online users:', error);
      return;
    }

    console.log('Broadcasting active users:', onlineUsers);
    
    // Get the active users from our in-memory map as a fallback
    const activeUserIds = Array.from(activeUsers.keys());
    console.log('Active users in memory:', activeUserIds);
    
    // If no online users found in the database but we have active users in memory,
    // get those users from the database
    if ((!onlineUsers || onlineUsers.length === 0) && activeUserIds.length > 0) {
      const { data: fallbackUsers, error: fallbackError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, is_online, last_seen')
        .in('id', activeUserIds);
        
      if (fallbackError) {
        console.error('Error fetching fallback users:', fallbackError);
      } else {
        console.log('Using fallback active users:', fallbackUsers);
        io.emit('activeUsers', fallbackUsers);
        return;
      }
    }
    
    io.emit('activeUsers', onlineUsers || []);
  } catch (error) {
    console.error('Error in broadcastActiveUsers:', error);
  }
}

// Socket.IO connection handling
io.on('connection', async (socket) => {
  console.log('New socket connection:', socket.id);

  if (!socket.user) {
    console.error('No user data in socket');
    socket.disconnect();
    return;
  }

  const userId = socket.user.id;
  console.log('User connected:', userId);

  // Store user's socket connection
  activeUsers.set(userId, socket);
  
  // Update user's online status in the database
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq('id', userId);
    
    if (error) {
      console.error('Error updating online status:', error);
    } else {
      console.log(`User ${userId} marked as online in the database`);
    }
  } catch (err) {
    console.error('Error updating online status:', err);
  }
  
  broadcastActiveUsers(); // Broadcast active users when someone connects

  // Handle find match request
  socket.on('find_match', async (data) => {
    const userId = socket.user.id;
    const { language, age, gender, gender_preference } = data;

    try {
      // Add user to match queue
      const { error: queueError } = await supabase
        .from('match_queue')
        .insert({
          user_id: userId,
          language,
          age_range: `[${age - 2},${age + 2}]`,
          gender,
          gender_preference,
          is_online: true
        });

      if (queueError) {
        console.error('Error adding to queue:', queueError);
        socket.emit('matchError', { error: 'Failed to join match queue' });
        return;
      }

      // Check for compatible matches
      const { data: matches, error: matchError } = await supabase
        .from('match_queue')
        .select('*')
        .eq('is_online', true)
        .not('user_id', 'eq', userId)
        .gt('entered_at', 'now() - interval \'5 minutes\'')
        .order('entered_at', { ascending: true });

      if (matchError) {
        console.error('Error finding matches:', matchError);
        return;
      }

      if (matches && matches.length > 0) {
        const potentialMatch = matches[0];
        const isCompatible = 
          potentialMatch.language === language &&
          gender_preference === potentialMatch.gender &&
          potentialMatch.gender_preference === gender;

        if (isCompatible) {
          const user1 = userId;
          const user2 = potentialMatch.user_id;
          const user1Socket = activeUsers.get(user1);
          const user2Socket = activeUsers.get(user2);

          if (user1Socket && user2Socket) {
            // Create a unique room ID
            const roomId = `room_${user1.substring(0, 4)}_${user2.substring(0, 4)}_${Date.now()}`;
            
            // Add both users to the room
            user1Socket.join(roomId);
            user2Socket.join(roomId);

            // Add to active matches map
            activeMatches.set(roomId, { user1, user2, startedAt: new Date() });

            // Notify both users
            user1Socket.emit('matchFound', {
              partnerId: user2,
              isInitiator: true,
              roomId
            });

            user2Socket.emit('matchFound', {
              partnerId: user1,
              isInitiator: false,
              roomId
            });

            // Remove users from queue
            await supabase
              .from('match_queue')
              .delete()
              .in('user_id', [user1, user2]);
          }
        }
      }
    } catch (error) {
      console.error('Error in matching process:', error);
      socket.emit('matchError', { error: 'Failed to find a match' });
    }
  });

  // Handle signaling
  socket.on('signal', ({ to, signal, roomId }) => {
    console.log('Signal received:', {
      from: socket.id,
      to,
      type: signal.type,
      roomId
    });

    const targetSocket = activeUsers.get(to);
    if (targetSocket) {
      targetSocket.emit('signal', {
        from: socket.id,
        signal,
        roomId
      });
      console.log('Signal forwarded to target user');
    } else {
      console.log('Target user not found for signal');
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

  // Handle like event
  socket.on('like', async ({ partnerId }) => {
    try {
      const partnerSocket = activeUsers.get(partnerId);
      if (!partnerSocket) {
        console.log('Partner not found for like:', partnerId);
        return;
      }

      // Emit liked event to partner
      partnerSocket.emit('liked', { partnerId: userId });

      // Store like in database
      const { error } = await supabase
        .from('likes')
        .insert([
          {
            from_user_id: userId,
            to_user_id: partnerId,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) {
        console.error('Error storing like:', error);
      }

      // Check if it's a match
      const { data: existingLike, error: likeError } = await supabase
        .from('likes')
        .select()
        .eq('from_user_id', partnerId)
        .eq('to_user_id', userId)
        .single();

      if (existingLike && !likeError) {
        // It's a match!
        socket.emit('match', { partnerId });
        partnerSocket.emit('match', { partnerId: userId });

        // Store match in database
        const { error: matchError } = await supabase
          .from('matches')
          .insert([
            {
              user1_id: userId,
              user2_id: partnerId,
              matched_at: new Date().toISOString(),
              status: 'active'
            }
          ]);

        if (matchError) {
          console.error('Error storing match:', matchError);
        }
      }
    } catch (error) {
      console.error('Error handling like:', error);
    }
  });

  // Handle skip event
  socket.on('skip', ({ partnerId }) => {
    try {
      const partnerSocket = activeUsers.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit('skipped', { partnerId: userId });
      }
    } catch (error) {
      console.error('Error handling skip:', error);
    }
  });

  // Handle report event
  socket.on('report', async ({ reportedId, reason }) => {
    try {
      // Store report in database
      const { error } = await supabase
        .from('reports')
        .insert([
          {
            reporter_id: userId,
            reported_id: reportedId,
            reason,
            status: 'pending',
            created_at: new Date().toISOString()
          }
        ]);

      if (error) {
        console.error('Error storing report:', error);
        socket.emit('reportError', { message: 'Failed to submit report' });
      } else {
        socket.emit('reportSuccess', { message: 'Report submitted successfully' });
      }
    } catch (error) {
      console.error('Error handling report:', error);
      socket.emit('reportError', { message: 'Failed to submit report' });
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