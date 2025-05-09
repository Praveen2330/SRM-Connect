# SRM Connect Socket.IO Server

This is the Socket.IO server for the SRM Connect video chat application.

## Features

- User matching system for video chats
- WebRTC signaling (offers, answers, ICE candidates)
- Real-time chat messaging
- User reporting functionality

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on `.env.example` and configure as needed.

3. Start the development server:
   ```
   npm run dev
   ```

## Deployment to Render

1. Create a new Web Service on Render
2. Connect to your GitHub repository
3. Use the following settings:
   - **Name**: srm-connect-socketio
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add the following environment variables:
   - `PORT`: (Render will provide its own port, but you can leave this as is)
5. Deploy the service
