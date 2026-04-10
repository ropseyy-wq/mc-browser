"use strict";

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "db", "data.json");

// Initialize DB file if it doesn't exist
function initDB() {
  if (!fs.existsSync(path.join(__dirname, "db"))) {
    fs.mkdirSync(path.join(__dirname, "db"));
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], servers: [] }, null, 2));
  }
}

function readDB() {
  initDB();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ---- USERS ----

function createUser(username, password) {
  const db = readDB();
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, error: "Username already taken" };
  }
  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: Date.now().toString(),
    username,
    password: hash,
    isAdmin: db.users.length === 0, // first user is admin
    createdAt: Date.now()
  };
  db.users.push(user);
  writeDB(db);
  return { success: true, user };
}

function loginUser(username, password) {
  const db = readDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { success: false, error: "User not found" };
  if (!bcrypt.compareSync(password, user.password)) return { success: false, error: "Wrong password" };
  return { success: true, user };
}

function getUserById(id) {
  const db = readDB();
  return db.users.find(u => u.id === id) || null;
}

function getAllUsers() {
  const db = readDB();
  return db.users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, createdAt: u.createdAt }));
}

// ---- SERVERS ----

function getServers(userId) {
  const db = readDB();
  return db.servers.filter(s => s.userId === userId);
}

function addServer(userId, name, ip, port) {
  const db = readDB();
  const server = {
    id: Date.now().toString(),
    userId,
    name,
    ip,
    port: parseInt(port) || 25565,
    addedAt: Date.now()
  };
  db.servers.push(server);
  writeDB(db);
  return server;
}

function removeServer(userId, serverId) {
  const db = readDB();
  const before = db.servers.length;
  db.servers = db.servers.filter(s => !(s.id === serverId && s.userId === userId));
  writeDB(db);
  return db.servers.length < before;
}

function getServerById(serverId) {
  const db = readDB();
  return db.servers.find(s => s.id === serverId) || null;
}

function getAllServers() {
  const db = readDB();
  return db.servers;
}

module.exports = {
  createUser, loginUser, getUserById, getAllUsers,
  getServers, addServer, removeServer, getServerById, getAllServers
};
