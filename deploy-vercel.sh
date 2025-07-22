#!/bin/bash

# Script to prepare frontend for Vercel deployment

# Make sure we have the latest dependencies
npm install

# Build the project to test if it works
echo "Building project to test configuration..."
npm run build

if [ $? -eq 0 ]; then
  echo "Build successful. Your project is ready for deployment to Vercel."
  echo "Make sure your .env.production file has the following variables set:"
  echo "VITE_SUPABASE_URL"
  echo "VITE_SUPABASE_ANON_KEY"
  echo "VITE_BACKEND_URL"
  echo "VITE_SOCKET_URL"
  
  echo "\nPush your changes to GitHub and deploy on Vercel."
else
  echo "Build failed. Please check your configuration."
  exit 1
fi