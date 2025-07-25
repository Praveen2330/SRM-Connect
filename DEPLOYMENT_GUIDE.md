# SRM Connect Deployment Guide

This guide will walk you through deploying the SRM Connect application to Vercel (frontend) and Render (backend).

## Prerequisites

- A GitHub account with your code pushed to a repository
- A Vercel account
- A Render account
- Your Supabase project up and running

## Frontend Deployment to Vercel

### 1. Connect Your Repository

1. Log in to your Vercel account
2. Click on "Add New" and select "Project"
3. Import your GitHub repository
4. Select the repository (SRM-Connect)

### 2. Configure Project

1. Configure the project with the following settings:
   - **Framework Preset**: Vite
   - **Root Directory**: ./
   - **Build Command**: npm run build
   - **Output Directory**: dist

2. Add the following environment variables:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `VITE_BACKEND_URL`: Your Render backend URL (after deploying the backend)

3. Click "Deploy"

## Backend Deployment to Render

### 1. Deploy Main Backend

1. Log in to your Render account
2. Click on "New" and select "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: srm-connect-backend
   - **Root Directory**: backend
   - **Runtime**: Node
   - **Build Command**: npm install
   - **Start Command**: npm start
   - **Plan**: Free (or select a paid plan if needed)

5. Add the following environment variables:
   - `NODE_ENV`: production
   - `PORT`: 10000
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `FRONTEND_URL`: Your Vercel frontend URL (e.g., https://srm-connect.vercel.app)

6. Click "Create Web Service"

### 2. Deploy Socket.IO Server

1. In your Render dashboard, click on "New" and select "Web Service"
2. Connect your GitHub repository again
3. Configure the service:
   - **Name**: srm-connect-socket
   - **Root Directory**: socketio-server
   - **Runtime**: Node
   - **Build Command**: npm install
   - **Start Command**: npm start
   - **Plan**: Free (or select a paid plan if needed)

4. Add the following environment variables:
   - `NODE_ENV`: production
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `FRONTEND_URL`: Your Vercel frontend URL

5. Click "Create Web Service"

## Update Frontend Configuration

After deploying both backend services, update your frontend environment variables in Vercel:

1. Go to your project in the Vercel dashboard
2. Navigate to "Settings" > "Environment Variables"
3. Update the `VITE_BACKEND_URL` with your Render backend URL
4. Add `VITE_SOCKET_URL` with your Render socket.io server URL
5. Click "Save" and redeploy your application

## Testing Your Deployment

1. Visit your Vercel frontend URL
2. Test the login functionality
3. Test the messaging and video chat features
4. Check the browser console for any connection errors

## Troubleshooting

1. **CORS Issues**: Ensure that your frontend URL is correctly set in the `FRONTEND_URL` environment variable on both backend services.

2. **Socket.IO Connection Errors**: Check that your frontend is using the correct socket.io server URL.

3. **Application Errors**: Check the Render logs for details on any server-side errors.

4. **Sleep Mode**: The free Render plan puts your service to sleep after 15 minutes of inactivity. The first request after sleep will be slow. Consider upgrading to a paid plan for production use.