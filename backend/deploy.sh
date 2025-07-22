#!/bin/bash

# Script to prepare main backend server for Render deployment

# Create .env.production if it doesn't exist
if [ ! -f .env.production ]; then
  echo "Creating .env.production file..."
  cat > .env.production << EOL
PORT=10000
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
FRONTEND_URL=https://srm-connect.vercel.app
EOL
  echo "Please update the .env.production file with your actual values."
fi

# Copy .env.production to .env for local testing
cp .env.production .env

# Install dependencies
npm install

# Run a quick test to make sure the server starts correctly
echo "Starting server for testing..."
node -e "try { const server = require('./server.js'); setTimeout(() => process.exit(0), 3000); } catch(e) { console.error(e); process.exit(1); }"

if [ $? -eq 0 ]; then
  echo "Server started successfully. Ready for deployment to Render."
  echo "Push your changes to GitHub and deploy on Render."
else
  echo "Server failed to start. Please check your configuration."
  exit 1
fi