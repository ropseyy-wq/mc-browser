const authCard = document.getElementById('authCard');
const appCard = document.getElementById('appCard');
const welcome = document.getElementById('welcome');
const statusEl = document.getElementById('status');
const serverListEl = document.getElementById('serverList');
const viewerEl = document.getElementById('viewer');

const state = {
  me: null,
  servers: [],
  selectedServerId: null,
  ws: null,
};

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function renderServers() {
  serverListEl.innerHTML = '';
  state.servers.forEach((s) => {
    const li = document.createElement('li');
    const left = document.createElement('label');
    left.innerHTML = `<input type="radio" name="server" value="${s.id}" ${state.selectedServerId === s.id ? 'checked' : ''}> ${s.name} (${s.ip}:${s.port})`;
    left.querySelector('input').addEventListener('change', () => {
      state.selectedServerId = s.id;
    });

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'secondary';
    del.onclick = async () => {
      await api(`/api/servers/${s.id}`, 'DELETE');
      await loadServers();
    };

    li.append(left, del);
    serverListEl.appendChild(li);
  });
}

async function loadServers() {
  state.servers = await api('/api/servers');
  if (!state.selectedServerId && state.servers[0]) state.selectedServerId = state.servers[0].id;
  renderServers();
}

function connectWs() {
  if (state.ws) state.ws.close();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  state.ws = ws;

  ws.onopen = () => setStatus('WebSocket connected.');
  ws.onclose = () => setStatus('WebSocket disconnected.');
  ws.onerror = () => setStatus('WebSocket error.');
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'viewer_ready' || msg.viewerPort) {
      const host = location.hostname;
      viewerEl.src = `${location.protocol}//${host}:${msg.port || msg.viewerPort}`;
      viewerEl.classList.remove('hidden');
    }
    if (msg.type === 'error') setStatus(`Error: ${msg.message}`);
    if (msg.type === 'kicked') setStatus(`Kicked: ${msg.reason}`);
    if (msg.type === 'connected') setStatus(`Connected as ${msg.username} to ${msg.server}`);
    if (msg.type === 'disconnected') setStatus('Bot disconnected.');
  };
}

async function refreshMe() {
  const me = await api('/api/me');
  state.me = me;
  if (!me.loggedIn) {
    authCard.classList.remove('hidden');
    appCard.classList.add('hidden');
    return;
  }
  authCard.classList.add('hidden');
  appCard.classList.remove('hidden');
  welcome.textContent = `Hello ${me.username}`;
  await loadServers();
  connectWs();
}

document.getElementById('loginBtn').onclick = async () => {
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const r = await api('/api/login', 'POST', { username, password });
  if (!r.success) return setStatus(r.error || 'Login failed');
  setStatus('Logged in.');
  await refreshMe();
};

document.getElementById('registerBtn').onclick = async () => {
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const r = await api('/api/register', 'POST', { username, password });
  if (!r.success) return setStatus(r.error || 'Register failed');
  setStatus('Registered + logged in.');
  await refreshMe();
};

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/logout', 'POST');
  viewerEl.classList.add('hidden');
  viewerEl.src = '';
  setStatus('Logged out.');
  await refreshMe();
};

document.getElementById('addServerBtn').onclick = async () => {
  const name = document.getElementById('serverName').value.trim();
  const ip = document.getElementById('serverIp').value.trim();
  const port = Number(document.getElementById('serverPort').value || 25565);
  const r = await api('/api/servers', 'POST', { name, ip, port });
  if (!r.success) return setStatus(r.error || 'Add server failed');
  setStatus('Server added.');
  await loadServers();
};

document.getElementById('joinBtn').onclick = async () => {
  if (!state.selectedServerId) return setStatus('Select a server first.');
  const mcUsername = document.getElementById('mcUsername').value.trim();
  const r = await api('/api/bot/join', 'POST', { serverId: state.selectedServerId, mcUsername });
  if (!r.success) return setStatus(r.error || 'Join failed');
  setStatus('Bot join requested...');
};

document.getElementById('disconnectBtn').onclick = async () => {
  await api('/api/bot/disconnect', 'POST');
  setStatus('Disconnect requested.');
};

refreshMe();
