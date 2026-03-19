#!/bin/bash

# Anime Watch Party Sync - Debian 13 (Trixie) Installation Script
# Run this script with root privileges (sudo)

set -e # Exit immediately if a command exits with a non-zero status

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run this script as root (use sudo)."
  exit 1
fi

echo "========================================================"
echo "    Installing Dependencies for Anime Sync Application  "
echo "========================================================"

echo ">> Updating system packages..."
apt update && apt upgrade -y

echo ">> Installing required utilities (curl, git, build-essential)..."
apt install -y curl git build-essential sqlite3

echo ">> Installing Node.js (via NodeSource)..."
# Debian 13 supports the latest LTS (e.g., Node 20 or 22)
curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup.sh
bash nodesource_setup.sh
apt install -y nodejs
rm nodesource_setup.sh

echo ">> Installing pm2 globally for process management..."
npm install -g pm2

echo "========================================================"
echo "    Setting up the Application                          "
echo "========================================================"

# Check if we are already inside the cloned repository
if [ -f "package.json" ] && grep -q "anime-watch-party-sync" package.json 2>/dev/null; then
  echo ">> Found application files in current directory."
  APP_DIR=$(pwd)
else
  # Otherwise, create a directory and copy everything here, or clone if this was standalone
  # For the sake of this script, we assume they clone first, then run install.sh from inside it.
  echo ">> Assuming we are in the application root."
  APP_DIR=$(pwd)
fi

echo ">> Installing npm dependencies..."
npm install

echo ">> Setting up environment file..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo ">> Created .env from .env.example. Please edit .env with your API keys later."
else
  echo ">> .env file already exists, skipping."
fi

echo ">> Initializing database..."
node database.js

echo "========================================================"
echo "    Starting the Application                            "
echo "========================================================"

echo ">> Starting application with pm2..."
pm2 delete anime-sync 2>/dev/null || true
pm2 start server.js --name anime-sync
pm2 save

# Automatically setup PM2 startup script for the current user (root)
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

echo "========================================================"
echo "    Installation Complete!                              "
echo "========================================================"
echo "1. The app is running via pm2 on port 3000."
echo "2. You MUST edit the .env file in ${APP_DIR} to add your AniList API keys."
echo "3. Run 'pm2 restart anime-sync' after updating the .env file."
echo "4. Access the app at http://<your_server_ip>:3000"
