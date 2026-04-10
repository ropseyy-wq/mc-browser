"use strict";

const mineflayer = require("mineflayer");
const { mineflayer: mineflayerViewer } = require("prismarine-viewer");

// Map of userId -> bot instance info
const activeBots = new Map();
// Map of userId -> viewer port
let nextPort = 3100;

function getNextPort() {
  return nextPort++;
}

function getBotInfo(userId) {
  return activeBots.get(userId) || null;
}

function getAllBots() {
  const result = [];
  for (const [userId, info] of activeBots.entries()) {
    result.push({
      userId,
      username: info.username,
      serverIp: info.serverIp,
      serverPort: info.serverPort,
      viewerPort: info.viewerPort,
      connected: info.connected,
      startedAt: info.startedAt,
    });
  }
  return result;
}

function spawnBot(userId, mcUsername, serverIp, serverPort, onEvent) {
  // Kill existing bot for this user if any
  killBot(userId);

  const viewerPort = getNextPort();

  const info = {
    userId,
    username: mcUsername,
    serverIp,
    serverPort,
    viewerPort,
    connected: false,
    startedAt: Date.now(),
    bot: null,
  };

  activeBots.set(userId, info);

  let bot;
  try {
    bot = mineflayer.createBot({
      username: mcUsername,
      host: serverIp,
      port: parseInt(serverPort) || 25565,
      version: false, // auto-detect
      auth: "offline",
      hideErrors: false,
      keepAlive: false,
      checkTimeoutInterval: 120000,
    });

    // manual keepalive
    bot._client.on("keep_alive", (packet) => {
      try { bot._client.write("keep_alive", { keepAliveId: packet.keepAliveId }); } catch (_) {}
    });

    info.bot = bot;

    bot.once("spawn", () => {
      info.connected = true;
      onEvent({ type: "connected", username: mcUsername, server: `${serverIp}:${serverPort}` });

      // Start prismarine viewer on unique port
      try {
        mineflayerViewer(bot, { port: viewerPort, firstPerson: true });
        onEvent({ type: "viewer_ready", port: viewerPort });
      } catch (e) {
        onEvent({ type: "error", message: "Viewer failed: " + e.message });
      }

      // Forward chat
      bot.on("chat", (username, message) => {
        onEvent({ type: "chat", username, message });
      });

      bot.on("messagestr", (message) => {
        onEvent({ type: "server_message", message });
      });

      // Health updates
      bot.on("health", () => {
        onEvent({
          type: "health",
          health: bot.health,
          food: bot.food,
        });
      });

      // Player list updates
      bot.on("playerJoined", (player) => {
        onEvent({ type: "player_join", username: player.username });
        onEvent({ type: "player_list", players: getPlayerList(bot) });
      });

      bot.on("playerLeft", (player) => {
        onEvent({ type: "player_leave", username: player.username });
        onEvent({ type: "player_list", players: getPlayerList(bot) });
      });

      // Send initial player list
      setTimeout(() => {
        onEvent({ type: "player_list", players: getPlayerList(bot) });
      }, 2000);
    });

    bot.on("kicked", (reason) => {
      info.connected = false;
      const msg = typeof reason === "object" ? JSON.stringify(reason) : reason;
      onEvent({ type: "kicked", reason: msg });
    });

    bot.on("end", () => {
      info.connected = false;
      onEvent({ type: "disconnected" });
    });

    bot.on("error", (err) => {
      onEvent({ type: "error", message: err.message });
    });

  } catch (err) {
    activeBots.delete(userId);
    onEvent({ type: "error", message: "Failed to create bot: " + err.message });
    return null;
  }

  return info;
}

function killBot(userId) {
  const info = activeBots.get(userId);
  if (!info) return;
  try {
    if (info.bot) {
      info.bot.removeAllListeners();
      info.bot.end();
    }
  } catch (_) {}
  activeBots.delete(userId);
}

function sendControl(userId, action) {
  const info = activeBots.get(userId);
  if (!info || !info.bot || !info.connected) return false;
  const bot = info.bot;

  try {
    switch (action.type) {
      case "move": {
        const allowed = ["forward", "back", "left", "right", "jump", "sneak", "sprint"];
        if (allowed.includes(action.key)) {
          bot.setControlState(action.key, action.state);
        }
        break;
      }
      case "look":
        bot.look(action.yaw, action.pitch, false);
        break;
      case "chat":
        if (action.message && action.message.trim()) {
          bot.chat(action.message.trim());
        }
        break;
      case "attack": {
        const target = bot.nearestEntity(e =>
          e.type === "mob" || (e.type === "player" && e.username !== bot.username)
        );
        if (target) bot.attack(target);
        break;
      }
      case "use":
        if (action.state) bot.activateItem();
        else bot.deactivateItem();
        break;
      case "stopall":
        ["forward","back","left","right","jump","sneak","sprint"].forEach(k => {
          bot.setControlState(k, false);
        });
        break;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function getPlayerList(bot) {
  try {
    return Object.values(bot.players || {})
      .map(p => p.username)
      .filter(u => u);
  } catch (_) { return []; }
}

function getBotState(userId) {
  const info = activeBots.get(userId);
  if (!info || !info.bot) return null;
  const bot = info.bot;
  try {
    const pos = bot.entity ? bot.entity.position : null;
    return {
      connected: info.connected,
      username: info.username,
      server: `${info.serverIp}:${info.serverPort}`,
      viewerPort: info.viewerPort,
      pos: pos ? { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) } : null,
      health: bot.health || 0,
      food: bot.food || 0,
      players: getPlayerList(bot),
    };
  } catch (_) { return null; }
}

module.exports = { spawnBot, killBot, getBotInfo, getBotState, sendControl, getAllBots };
