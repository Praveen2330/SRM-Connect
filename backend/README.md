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

## Development

The server is configured to run on port 3000 by default. Make sure this port is available when starting the server. 