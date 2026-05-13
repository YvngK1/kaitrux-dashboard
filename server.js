const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// MONGOOSE CONNECT
// ──────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ──────────────────────────────────────────────
// SCHEMAS
// ──────────────────────────────────────────────
const Prefix = mongoose.model('Prefix', new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  prefix:  { type: String, required: true },
}));

const Warns = mongoose.model('warnings', new mongoose.Schema({
  guildID:   String,
  userID:    String,
  warnings:  { type: Array, default: [] },
}));

const Logs = mongoose.model('Logs', new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  channels: {
    ban:      { type: String, default: null },
    kick:     { type: String, default: null },
    warn:     { type: String, default: null },
    msgDelete:{ type: String, default: null },
    msgEdit:  { type: String, default: null },
    join:     { type: String, default: null },
    leave:    { type: String, default: null },
    autoMod:  { type: String, default: null },
  },
}));

const KickNotify = mongoose.model('KickNotify', new mongoose.Schema({
  guildId:        { type: String, required: true },
  userId:         { type: String, required: true },
  kickChannel:    { type: String, required: true },
  discordChannel: { type: String, required: true },
  enabled:        { type: Boolean, default: true },
  lastLiveId:     { type: String, default: null },
  lastNotifiedAt: { type: Date,   default: null },
}));

const TwitchNotify = mongoose.model('TwitchNotify', new mongoose.Schema({
  guildId:        { type: String, required: true },
  userId:         { type: String, required: true },
  twitchChannel:  { type: String, required: true },
  discordChannel: { type: String, required: true },
  enabled:        { type: Boolean, default: true },
  customMessage:  { type: String, default: null },
  lastNotifiedAt: { type: Date,   default: null },
  lastLiveId:     { type: String, default: null },
}));

const YouTubeNotify = mongoose.model('YouTubeNotify', new mongoose.Schema({
  guildId:          { type: String, required: true },
  userId:           { type: String, required: true },
  discordChannel:   { type: String, required: true },
  youtubeChannelId: { type: String, required: true },
  lastVideoId:      { type: String, default: null },
  enabled:          { type: Boolean, default: true },
  customMessage:    { type: String, default: null },
}, { timestamps: true }));

const XNotify = mongoose.model('XNotify', new mongoose.Schema({
  guildId:        { type: String, required: true },
  userId:         { type: String, required: true },
  xUsername:      { type: String, required: true },
  discordChannel: { type: String, required: true },
  enabled:        { type: Boolean, default: true },
  lastTweetId:    { type: String, default: null },
  lastNotifiedAt: { type: Date,   default: null },
}));


// ──────────────────────────────────────────────
// AUTH MIDDLEWARE
// ──────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ──────────────────────────────────────────────
// DISCORD OAUTH2
// ──────────────────────────────────────────────
const DISCORD_API = 'https://discord.com/api/v10';
const SCOPES      = 'identify guilds';

app.get('/api/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.CLIENT_ID,
    redirect_uri:  process.env.REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/');

  try {
    // Intercambiar code por token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  process.env.REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');

    // Obtener datos del usuario
    const userRes  = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    // Crear JWT propio
    const jwtToken = jwt.sign(
      { id: user.id, username: user.username, avatar: user.avatar, discordToken: tokenData.access_token },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(`/dashboard.html?token=${jwtToken}`);
  } catch (e) {
    console.error('OAuth error:', e);
    res.redirect('/?error=auth_failed');
  }
});

// ──────────────────────────────────────────────
// API - USER
// ──────────────────────────────────────────────
app.get('/api/me', authMiddleware, (req, res) => {
  const { id, username, avatar } = req.user;
  res.json({ id, username, avatar });
});

// ──────────────────────────────────────────────
// API - GUILDS
// ──────────────────────────────────────────────
app.get('/api/guilds', authMiddleware, async (req, res) => {
  try {
    const discordRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${req.user.discordToken}` },
    });
    const guilds = await discordRes.json();

    // Solo servidores donde el user es admin
    const adminGuilds = guilds.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8));

    // Verificar cuáles tienen el bot
    const botGuildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` },
    });
    const botGuilds    = await botGuildsRes.json();
    const botGuildIds  = new Set(botGuilds.map(g => g.id));

    const result = adminGuilds.map(g => ({
      id:     g.id,
      name:   g.name,
      icon:   g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      hasBot: botGuildIds.has(g.id),
    }));

    res.json(result);
  } catch (e) {
    console.error('Guilds error:', e);
    res.status(500).json({ error: 'Error obteniendo servidores' });
  }
});

// ──────────────────────────────────────────────
// API - CONFIG (prefix)
// ──────────────────────────────────────────────
app.get('/api/guilds/:guildId/config', authMiddleware, async (req, res) => {
  const { guildId } = req.params;
  const prefixDoc   = await Prefix.findOne({ guildId });
  res.json({ prefix: prefixDoc?.prefix || '!' });
});

app.post('/api/guilds/:guildId/config', authMiddleware, async (req, res) => {
  const { guildId } = req.params;
  const { prefix }  = req.body;
  if (!prefix || prefix.length > 5) return res.status(400).json({ error: 'Prefix inválido' });
  await Prefix.findOneAndUpdate({ guildId }, { prefix }, { upsert: true, new: true });
  res.json({ success: true, prefix });
});

// ──────────────────────────────────────────────
// API - DISCORD USER LOOKUP
// ──────────────────────────────────────────────
app.get('/api/user/:userId', authMiddleware, async (req, res) => {
  try {
    const r = await fetch(`${DISCORD_API}/users/${req.params.userId}`, {
      headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` },
    });
    if (!r.ok) return res.json({ id: req.params.userId, username: 'Usuario desconocido', avatar: null });
    const user = await r.json();
    res.json({
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`,
    });
  } catch {
    res.json({ id: req.params.userId, username: 'Usuario desconocido', avatar: null });
  }
});

// ──────────────────────────────────────────────
// API - WARNS
// ──────────────────────────────────────────────
app.get('/api/guilds/:guildId/warns', authMiddleware, async (req, res) => {
  const { guildId } = req.params;
  const warns = await Warns.find({ guildID: guildId });
  res.json(warns);
});

app.delete('/api/guilds/:guildId/warns/:userId', authMiddleware, async (req, res) => {
  const { guildId, userId } = req.params;
  await Warns.findOneAndUpdate({ guildID: guildId, userID: userId }, { warnings: [] });
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// API - LOGS
// ──────────────────────────────────────────────
app.get('/api/guilds/:guildId/logs', authMiddleware, async (req, res) => {
  const { guildId } = req.params;
  const logs = await Logs.findOne({ guildId });
  res.json(logs?.channels || {});
});

app.post('/api/guilds/:guildId/logs', authMiddleware, async (req, res) => {
  const { guildId }  = req.params;
  const { channels } = req.body;
  await Logs.findOneAndUpdate({ guildId }, { channels }, { upsert: true, new: true });
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// API - NOTIFICACIONES
// ──────────────────────────────────────────────

// Twitch
app.get('/api/guilds/:guildId/notify/twitch', authMiddleware, async (req, res) => {
  const list = await TwitchNotify.find({ guildId: req.params.guildId });
  res.json(list);
});
app.post('/api/guilds/:guildId/notify/twitch', authMiddleware, async (req, res) => {
  const doc = new TwitchNotify({ guildId: req.params.guildId, ...req.body });
  await doc.save();
  res.json({ success: true, doc });
});
app.delete('/api/guilds/:guildId/notify/twitch/:id', authMiddleware, async (req, res) => {
  await TwitchNotify.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Kick
app.get('/api/guilds/:guildId/notify/kick', authMiddleware, async (req, res) => {
  const list = await KickNotify.find({ guildId: req.params.guildId });
  res.json(list);
});
app.post('/api/guilds/:guildId/notify/kick', authMiddleware, async (req, res) => {
  const doc = new KickNotify({ guildId: req.params.guildId, ...req.body });
  await doc.save();
  res.json({ success: true, doc });
});
app.delete('/api/guilds/:guildId/notify/kick/:id', authMiddleware, async (req, res) => {
  await KickNotify.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// YouTube
app.get('/api/guilds/:guildId/notify/youtube', authMiddleware, async (req, res) => {
  const list = await YouTubeNotify.find({ guildId: req.params.guildId });
  res.json(list);
});
app.post('/api/guilds/:guildId/notify/youtube', authMiddleware, async (req, res) => {
  const doc = new YouTubeNotify({ guildId: req.params.guildId, ...req.body });
  await doc.save();
  res.json({ success: true, doc });
});
app.delete('/api/guilds/:guildId/notify/youtube/:id', authMiddleware, async (req, res) => {
  await YouTubeNotify.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// X (Twitter)
app.get('/api/guilds/:guildId/notify/x', authMiddleware, async (req, res) => {
  const list = await XNotify.find({ guildId: req.params.guildId });
  res.json(list);
});
app.post('/api/guilds/:guildId/notify/x', authMiddleware, async (req, res) => {
  const doc = new XNotify({ guildId: req.params.guildId, ...req.body });
  await doc.save();
  res.json({ success: true, doc });
});
app.delete('/api/guilds/:guildId/notify/x/:id', authMiddleware, async (req, res) => {
  await XNotify.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// API - PLAYER DE MÚSICA
// ──────────────────────────────────────────────
const BOT_BASE_URL = (process.env.BOT_STATUS_URL || 'http://51.83.6.5:20046/status').replace('/status', '');

async function fetchBotPlayer(guildId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${BOT_BASE_URL}/player/${guildId}`, { signal: controller.signal });
    clearTimeout(timeout);
    return await res.json();
  } catch { return null; }
}

app.get('/api/player/:guildId', authMiddleware, async (req, res) => {
  const data = await fetchBotPlayer(req.params.guildId);
  if (!data) return res.status(503).json({ error: 'Bot no disponible' });
  res.json(data);
});

app.post('/api/player/:guildId/:action', authMiddleware, async (req, res) => {
  const { guildId, action } = req.params;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${BOT_BASE_URL}/player/${guildId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    res.json(await r.json());
  } catch { res.status(503).json({ error: 'Bot no disponible' }); }
});

// API - STATUS COMPLETO
// ──────────────────────────────────────────────
const BOT_STATUS_URL = process.env.BOT_STATUS_URL || 'http://51.83.6.5:20046/status';

async function fetchBotStatus() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(BOT_STATUS_URL, { signal: controller.signal });
    clearTimeout(timeout);
    return await res.json();
  } catch {
    return null;
  }
}

app.get('/api/status', async (req, res) => {
  const botData = await fetchBotStatus();

  const site = { online: true, latency: null };
  const siteStart = Date.now();
  site.latency = Date.now() - siteStart;

  res.json({
    site: {
      online:  true,
      latency: site.latency,
    },
    bot: botData ? {
      online:  botData.bot.online,
      ping:    botData.bot.ping,
      uptime:  botData.bot.uptime,
      guilds:  botData.bot.guilds,
      users:   botData.bot.users,
    } : { online: false, ping: null, uptime: null, guilds: null, users: null },
    lavalink: botData ? botData.lavalink : { nodes: [], totalNodes: 0, connectedNodes: 0 },
    database: botData ? botData.database : { online: false, status: 'unknown' },
    timestamp: Date.now(),
  });
});

// API - STATS (para la landing)
app.get('/api/stats', async (req, res) => {
  const botData = await fetchBotStatus();
  res.json({
    servers:  botData?.bot?.guilds  || 0,
    users:    botData?.bot?.users   || 0,
    commands: 80,
    ping:     botData?.bot?.ping    || 0,
  });
});

// ──────────────────────────────────────────────
// FALLBACK - servir HTML
// ──────────────────────────────────────────────

// Rutas limpias sin .html
const HTML_ROUTES = {
  '/dashboard': 'dashboard.html',
  '/server': 'server.html',
  '/status': 'status.html',
  '/commands': 'commands.html',
};

Object.entries(HTML_ROUTES).forEach(([route, file]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', file));
  });
});

// PLAYER
app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// /player/:guildId → sirve player.html también
app.get('/player/:guildId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Compatibilidad con links viejos
// /dashboard.html?token=... → /dashboard?token=...
app.get('/dashboard.html', (req, res) => {
  const qs = req.url.includes('?')
    ? req.url.slice(req.url.indexOf('?'))
    : '';

  res.redirect(301, `/dashboard${qs}`);
});

// FALLBACK → 404 real
app.use((req, res) => {
  res.status(404).sendFile(
    path.join(__dirname, 'public', '404.html')
  );
});

// ──────────────────────────────────────────────
// START
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Dashboard corriendo en puerto ${PORT}`);
});
