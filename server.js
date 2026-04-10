"use strict";

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const session = require("express-session");
const path = require("path");
const db = require("./db");
const botManager = require("./botManager");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// ---- MIDDLEWARE ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "mc-browser-secret-change-this",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  const user = db.getUserById(req.session.userId);
  if (!user || !user.isAdmin) return res.status(403).json({ error: "Not admin" });
  next();
}

// ---- AUTH ROUTES ----
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: "Username and password required" });
  if (username.length < 3) return res.json({ success: false, error: "Username too short (min 3)" });
  if (password.length < 4) return res.json({ success: false, error: "Password too short (min 4)" });
  const result = db.createUser(username, password);
  if (!result.success) return res.json(result);
  req.session.userId = result.user.id;
  req.session.username = result.user.username;
  res.json({ success: true, username: result.user.username, isAdmin: result.user.isAdmin });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: "Username and password required" });
  const result = db.loginUser(username, password);
  if (!result.success) return res.json(result);
  req.session.userId = result.user.id;
  req.session.username = result.user.username;
  res.json({ success: true, username: result.user.username, isAdmin: result.user.isAdmin });
});

app.post("/api/logout", (req, res) => {
  const userId = req.session.userId;
  if (userId) botManager.killBot(userId);
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  const user = db.getUserById(req.session.userId);
  if (!user) return res.json({ loggedIn: false });
  const botState = botManager.getBotState(req.session.userId);
  res.json({ loggedIn: true, username: user.username, isAdmin: user.isAdmin, bot: botState });
});

// ---- SERVER LIST ROUTES ----
app.get("/api/servers", requireAuth, (req, res) => {
  const servers = db.getServers(req.session.userId);
  res.json(servers);
});

app.post("/api/servers", requireAuth, (req, res) => {
  const { name, ip, port } = req.body;
  if (!name || !ip) return res.json({ success: false, error: "Name and IP required" });
  const server = db.addServer(req.session.userId, name, ip, port || 25565);
  res.json({ success: true, server });
});

app.delete("/api/servers/:id", requireAuth, (req, res) => {
  const removed = db.removeServer(req.session.userId, req.params.id);
  res.json({ success: removed });
});

// ---- BOT ROUTES ----
app.post("/api/bot/join", requireAuth, (req, res) => {
  const { serverId, mcUsername } = req.body;
  if (!serverId || !mcUsername) return res.json({ success: false, error: "serverId and mcUsername required" });
  if (mcUsername.length < 3 || mcUsername.length > 16) return res.json({ success: false, error: "Username must be 3-16 chars" });

  const serverInfo = db.getServerById(serverId);
  if (!serverInfo || serverInfo.userId !== req.session.userId) {
    return res.json({ success: false, error: "Server not found" });
  }

  const userId = req.session.userId;

  // Will forward events to WS client
  const wsClient = userWsMap.get(userId);

  const info = botManager.spawnBot(userId, mcUsername, serverInfo.ip, serverInfo.port, (event) => {
    const ws = userWsMap.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });

  if (!info) return res.json({ success: false, error: "Failed to spawn bot" });
  res.json({ success: true, viewerPort: info.viewerPort });
});

app.post("/api/bot/disconnect", requireAuth, (req, res) => {
  botManager.killBot(req.session.userId);
  res.json({ success: true });
});

app.get("/api/bot/state", requireAuth, (req, res) => {
  const state = botManager.getBotState(req.session.userId);
  res.json(state || { connected: false });
});

// ---- ADMIN ROUTES ----
app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json(db.getAllUsers());
});

app.get("/api/admin/bots", requireAdmin, (req, res) => {
  res.json(botManager.getAllBots());
});

app.get("/api/admin/servers", requireAdmin, (req, res) => {
  res.json(db.getAllServers());
});

// ---- WEBSOCKET ----
// Map userId -> ws connection
const userWsMap = new Map();

wss.on("connection", (ws, req) => {
  // Extract session from upgrade request
  const sessionParser = session({
    secret: process.env.SESSION_SECRET || "mc-browser-secret-change-this",
    resave: false,
    saveUninitialized: false,
  });

  sessionParser(req, {}, () => {
    const userId = req.session && req.session.userId;
    if (!userId) { ws.close(); return; }

    userWsMap.set(userId, ws);

    // Send current bot state if connected
    const state = botManager.getBotState(userId);
    if (state) ws.send(JSON.stringify({ type: "state", ...state }));

    // Handle control messages from browser
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.type === "control") {
        botManager.sendControl(userId, msg.action);
      }
    });

    ws.on("close", () => {
      userWsMap.delete(userId);
      // Kill bot when browser disconnects
      botManager.killBot(userId);
    });

    ws.on("error", () => {
      userWsMap.delete(userId);
    });
  });
});

// ---- STATE BROADCAST LOOP ----
setInterval(() => {
  for (const [userId, ws] of userWsMap.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const state = botManager.getBotState(userId);
    if (state) {
      ws.send(JSON.stringify({ type: "state", ...state }));
    }
  }
}, 1000);

// ---- CATCH ALL -> serve index.html ----
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MC Browser running on port ${PORT}`);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL]", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[REJECTION]", reason);
});
