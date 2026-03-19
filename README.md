# Anime Watch Party Sync

This is a lightweight Node.js application designed to run in a Proxmox container (or any Docker/LXC environment) to automatically synchronize anime watch progress across multiple AniList accounts simultaneously.

## Features
- **Centralized Dashboard**: See who has connected their accounts.
- **One-Click Sync**: Enter the episode number you just finished watching, click sync, and everyone's linked accounts will be updated instantly.

## Prerequisites
- Node.js (v16+)
- A local SQLite database (created automatically on the first run).

---

## 🚀 Easy Setup (Debian 13 / Proxmox)

If you are running **Debian 13** (Trixie) in a Proxmox container, there is a handy auto-install script provided!

```bash
git clone <your-repo-url>
cd anime-sync-app
sudo ./install.sh
```

The script will automatically update the system, install Node.js (v20 LTS), PM2, and SQLite. It will also copy the environment files, install NPM packages, initialize the database, and start the application as a background service using PM2 that persists across reboots.

After running the script, skip to Step 2 below to configure your `.env` file!

---

## 🛠️ Manual Setup Instructions

### 1. Clone & Install
Log into your Proxmox container, navigate to the directory where you want to host this, and run:

```bash
git clone <your-repo-url>
cd anime-sync-app
npm ci
```

### 2. Configure Environment Variables
You need to create a `.env` file to hold your API keys.

```bash
cp .env.example .env
```

Now you need to generate API keys for AniList.

#### 🔑 Getting AniList API Keys
1. Go to your [AniList Developer Settings](https://anilist.co/settings/developer).
2. Click **Create New Client**.
3. Set the name to "Anime Watch Party Sync".
4. Set the **Redirect URL** to: `http://<YOUR_CONTAINER_IP>:3000/auth/anilist/callback` *(replace `<YOUR_CONTAINER_IP>` with your Proxmox container's IP address, or `localhost` if testing locally)*.
5. Save, then copy the **Client ID** and **Client Secret** into your `.env` file under `ANILIST_CLIENT_ID` and `ANILIST_CLIENT_SECRET`.

Update your `.env` file so the redirect URIs match your IP. Example `.env`:
```env
PORT=3000
SESSION_SECRET=super_secret_string_123
ANILIST_CLIENT_ID=your_id_here
ANILIST_CLIENT_SECRET=your_secret_here
ANILIST_REDIRECT_URI=http://192.168.1.50:3000/auth/anilist/callback
```

### 3. Start the Server
*(Skip this step if you used `install.sh` as PM2 will already be running)*

Run the database initializer, then start the server:
```bash
node database.js
node server.js
```

*Note: For a production Proxmox container, it's highly recommended to use a process manager like `pm2` to keep the app running in the background:*
```bash
npm i -g pm2
pm2 start server.js --name anime-sync
pm2 save
pm2 startup
```

## How to Use
1. **Connect Accounts**: Have your two friends navigate to `http://<YOUR_CONTAINER_IP>:3000` in their web browsers.
2. They should click **Connect AniList**. This creates their profile in the database.
3. **Syncing**: Every Friday, simply pull up the dashboard, search for the anime you are watching, input the episode number, and click **Sync to All**.
