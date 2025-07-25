# SRM Connect Socket.IO Server

This is the Socket.IO server for the SRM Connect application, handling real-time communication for messaging and video chat features.

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on `.env.example` and configure your environment variables:
   ```
   # Server configuration
   PORT=3002

   # CORS Origins (comma separated list)
   ALLOWED_ORIGINS=https://srm-connect-nine.vercel.app,http://localhost:3000,http://localhost:5173,https://srm-connect.vercel.app

   # Supabase credentials
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Start the development server:
   ```
   npm run dev
   ```

## Deployment to Render

1. Push your code to GitHub

2. Log in to your Render account

3. Create a new Web Service:
   - Connect your GitHub repository
   - Set the name to `srm-connect-socket`
   - Set the root directory to `socketio-server`
   - Set the environment to Node
   - Set the build command to `npm install`
   - Set the start command to `npm start`
   - Choose the Free plan (or a paid plan for production)

4. Add the following environment variables:
   - `NODE_ENV`: production
   - `PORT`: 10000 (Render will use this port)
   - `ALLOWED_ORIGINS`: Comma-separated list of allowed origins (e.g., `https://srm-connect.vercel.app,https://srm-connect-nine.vercel.app`)
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key

5. Click "Create Web Service"

6. After deployment, update your frontend environment variables in Vercel:
   - Add `VITE_SOCKET_URL` with your Render socket.io server URL (e.g., `https://srm-connect-socket.onrender.com`)

## Troubleshooting

- **CORS Issues**: Ensure that your frontend URL is correctly set in the `ALLOWED_ORIGINS` environment variable.
- **Socket.IO Connection Errors**: Check the browser console for specific error messages.
- **Sleep Mode**: The free Render plan puts your service to sleep after 15 minutes of inactivity. The first request after sleep will be slow.