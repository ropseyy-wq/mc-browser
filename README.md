# MC Browser

Play Minecraft from your browser. Each user gets their own bot with a live 3D view.

## Features
- Register/login with username + password
- Add your own private server list
- Each person controls their own bot
- Live 3D world view via prismarine-viewer
- WASD + mouse controls
- Live chat, health, coordinates, player list
- Admin panel (first registered user is admin)
- Works on any cracked/offline Minecraft server

## Supported Versions
1.8.8, 1.12.2, 1.16.5, 1.17.1, 1.18.2, 1.19.4, 1.20.1, 1.20.4, **1.21.1**, 1.21.4

## Setup on GitHub Codespaces (Free)

1. Fork or create a new repo and upload all these files
2. Click **Code → Codespaces → Create codespace**
3. In the terminal:
   ```
   npm install
   node server.js
   ```
4. Codespaces will show a popup — click **Open in Browser** on port 3000
5. Register an account, add a server, click Connect!

## Deploy on Render (Free 24/7)

1. Push to GitHub
2. Go to render.com → New Web Service → connect your repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variable: `SESSION_SECRET` = any random string
6. Deploy!

## Notes

- First registered user automatically becomes admin
- Admin can see all users, active bots, and all servers at /admin
- Each bot uses ~80MB RAM — free Render tier supports ~4-5 simultaneous bots
- Bots disconnect automatically when the browser tab closes
- Prismarine-viewer opens on a separate port per user (3100, 3101, 3102...)
  - On Render you'll need to expose these ports or use a reverse proxy
  - On Codespaces, just forward each port in the Ports tab

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move |
| Space | Jump |
| Shift | Sneak |
| Ctrl | Sprint |
| E | Attack nearest entity |
| Mouse (in 3D view) | Look around |
| T (in chat box) | Send message |
