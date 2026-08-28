import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.join(__dirname, 'updates.json');
const memberFile = path.join(__dirname, 'member-count.json');
const serverStatsFile = path.join(__dirname, 'server-stats.json');
const currentEventFile = path.join(__dirname, 'current-event.json');
const announcementClearFile = path.join(__dirname, 'announcement-clear.json');
const teamPresenceFile = path.join(__dirname, 'team-presence.json');

app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const readJson = async (file, fallback = []) => {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (!raw.trim()) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = async (file, data) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
};

const normalizeUpdates = (value) => (Array.isArray(value) ? value : []);
const normalizeCurrentEvent = (value) => (value && typeof value === 'object' ? value : null);
const normalizeAnnouncementClear = (value) => (value && typeof value === 'object' ? value : null);
const normalizeServerStats = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const getMemberCount = async () => {
  try {
    const raw = await fs.readFile(memberFile, 'utf8');
    const payload = JSON.parse(raw);
    return Number(payload.memberCount || 0);
  } catch {
    return 0;
  }
};

const getServerStats = async () => {
  const stats = await readJson(serverStatsFile, {});
  return normalizeServerStats(stats);
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'cfc-discord-bot' });
});

app.get('/api/presence', (req, res) => { res.json({ online: 12, idle: 3, dnd: 1, offline: 5 }); });

app.get('/api/site-data', async (req, res) => {
  const updates = normalizeUpdates(await readJson(dataFile, []));
  const memberCount = await getMemberCount();
  const currentEvent = normalizeCurrentEvent(await readJson(currentEventFile, null));
  const serverStats = await getServerStats();
  const announcementClear = normalizeAnnouncementClear(await readJson(announcementClearFile, null));
  const teamPresence = normalizeUpdates(await readJson(teamPresenceFile, []));

  res.json({
    memberCount: Number(serverStats.memberCount || memberCount || 0),
    updates,
    currentEvent,
    serverStats,
    announcementClear,
    teamPresence,
    syncedAt: new Date().toISOString()
  });
});

app.post('/api/server-stats', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }

  const { memberCount, onlineMembers, idleMembers, dndMembers, activeVoiceMembers, recentChatMessages, voiceChannels, chatChannels, updatedAt } = req.body || {};
  const values = [memberCount, onlineMembers, idleMembers, dndMembers, activeVoiceMembers, recentChatMessages, voiceChannels, chatChannels].map(Number);

  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    return res.status(400).json({ ok: false, message: 'Invalid server statistics' });
  }

  const serverStats = {
    memberCount: values[0],
    onlineMembers: values[1],
    idleMembers: values[2],
    dndMembers: values[3],
    activeVoiceMembers: values[4],
    recentChatMessages: values[5],
    voiceChannels: values[6],
    chatChannels: values[7],
    updatedAt: updatedAt || new Date().toISOString()
  };

  await writeJson(serverStatsFile, serverStats);
  res.json({ ok: true, serverStats });
});

app.post('/api/current-event', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }

  const { title, progress, updatedAt } = req.body || {};
  const numericProgress = Number(progress);

  if (!title || !Number.isInteger(numericProgress) || numericProgress < 0 || numericProgress > 100) {
    return res.status(400).json({ ok: false, message: 'Title and progress from 0 to 100 are required' });
  }

  const currentEvent = {
    title,
    progress: numericProgress,
    updatedAt: updatedAt || new Date().toISOString()
  };

  await writeJson(currentEventFile, currentEvent);
  res.json({ ok: true, currentEvent });
});

app.post('/api/member-count', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }

  const { memberCount, updatedAt } = req.body || {};
  const numericMemberCount = Number(memberCount);

  if (!Number.isInteger(numericMemberCount) || numericMemberCount < 0) {
    return res.status(400).json({ ok: false, message: 'Invalid member count' });
  }

  const payload = {
    memberCount: numericMemberCount,
    updatedAt: updatedAt || new Date().toISOString()
  };

  await writeJson(memberFile, payload);
  res.json({ ok: true, payload });
});

app.post('/api/team-presence', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }

  const members = Array.isArray(req.body?.members) ? req.body.members : [];
  const safeMembers = members.map((member) => ({
    userId: String(member.userId || ''),
    name: member.name || 'Unknown',
    status: member.status || 'offline',
    statusLabel: member.statusLabel || 'Offline'
  })).filter((member) => member.userId);

  await writeJson(teamPresenceFile, safeMembers);
  res.json({ ok: true, members: safeMembers, updatedAt: req.body?.updatedAt || new Date().toISOString() });
});

app.post('/api/update', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }

  const { newEvent, title, body, date, time, inviteLink, poster, submittedBy, submittedAt } = req.body || {};

  if (!title || !body || !date || !time || !inviteLink) {
    return res.status(400).json({ ok: false, message: 'Missing required announcement fields' });
  }

  const record = {
    id: randomUUID(),
    newEvent: newEvent || '',
    title,
    body,
    poster: poster || null,
    date,
    time,
    inviteLink,
    submittedBy: submittedBy || 'Discord bot',
    submittedAt: submittedAt || new Date().toISOString()
  };

  const all = normalizeUpdates(await readJson(dataFile, []));
  all.unshift(record);
  await writeJson(dataFile, all);

  res.json({ ok: true, record });
});

app.post('/api/clear-updates', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }

  const clearedBy = req.body?.clearedBy || 'Discord bot';
  await writeJson(dataFile, []);
  await writeJson(path.join(__dirname, 'announcement-clear.json'), {
    clearedBy,
    clearedAt: new Date().toISOString()
  });
  res.json({ ok: true, updates: [], clearedBy });
});

app.post('/api/clear-current-event', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid API key' });
  }

  const clearedBy = req.body?.clearedBy || 'Discord bot';
  await writeJson(currentEventFile, null);
  res.json({ ok: true, currentEvent: null, clearedBy });
});

app.get('/api/updates', async (req, res) => {
  const updates = await readJson(dataFile);
  res.json(updates);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Bot API running on http://localhost:${port}`);
});
