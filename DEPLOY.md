# Deploying Multiplayer Tetris on Debian 12

This guide walks you through deploying the Multiplayer Tetris game on a Debian 12 server.
We'll use **Node.js** for the backend, **Vite** for the frontend build, **PM2** for process management, and **Nginx** as a reverse proxy.

## Prerequisites

- A server running **Debian 12**.
- Root or sudo access.
- Basic knowledge of the command line.

## 1. System Setup

Update your system packages:

```bash
sudo apt update && sudo apt upgrade -y
```

Install essential tools:

```bash
sudo apt install -y curl git unzip build-essential
```

## 2. Install Node.js (v18 or later)

We'll use NodeSource to install a recent version of Node.js.

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:

```bash
node -v
npm -v
```

## 3. Project Setup

Upload your project code to the server (e.g., to `/opt/tetris`).

```bash
# Example: Create directory
sudo mkdir -p /opt/tetris
# (Upload your files here)
cd /opt/tetris
```

### Backend Setup

Navigate to the `tetris-shared` directory and install dependencies:

```bash
cd tetris-shared
npm install
```

### Frontend Setup

Navigate to the `tetris-vue` directory and install dependencies:

```bash
cd ../tetris-vue
npm install
```

Build the frontend for production:

```bash
npm run build
```

This will create a `dist` directory in `tetris-vue/dist`.

## 4. Process Management with PM2

Install PM2 globally to keep your backend running:

```bash
sudo npm install -g pm2
```

Start the backend server:

```bash
cd ../tetris-shared
# Start server.js (entry point for backend)
pm2 start server.js --name "tetris-backend"
```

Save the process list and configure PM2 to start on boot:

```bash
pm2 save
pm2 startup
# Follow the command output to enable startup hook
```

## 5. Nginx Configuration

Install Nginx:

```bash
sudo apt install -y nginx
```

Create a new Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/tetris
```

Paste the following configuration (replace `your_domain_or_ip` with your actual domain or server IP):

```nginx
server {
    listen 80;
    server_name your_domain_or_ip;

    # Frontend (Serve Static Files)
    location / {
        root /opt/tetris/tetris-vue/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # Backend (Socket.io & API)
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/tetris /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 6. Firewall (Optional but Recommended)

If you have `ufw` enabled, allow Nginx:

```bash
sudo ufw allow 'Nginx Full'
```

## 7. Verification

Visit `http://your_domain_or_ip` in your browser. The game should load, and you should be able to create rooms and play.

---

## Troubleshooting

- **Backend Logs**: `pm2 logs tetris-backend`
- **Nginx Logs**: `sudo tail -f /var/log/nginx/error.log`
- **Permissions**: Ensure the user running Nginx (usually `www-data` or `root` depending on setup) can read the files in `/opt/tetris`.
