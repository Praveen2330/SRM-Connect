#!/bin/bash

# Script to deploy the Socket.IO server to Render

# Check if render-cli is installed
if ! command -v render &> /dev/null; then
    echo "render-cli is not installed. Please install it first."
    echo "npm install -g @render/cli"
    exit 1
fi

# Check if user is logged in to Render
render whoami || {
    echo "Please log in to Render first using 'render login'"
    exit 1
}

# Deploy to Render
echo "Deploying Socket.IO server to Render..."
render deploy --yaml render.yaml

echo "Deployment initiated. Check the Render dashboard for status."
echo "Once deployed, update the VITE_SOCKET_URL in your Vercel environment variables."
echo "VITE_SOCKET_URL=https://srm-connect-socket.onrender.com"