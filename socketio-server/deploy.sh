#!/bin/bash

# Script to prepare Socket.IO server for Render deployment

# Copy .env.production to .env for local testing
cp .env.production .env

# Install dependencies
npm install

# Run a quick test to make sure the server starts correctly
echo "Starting server for testing..."
node -e "const server = require('./server.js'); setTimeout(() => process.exit(0), 3000);"

if [ $? -eq 0 ]; then
  echo "Server started successfully. Ready for deployment to Render."
  echo "Push your changes to GitHub and deploy on Render."
else
  echo "Server failed to start. Please check your configuration."
  exit 1
fi