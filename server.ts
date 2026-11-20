import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';

type IsoVariantKey = 'generic' | 'eeepc' | 'android7' | 'android8' | 'android9';

interface IsoCatalogEntry {
  key: IsoVariantKey;
  label: string;
  filename: string;
  downloadUrl: string;
  expectedBytes: number;
  description: string;
}

interface DownloadProgressState {
  downloading: boolean;
  bytesDownloaded: number;
  totalBytes: number;
  error: string | null;
}

const ISO_CATALOG: Record<IsoVariantKey, IsoCatalogEntry> = {
  generic: {
    key: 'generic',
    label: 'Android 2.2 Froyo (Generic PC / VESA)',
    filename: 'android-x86-2.2-generic.iso',
    downloadUrl:
      'https://sourceforge.net/projects/android-x86/files/Release%202.2/android-x86-2.2-generic.iso/download',
    expectedBytes: 86421504,
    description: 'Official 2010 Android-x86 2.2 Froyo Live CD with generic x86 and VESA graphics support.',
  },
  eeepc: {
    key: 'eeepc',
    label: 'Android 2.2 Froyo (Eee PC Build)',
    filename: 'android-x86-2.2-eeepc.iso',
    downloadUrl:
      'https://sourceforge.net/projects/android-x86/files/Release%202.2/android-x86-2.2-eeepc.iso/download',
    expectedBytes: 76814336,
    description: 'Compact 2010 Android-x86 2.2 Froyo build originally tuned for netbook hardware.',
  },
  android7: {
    key: 'android7',
    label: 'Android 7.1 Nougat (Android-x86 7.1-r5)',
    filename: 'android-x86-7.1-r5.iso',
    downloadUrl:
      'https://sourceforge.net/projects/android-x86/files/Release%207.1/android-x86-7.1-r5.iso/download',
    expectedBytes: 769654784,
    description: 'Genuine 32-bit Android 7.1.2 Nougat Live CD streamed over byte-range requests for v86.',
  },
  android8: {
    key: 'android8',
    label: 'Android 8.1 Oreo (Android-x86 8.1-r6)',
    filename: 'android-x86-8.1-r6.iso',
    downloadUrl:
      'https://sourceforge.net/projects/android-x86/files/Release%208.1/android-x86-8.1-r6.iso/download',
    expectedBytes: 689963008,
    description: 'Genuine 32-bit Android 8.1 Oreo Live CD streamed over byte-range requests for v86.',
  },
  android9: {
    key: 'android9',
    label: 'Android 9 Pie (Android-x86 9.0-r2)',
    filename: 'android-x86-9.0-r2.iso',
    downloadUrl:
      'https://sourceforge.net/projects/android-x86/files/Release%209.0/android-x86-9.0-r2.iso/download',
    expectedBytes: 761266176,
    description: 'Genuine 32-bit Android 9.0 Pie Live CD streamed over byte-range requests for v86 x86 emulation.',
  },
};

const CACHE_DIR = path.join(os.tmpdir(), 'froyoone-isos');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Remove any orphaned partial downloads left from a previous server restart
try {
  for (const entry of fs.readdirSync(CACHE_DIR)) {
    if (entry.endsWith('.tmp')) {
      fs.unlinkSync(path.join(CACHE_DIR, entry));
    }
  }
} catch {
  // ignore cleanup failure
}

const downloadStates: Record<IsoVariantKey, DownloadProgressState> = {
  generic: { downloading: false, bytesDownloaded: 0, totalBytes: ISO_CATALOG.generic.expectedBytes, error: null },
  eeepc: { downloading: false, bytesDownloaded: 0, totalBytes: ISO_CATALOG.eeepc.expectedBytes, error: null },
  android7: { downloading: false, bytesDownloaded: 0, totalBytes: ISO_CATALOG.android7.expectedBytes, error: null },
  android8: { downloading: false, bytesDownloaded: 0, totalBytes: ISO_CATALOG.android8.expectedBytes, error: null },
  android9: { downloading: false, bytesDownloaded: 0, totalBytes: ISO_CATALOG.android9.expectedBytes, error: null },
};

const activeDownloads = new Map<IsoVariantKey, Promise<void>>();

function isValidVariant(value: string): value is IsoVariantKey {
  return (
    value === 'generic' ||
    value === 'eeepc' ||
    value === 'android7' ||
    value === 'android8' ||
    value === 'android9'
  );
}

function getIsoPath(variant: IsoVariantKey): string {
  return path.join(CACHE_DIR, ISO_CATALOG[variant].filename);
}

function getVariantStatus(variant: IsoVariantKey) {
  const entry = ISO_CATALOG[variant];
  const filePath = getIsoPath(variant);
  let stat: fs.Stats | null = null;
  try {
    if (fs.existsSync(filePath)) {
      stat = fs.statSync(filePath);
    }
  } catch {
    stat = null;
  }
  const state = downloadStates[variant];

  return {
    variant,
    label: entry.label,
    filename: entry.filename,
    description: entry.description,
    available: Boolean(stat && stat.size > 10_000_000),
    sizeBytes: stat ? stat.size : entry.expectedBytes,
    downloading: state.downloading,
    bytesDownloaded: stat ? stat.size : state.bytesDownloaded,
    totalBytes: state.totalBytes || entry.expectedBytes,
    error: state.error,
  };
}

async function ensureIsoCached(variant: IsoVariantKey): Promise<void> {
  const filePath = getIsoPath(variant);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 10_000_000) {
    return;
  }

  const existing = activeDownloads.get(variant);
  if (existing) {
    return existing;
  }

  const entry = ISO_CATALOG[variant];
  const tmpPath = `${filePath}.tmp`;
  const state = downloadStates[variant];
  state.downloading = true;
  state.bytesDownloaded = 0;
  state.totalBytes = entry.expectedBytes;
  state.error = null;

  const task = (async () => {
    try {
      const response = await fetch(entry.downloadUrl, {
        headers: {
          'User-Agent': 'Wget/1.21.3',
          Accept: 'application/octet-stream,*/*',
        },
        redirect: 'follow',
      });

      if (!response.ok || !response.body) {
        throw new Error(`Mirror returned HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error('Upstream mirror returned an HTML redirect page instead of the ISO binary.');
      }

      const headerLength = Number(response.headers.get('content-length') || 0);
      if (headerLength > 0) {
        state.totalBytes = headerLength;
      }

      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }

      const writeStream = fs.createWriteStream(tmpPath);
      const nodeStream = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream);

      await new Promise<void>((resolve, reject) => {
        nodeStream.on('data', (chunk: Buffer) => {
          state.bytesDownloaded += chunk.length;
        });
        nodeStream.on('error', (err) => {
          writeStream.destroy();
          reject(err);
        });
        writeStream.on('error', (err) => {
          nodeStream.destroy();
          reject(err);
        });
        writeStream.on('finish', () => resolve());
        nodeStream.pipe(writeStream);
      });

      const finalStat = fs.statSync(tmpPath);
      if (finalStat.size < 10_000_000) {
        throw new Error(`Downloaded image is unexpectedly small (${finalStat.size} bytes).`);
      }

      fs.renameSync(tmpPath, filePath);
      state.bytesDownloaded = finalStat.size;
      state.totalBytes = finalStat.size;
      state.downloading = false;
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // ignore cleanup failure
        }
      }
      state.downloading = false;
      state.error = err instanceof Error ? err.message : 'Failed to fetch Android 2.2 ISO image';
      throw err;
    } finally {
      activeDownloads.delete(variant);
    }
  })();

  activeDownloads.set(variant, task);
  return task;
}

interface MultiuserRoomRecord {
  roomId: string;
  serverName: string;
  hostPeerId: string;
  hostName: string;
  passwordHash: string | null;
  deviceMode: 'phone' | 'tv';
  osLabel: string;
  createdAt: number;
  peers: Map<string, WebSocket>;
}

const multiuserRooms = new Map<string, MultiuserRoomRecord>();
const clientRegistry = new Map<WebSocket, { clientId: string; roomId: string | null }>();

function hashRoomPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyRoomPassword(password: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashRoomPassword(password), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function toPublicRoomSummary(room: MultiuserRoomRecord) {
  return {
    roomId: room.roomId,
    serverName: room.serverName,
    hostName: room.hostName,
    hasPassword: room.passwordHash !== null,
    deviceMode: room.deviceMode,
    osLabel: room.osLabel,
    peerCount: room.peers.size,
    createdAt: room.createdAt,
  };
}

function getPublicRoomsList() {
  return Array.from(multiuserRooms.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toPublicRoomSummary);
}

function sendWsJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomsList() {
  const payload = { type: 'rooms_list', rooms: getPublicRoomsList() };
  for (const ws of clientRegistry.keys()) {
    sendWsJson(ws, payload);
  }
}

function detachClientFromCurrentRoom(ws: WebSocket, reason = 'Host closed the server') {
  const info = clientRegistry.get(ws);
  if (!info || !info.roomId) return;

  const room = multiuserRooms.get(info.roomId);
  info.roomId = null;
  if (!room) return;

  if (room.hostPeerId === info.clientId) {
    for (const [peerId, peerWs] of room.peers.entries()) {
      if (peerId !== info.clientId) {
        const peerInfo = clientRegistry.get(peerWs);
        if (peerInfo) peerInfo.roomId = null;
        sendWsJson(peerWs, { type: 'room_closed', roomId: room.roomId, reason });
      }
    }
    multiuserRooms.delete(room.roomId);
  } else {
    room.peers.delete(info.clientId);
    const hostWs = room.peers.get(room.hostPeerId);
    if (hostWs) {
      sendWsJson(hostWs, { type: 'peer_left', roomId: room.roomId, peerId: info.clientId });
    }
  }

  broadcastRoomsList();
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/webrtc-signaling' });

  wss.on('connection', (ws) => {
    const clientId = crypto.randomUUID().slice(0, 12);
    clientRegistry.set(ws, { clientId, roomId: null });

    sendWsJson(ws, { type: 'welcome', clientId });
    sendWsJson(ws, { type: 'rooms_list', rooms: getPublicRoomsList() });

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 25000);

    ws.on('message', (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(rawData)) as Record<string, unknown>;
      } catch {
        return;
      }

      const clientInfo = clientRegistry.get(ws);
      if (!clientInfo) return;

      switch (msg.type) {
        case 'list_rooms': {
          sendWsJson(ws, { type: 'rooms_list', rooms: getPublicRoomsList() });
          break;
        }

        case 'create_room': {
          const rawName = typeof msg.serverName === 'string' ? msg.serverName.trim() : '';
          if (!rawName) {
            sendWsJson(ws, { type: 'create_error', message: 'Please enter a server name.' });
            return;
          }
          const serverName = rawName.slice(0, 48);
          const rawPassword = typeof msg.password === 'string' ? msg.password : '';
          const hostName =
            typeof msg.hostName === 'string' && msg.hostName.trim()
              ? msg.hostName.trim().slice(0, 28)
              : 'Host';
          const deviceMode: 'phone' | 'tv' = msg.deviceMode === 'tv' ? 'tv' : 'phone';
          const osLabel =
            typeof msg.osLabel === 'string' && msg.osLabel.trim()
              ? msg.osLabel.trim().slice(0, 48)
              : 'Android 2.2';

          detachClientFromCurrentRoom(ws, 'Host started a new server');

          const roomId = crypto.randomUUID().slice(0, 8);
          const room: MultiuserRoomRecord = {
            roomId,
            serverName,
            hostPeerId: clientInfo.clientId,
            hostName,
            passwordHash: rawPassword.length > 0 ? hashRoomPassword(rawPassword) : null,
            deviceMode,
            osLabel,
            createdAt: Date.now(),
            peers: new Map([[clientInfo.clientId, ws]]),
          };
          multiuserRooms.set(roomId, room);
          clientInfo.roomId = roomId;

          sendWsJson(ws, {
            type: 'room_created',
            room: toPublicRoomSummary(room),
            peerId: clientInfo.clientId,
          });
          broadcastRoomsList();
          break;
        }

        case 'update_room_meta': {
          if (!clientInfo.roomId) return;
          const room = multiuserRooms.get(clientInfo.roomId);
          if (!room || room.hostPeerId !== clientInfo.clientId) return;

          if (typeof msg.hostName === 'string' && msg.hostName.trim()) {
            room.hostName = msg.hostName.trim().slice(0, 28);
          }
          if (msg.deviceMode === 'phone' || msg.deviceMode === 'tv') {
            room.deviceMode = msg.deviceMode;
          }
          if (typeof msg.osLabel === 'string' && msg.osLabel.trim()) {
            room.osLabel = msg.osLabel.trim().slice(0, 48);
          }
          broadcastRoomsList();
          break;
        }

        case 'join_room': {
          const roomId = typeof msg.roomId === 'string' ? msg.roomId : '';
          const room = multiuserRooms.get(roomId);
          if (!room) {
            sendWsJson(ws, {
              type: 'join_error',
              roomId,
              code: 'NOT_FOUND',
              message: 'That server is no longer online.',
            });
            return;
          }

          const password = typeof msg.password === 'string' ? msg.password : '';
          if (room.passwordHash) {
            if (!password) {
              sendWsJson(ws, {
                type: 'join_error',
                roomId,
                code: 'PASSWORD_REQUIRED',
                message: 'This server requires a password.',
              });
              return;
            }
            if (!verifyRoomPassword(password, room.passwordHash)) {
              sendWsJson(ws, {
                type: 'join_error',
                roomId,
                code: 'INVALID_PASSWORD',
                message: 'Incorrect server password.',
              });
              return;
            }
          }

          const username =
            typeof msg.username === 'string' && msg.username.trim()
              ? msg.username.trim().slice(0, 28)
              : `Guest-${clientInfo.clientId.slice(0, 4)}`;

          detachClientFromCurrentRoom(ws, 'Host switched rooms');

          room.peers.set(clientInfo.clientId, ws);
          clientInfo.roomId = roomId;

          sendWsJson(ws, {
            type: 'joined_room',
            room: toPublicRoomSummary(room),
            peerId: clientInfo.clientId,
            hostPeerId: room.hostPeerId,
          });

          const hostWs = room.peers.get(room.hostPeerId);
          if (hostWs) {
            sendWsJson(hostWs, {
              type: 'peer_joined',
              roomId,
              peerId: clientInfo.clientId,
              username,
            });
          }

          broadcastRoomsList();
          break;
        }

        case 'signal': {
          const roomId = typeof msg.roomId === 'string' ? msg.roomId : clientInfo.roomId || '';
          const targetPeerId = typeof msg.targetPeerId === 'string' ? msg.targetPeerId : '';
          const room = multiuserRooms.get(roomId);
          if (!room || !room.peers.has(clientInfo.clientId)) return;

          const targetWs = room.peers.get(targetPeerId);
          if (!targetWs) return;

          sendWsJson(targetWs, {
            type: 'signal',
            roomId,
            fromPeerId: clientInfo.clientId,
            payload: msg.payload,
          });
          break;
        }

        case 'leave_room': {
          detachClientFromCurrentRoom(ws, 'Host closed the server');
          break;
        }
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      detachClientFromCurrentRoom(ws, 'Host disconnected');
      clientRegistry.delete(ws);
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/multiuser/rooms', (_req, res) => {
    res.json({ rooms: getPublicRoomsList() });
  });

  app.get('/api/iso/status', (req, res) => {
    const requested = typeof req.query.variant === 'string' ? req.query.variant : '';
    if (requested && isValidVariant(requested)) {
      res.json(getVariantStatus(requested));
      return;
    }

    res.json({
      variants: [
        getVariantStatus('generic'),
        getVariantStatus('eeepc'),
        getVariantStatus('android7'),
        getVariantStatus('android8'),
        getVariantStatus('android9'),
      ],
    });
  });

  app.post('/api/iso/prepare', (req, res) => {
    const rawVariant = typeof req.body?.variant === 'string' ? req.body.variant : 'generic';
    const variant: IsoVariantKey = isValidVariant(rawVariant) ? rawVariant : 'generic';

    const status = getVariantStatus(variant);
    if (status.available) {
      res.json(status);
      return;
    }

    // Trigger background download so the client can poll progress smoothly
    ensureIsoCached(variant).catch(() => {
      // Error state is persisted on downloadStates[variant] for /api/iso/status
    });

    res.status(202).json(getVariantStatus(variant));
  });

  app.get('/api/iso/file/:variant', (req, res) => {
    const rawVariant = req.params.variant.replace(/\.iso$/i, '');
    if (!isValidVariant(rawVariant)) {
      res.status(404).json({ error: 'Unknown ISO variant' });
      return;
    }

    const filePath = getIsoPath(rawVariant);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'ISO image is not cached yet. Prepare it first via POST /api/iso/prepare.' });
      return;
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(500).end();
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`FroyoOne server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start FroyoOne server:', err);
  process.exit(1);
});
