# SRM Connect Deployment Instructions

This document provides an overview of the deployment process for SRM Connect. For detailed instructions, please refer to the specific deployment guides for each platform.

## Deployment Overview

SRM Connect consists of three main components that need to be deployed separately:

1. **Frontend (React/Vite)** - Deployed to Vercel
2. **Main Backend Server (Node.js)** - Deployed to Render
3. **Socket.IO Server** - Deployed to Render

## Deployment Scripts

To simplify the deployment process, we've created the following scripts:

- `deploy-vercel.sh` - Prepares the frontend for Vercel deployment
- `backend/deploy.sh` - Prepares the main backend server for Render deployment
- `socketio-server/deploy.sh` - Prepares the Socket.IO server for Render deployment

Run these scripts before deploying to ensure your configuration is correct.

## Detailed Deployment Guides

- [Frontend Deployment to Vercel](./VERCEL_DEPLOYMENT.md)
- [Backend Deployment to Render](./RENDER_DEPLOYMENT.md)

## Deployment Process

1. **Deploy Backend Services First**
   - Deploy the main backend server to Render following the [Backend Deployment Guide](./RENDER_DEPLOYMENT.md)
   - Deploy the Socket.IO server to Render following the same guide
   - Note the URLs of both deployed services

2. **Deploy Frontend**
   - Update your frontend `.env.production` file with the backend and Socket.IO URLs
   - Deploy the frontend to Vercel following the [Frontend Deployment Guide](./VERCEL_DEPLOYMENT.md)

3. **Testing the Complete Deployment**
   - Visit your Vercel frontend URL
   - Test the login functionality
   - Test the chat and video features
   - Check the browser console for any connection errors

## Troubleshooting

If you encounter issues during deployment, refer to the troubleshooting sections in the specific deployment guides:

- [Frontend Troubleshooting](./VERCEL_DEPLOYMENT.md#troubleshooting)
- [Backend Troubleshooting](./RENDER_DEPLOYMENT.md#troubleshooting)