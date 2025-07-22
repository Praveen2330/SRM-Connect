# SRM Connect Frontend Deployment to Vercel

This document provides detailed instructions for deploying the SRM Connect frontend to Vercel.

## Prerequisites

- A GitHub repository with your SRM Connect code
- A Vercel account (https://vercel.com)
- Your Supabase project URL and anonymous key
- Your backend and Socket.IO server URLs (from Render deployment)

## Deployment Steps

1. **Prepare your frontend code**
   - Run the deployment script to test your configuration:
     ```
     ./deploy-vercel.sh
     ```
   - Make sure your `.env.production` file is properly configured with the following variables:
     ```
     VITE_SUPABASE_URL=https://pmmqhthyjvtfavylvimu.supabase.co
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     VITE_BACKEND_URL=https://srm-connect-backend.onrender.com
     VITE_SOCKET_URL=https://srm-connect-socket.onrender.com
     ```
   - Commit and push your changes to GitHub

2. **Deploy to Vercel**
   - Log in to [Vercel](https://vercel.com)
   - Click "Add New..." > "Project"
   - Import your GitHub repository
   - Configure the project:
     - Framework Preset: Vite
     - Root Directory: Leave blank (unless your frontend is in a subdirectory)
     - Build Command: `npm run build`
     - Output Directory: `dist`
   - Add the environment variables from your `.env.production` file:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_BACKEND_URL`
     - `VITE_SOCKET_URL`
   - Click "Deploy"

3. **Verify Deployment**
   - Once deployment is complete, Vercel will provide you with a URL (e.g., `https://srm-connect.vercel.app`)
   - Visit the URL to ensure your frontend is working correctly
   - Test the following features:
     - Login/Authentication
     - Chat functionality
     - Video calls
     - Profile management
   - Check the browser console for any connection errors

## Custom Domain (Optional)

1. **Add a custom domain**
   - In your Vercel project dashboard, go to "Settings" > "Domains"
   - Click "Add" and enter your domain name
   - Follow the instructions to configure your DNS settings

2. **Update backend configuration**
   - If you add a custom domain, update the `FRONTEND_URL` environment variable in your Render backend service
   - Update the `ALLOWED_ORIGINS` environment variable in your Socket.IO server to include your custom domain

## Troubleshooting

- **Build Errors**: Check the Vercel build logs for any errors during the build process
- **Connection Issues**: If your frontend can't connect to the backend or Socket.IO server, verify the environment variables are set correctly
- **CORS Errors**: Ensure your backend and Socket.IO server are configured to accept requests from your Vercel domain
- **Authentication Problems**: Check that your Supabase configuration is correct

## Updating Your Deployment

When you make changes to your code:

1. Test locally first
2. Run `./deploy-vercel.sh` to verify your build
3. Push the changes to GitHub
4. Vercel will automatically detect the changes and redeploy your frontend
5. Monitor the deployment logs for any errors

## Vercel Analytics (Optional)

1. **Enable Analytics**
   - In your Vercel project dashboard, go to "Analytics"
   - Click "Enable Analytics"
   - Follow the instructions to add the analytics script to your application

2. **View Analytics**
   - After enabling analytics, you can view metrics such as:
     - Page views
     - Unique visitors
     - Performance metrics
     - Error rates

## Important Notes

- Vercel's free tier has limitations on build minutes and bandwidth
- Consider upgrading to a paid plan for production use
- Keep your environment variables secure and never commit them to your repository