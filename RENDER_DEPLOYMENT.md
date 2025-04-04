# Deploying SRM Connect Backend to Render

This guide will walk you through deploying the SRM Connect backend to Render.com.

## Prerequisites

- A GitHub account with your code pushed to a repository
- A Render.com account
- Your Supabase project up and running

## Steps to Deploy

### 1. Prepare Your Repository

1. Make sure your backend code has a `package.json` file with correct dependencies
2. Ensure you have a `Procfile` in your backend directory (already created)
3. Commit and push all changes to GitHub

### 2. Create a New Web Service on Render

1. Log in to your Render.com account
2. Click on "New +" and select "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `srm-connect-backend` (or your preferred name)
   - **Region**: Choose the closest to your users
   - **Branch**: `main` (or your deployment branch)
   - **Root Directory**: `backend` (since your backend code is in this folder)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or select a paid plan if needed)

### 3. Configure Environment Variables

In the Render dashboard, add the following environment variables:

- `PORT`: `10000` (Render uses this port by default)
- `NODE_ENV`: `production`
- `SUPABASE_URL`: Your Supabase project URL (e.g., `https://pmmqhthyjvtfavylvimu.supabase.co`)
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `FRONTEND_URL`: Your Vercel frontend URL (e.g., `https://srm-connect.vercel.app`)

### 4. Deploy Your Service

1. Click "Create Web Service"
2. Render will start building and deploying your application
3. Wait for the deployment to complete
4. You'll get a URL like `https://srm-connect-backend.onrender.com`

### 5. Update Your Frontend

1. Update the `.env.production` file in your frontend project:
   ```
   VITE_BACKEND_URL=https://srm-connect-backend.onrender.com
   ```

2. Redeploy your frontend on Vercel to apply the changes

### 6. Test Your Deployment

1. Visit your backend URL directly to see if the server is running:
   - `https://srm-connect-backend.onrender.com/`
   - Should show a JSON response with "SRM Connect Server is running"

2. Check the health endpoint:
   - `https://srm-connect-backend.onrender.com/health`
   - Should return `{"status":"ok","message":"Server is healthy"}`

3. Test the socket.io connection from your frontend:
   - Open your frontend application
   - Try to use the messaging or video chat features
   - Check the browser console for connection details and errors

### Troubleshooting

1. **CORS Issues**: If you encounter CORS errors, check that your frontend URL is correctly set in the `FRONTEND_URL` environment variable.

2. **Socket.IO Connection Errors**: Check the browser console for specific error messages. Make sure your frontend is using the correct backend URL.

3. **Application Errors**: Check the Render logs for details on any server-side errors.

4. **Sleep Mode**: The free Render plan puts your service to sleep after 15 minutes of inactivity. The first request after sleep will be slow. Consider upgrading to a paid plan for production use.

## Monitoring and Scaling

- **Logs**: Access logs from the Render dashboard to monitor for errors
- **Scaling**: Upgrade your plan as needed if you require more resources or need to avoid sleep mode

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Node.js on Render](https://render.com/docs/deploy-node-express-app)
- [Socket.IO Documentation](https://socket.io/docs/v4/) 