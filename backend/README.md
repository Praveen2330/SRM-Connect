# Video Chat Backend

This is the backend server for the video chat application. It handles WebRTC signaling and user matching.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a .env file with the following variables:
```
PORT=3000
NODE_ENV=development
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
FRONTEND_URL=your_frontend_url
```

3. Start the server:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## Features

- WebRTC signaling
- User matching
- Real-time communication
- CORS support
- Environment configuration

## API Endpoints

The server uses Socket.IO for real-time communication. The following events are supported:

- `findMatch`: Request to find a match
- `matchFound`: Emitted when a match is found
- `signal`: WebRTC signaling
- `partnerDisconnected`: Emitted when a partner disconnects

## Deployment on Render

1. Create a new Web Service on Render
2. Link your GitHub repository
3. Configure the service:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
   - Plan: Free or paid depending on your needs
   
4. Add the following environment variables in Render dashboard:
   - `PORT`: 10000 (Render uses this port by default)
   - `NODE_ENV`: production
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `FRONTEND_URL`: Your Vercel frontend URL (e.g., https://your-app.vercel.app)

5. Deploy the service

## After Deployment

1. Update your frontend code to use the new backend URL:
   - In your frontend `.env.production` file, add:
   ```
   VITE_BACKEND_URL=https://your-app-name.onrender.com
   ```

2. Redeploy your frontend on Vercel

## Development

The server is configured to run on port 3000 by default for local development. Make sure this port is available when starting the server. 