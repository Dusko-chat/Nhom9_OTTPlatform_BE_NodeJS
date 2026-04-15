#!/bin/bash

# Navigate to the project directory
# cd /path/to/Nhom9_OTTPlatform_BE_NodeJS/backend-nodejs

# Pull the latest changes from Git
git pull origin main

# Install dependencies
npm install --production

# Restart the application with PM2
pm2 restart ott-backend

# Optional: Cleanup logs
pm2 flush

echo "Deployment finished successfully!"
