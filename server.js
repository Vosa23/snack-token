const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
// WebSocket support commented out in favor of simple HTTP + JSON file sync (kept for future reuse):
// const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT) || 3002;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Normalize a room/sync code to a safe identifier.
 */
function normalizeRoomId(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return cleaned || 'snack_token_room';
}

function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load rooms.json:', err);
  }
  return {};
}

let rooms = loadRooms();

function persistRooms() {
  const tmpFile = `${ROOMS_FILE}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(rooms, null, 2), 'utf8');
    fs.renameSync(tmpFile, ROOMS_FILE);
  } catch (err) {
    console.error('Failed to persist rooms.json:', err);
  }
}

function sanitizeState(incoming, roomKey) {
  const p1 = incoming && typeof incoming.p1 === 'object' && incoming.p1 ? incoming.p1 : {};
  const p2 = incoming && typeof incoming.p2 === 'object' && incoming.p2 ? incoming.p2 : {};
  const allowedModes = new Set(['calendar', '24h', 'test']);
  const cooldownMode = allowedModes.has(incoming?.cooldownMode) ? incoming.cooldownMode : 'calendar';

  return {
    p1: {
      name: String(p1.name || 'Alex').slice(0, 60),
      avatar: String(p1.avatar || '🍿').slice(0, 16),
    },
    p2: {
      name: String(p2.name || 'Sarah').slice(0, 60),
      avatar: String(p2.avatar || '🍺').slice(0, 16),
    },
    currentTurn: incoming?.currentTurn === 2 ? 2 : 1,
    lastFlippedTime: typeof incoming?.lastFlippedTime === 'number' ? incoming.lastFlippedTime : null,
    cooldownMode,
    syncId: roomKey,
    version: typeof incoming?.version === 'number' ? incoming.version : 1,
    history: Array.isArray(incoming?.history) ? incoming.history.slice(0, 500) : [],
    updatedAt: Date.now(),
  };
}

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: Object.keys(rooms).length });
});

app.get('/api/room/:roomId', (req, res) => {
  const roomKey = normalizeRoomId(req.params.roomId);
  res.json({ room: roomKey, state: rooms[roomKey] || null });
});

/* WebSocket room broadcast helper (commented out for future reuse)
const roomClients = new Map();

function broadcastToRoom(roomKey, payload, excludeWs = null) {
  const clients = roomClients.get(roomKey);
  if (!clients) return;
  const serialized = JSON.stringify(payload);
  for (const client of clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}
*/

app.put('/api/room/:roomId', (req, res) => {
  const roomKey = normalizeRoomId(req.params.roomId);
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid state payload' });
  }
  rooms[roomKey] = sanitizeState(req.body, roomKey);
  persistRooms();
  // broadcastToRoom(roomKey, { type: 'state', room: roomKey, state: rooms[roomKey] });
  res.json({ ok: true, room: roomKey, state: rooms[roomKey] });
});

const server = http.createServer(app);

/* WebSocket server disabled (commented out for future reuse)
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  let roomKey = 'snack_token_room';
  try {
    const reqUrl = new URL(req.url, 'http://localhost');
    roomKey = normalizeRoomId(reqUrl.searchParams.get('room'));
  } catch (_) {}

  ws.isAlive = true;
  ws.roomKey = roomKey;

  if (!roomClients.has(roomKey)) {
    roomClients.set(roomKey, new Set());
  }
  roomClients.get(roomKey).add(ws);

  ws.send(JSON.stringify({ type: 'state', room: roomKey, state: rooms[roomKey] || null }));

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'update' && msg.state && typeof msg.state === 'object') {
        const targetRoom = normalizeRoomId(msg.room || roomKey);
        rooms[targetRoom] = sanitizeState(msg.state, targetRoom);
        persistRooms();
        broadcastToRoom(targetRoom, { type: 'state', room: targetRoom, state: rooms[targetRoom] }, ws);
      } else if (msg.type === 'sync') {
        const targetRoom = normalizeRoomId(msg.room || roomKey);
        ws.send(JSON.stringify({ type: 'state', room: targetRoom, state: rooms[targetRoom] || null }));
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    const clients = roomClients.get(roomKey);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        roomClients.delete(roomKey);
      }
    }
  });
});

const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));
*/

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SnackToken server listening on http://0.0.0.0:${PORT}`);
});
