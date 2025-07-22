# SRM Connect Deployment Instructions

## Frontend Deployment (Vercel)

1. **Prepare your frontend code**
   - Make sure your `.env.production` file is properly configured with the following variables:
     ```
     VITE_SUPABASE_URL=https://pmmqhthyjvtfavylvimu.supabase.co
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     VITE_BACKEND_URL=https://srm-connect-backend.onrender.com
     VITE_SOCKET_URL=https://srm-connect-socket.onrender.com
     ```

2. **Deploy to Vercel**
   - Push your code to GitHub
   - Log in to [Vercel](https://vercel.com)
   - Create a new project and import your GitHub repository
   - Configure the project:
     - Framework Preset: Vite
     - Build Command: `npm run build`
     - Output Directory: `dist`
   - Add the environment variables from your `.env.production` file
   - Click "Deploy"

3. **Verify Deployment**
   - Once deployment is complete, Vercel will provide you with a URL
   - Visit the URL to ensure your frontend is working correctly
   - Test the connection to your backend and Socket.IO server

## Backend Deployment (Render)

### Main Backend Server

1. **Prepare your backend code**
   - Make sure your `render.yaml` file is properly configured
   - Ensure your `Procfile` is set up correctly: `web: node server.js`

2. **Deploy to Render**
   - Push your code to GitHub
   - Log in to [Render](https://render.com)
   - Create a new Web Service
   - Connect your GitHub repository
   - Configure the service:
     - Name: `srm-connect-backend`
     - Environment: Node
     - Build Command: `npm install`
     - Start Command: `node server.js`
   - Add the following environment variables:
     - `PORT`: `10000` (Render uses this port by default)
     - `NODE_ENV`: `production`
     - `SUPABASE_URL`: Your Supabase project URL
     - `SUPABASE_ANON_KEY`: Your Supabase anonymous key
     - `FRONTEND_URL`: Your Vercel frontend URL (e.g., `https://srm-connect.vercel.app`)
   - Click "Create Web Service"

### Socket.IO Server

1. **Prepare your Socket.IO server code**
   - Make sure your `socketio-server/render.yaml` file is properly configured
   - Create a `.env.production` file in the `socketio-server` directory with the following variables:
     ```
     PORT=10000
     NODE_ENV=production
     ALLOWED_ORIGINS=https://srm-connect-nine.vercel.app,https://srm-connect.vercel.app
     ```

2. **Deploy to Render**
   - Push your code to GitHub
   - Log in to [Render](https://render.com)
   - Create a new Web Service
   - Connect your GitHub repository
   - Configure the service:
     - Name: `srm-connect-socket`
     - Environment: Node
     - Build Command: `cd socketio-server && npm install`
     - Start Command: `cd socketio-server && node server.js`
   - Add the environment variables from your `.env.production` file
   - Click "Create Web Service"

3. **Update Frontend Configuration**
   - After both backend services are deployed, update your frontend `.env.production` file with the correct URLs
   - Redeploy your frontend on Vercel

## Testing the Deployment

1. Visit your Vercel frontend URL
2. Test the login functionality
3. Test the chat and video features
4. Check the browser console for any connection errors

## Troubleshooting

- If you encounter CORS issues, make sure the `ALLOWED_ORIGINS` environment variable includes your frontend URL
- If Socket.IO connections fail, check that your frontend is using the correct Socket.IO server URL
- For database connection issues, verify your Supabase credentials