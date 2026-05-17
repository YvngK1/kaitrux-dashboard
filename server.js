const express   = require('express');
const mongoose  = require('mongoose');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const path      = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch(err => console.error('❌ MongoDB error:', err));

// ── SUB-ESQUEMAS ─────────────────────────────────────────────────────────────
const SingleWarnSchema = new mongoose.Schema({
    reason:    { type: String, required: true },
    moderator: { type: String, required: true },
    createdAt: { type: Date,   default: Date.now }
});

// ── MODELOS ──────────────────────────────────────────────────────────────────
const Prefix = mongoose.model('Prefix', new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prefix:  { type: String, required: true },
}));

const Warns = mongoose.model('warnings', new mongoose.Schema({
    guildID:  { type: String, required: true },
    userID:   { type: String, required: true },
    warnings: [SingleWarnSchema], // Arreglo tipado: Mongoose ahora trackea cambios nativamente
}));

const Logs = mongoose.model('Logs', new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channels: {
        ban:       { type: String, default: null },
        kick:      { type: String, default: null },
        warn:      { type: String, default: null },
        msgDelete: { type: String, default: null },
        msgEdit:   { type: String, default: null },
        join:      { type: String, default: null },
        leave:     { type: String, default: null },
        autoMod:   { type: String, default: null },
    },
}));

const notifyBase = {
    guildId:        { type: String, required: true },
    userId:         { type: String, required: true },
    discordChannel: { type: String, required: true },
    enabled:        { type: Boolean, default: true },
    lastNotifiedAt: { type: Date,   default: null },
};

const TwitchNotify  = mongoose.model('TwitchNotify',  new mongoose.Schema({ ...notifyBase, twitchChannel: String, customMessage: String, lastLiveId: String }));
const KickNotify    = mongoose.model('KickNotify',    new mongoose.Schema({ ...notifyBase, kickChannel: String, lastLiveId: String }));
const YouTubeNotify = mongoose.model('YouTubeNotify', new mongoose.Schema({ ...notifyBase, youtubeChannelId: String, lastVideoId: String, customMessage: String }, { timestamps: true }));
const XNotify       = mongoose.model('XNotify',       new mongoose.Schema({ ...notifyBase, xUsername: String, lastTweetId: String }));
const TikTokNotify  = mongoose.model('TikTokNotify',  new mongoose.Schema({ ...notifyBase, tiktokUsername: String, lastVideoId: String }, { timestamps: true }));

const PremiumKeys = mongoose.model('PremiumKeys', new mongoose.Schema({
    key:        { type: String,  required: true, unique: true },
    type:       { type: String,  enum: ['user','server'], required: true },
    expiresAt:  { type: Date,    default: null },
    redeemed:   { type: Boolean, default: false },
    redeemedAt: { type: Date,    default: null },
    guildId:    { type: String,  default: null },
    userId:     { type: String,  default: null },
}, { timestamps: true }));

const PremiumServer = mongoose.model('PremiumServer', new mongoose.Schema({
    guildId:          { type: String,  required: true, unique: true },
    isPremium:        { type: Boolean, default: false },
    premiumExpiresAt: { type: Date,    default: null },
}, { timestamps: true }));

const PremiumUser = mongoose.model('PremiumUser', new mongoose.Schema({
    userId:           { type: String,  required: true, unique: true },
    isPremium:        { type: Boolean, default: false },
    premiumExpiresAt: { type: Date,    default: null },
}, { timestamps: true }));

// ── HELPERS / MIDDLEWARES ─────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'No token proporcionado' });
    
    const token = header.replace('Bearer ', '');
    try { 
        req.user = jwt.verify(token, process.env.JWT_SECRET); 
        next(); 
    } catch { 
        res.status(401).json({ error: 'Token inválido o expirado' }); 
    }
}

function isPremiumActive(doc) {
    if (!doc || !doc.isPremium) return false;
    if (!doc.premiumExpiresAt) return true; // Permanente
    return new Date(doc.premiumExpiresAt) > new Date();
}

// ── OAUTH ─────────────────────────────────────────────────────────────────────
const DISCORD_API = 'https://discord.com/api/v10';

app.get('/api/auth/login', (req, res) => {
    const redirect = req.query.redirect || '/dashboard';
    const state    = Buffer.from(redirect).toString('base64');
    const params   = new URLSearchParams({
        client_id:     process.env.CLIENT_ID,
        redirect_uri:  process.env.REDIRECT_URI,
        response_type: 'code',
        scope:         'identify guilds',
        state,
    });
    res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

app.get('/api/auth/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.redirect('/');
    
    let redirectTo = '/dashboard';
    try {
        const decoded = Buffer.from(state || '', 'base64').toString('utf8');
        if (decoded.startsWith('/')) redirectTo = decoded;
    } catch {}

    try {
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
        if (tokenData.error) throw new Error(tokenData.error_description);

        const userRes = await fetch(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const user = await userRes.json();
        
        // Payload seguro (puedes encriptar el tokenData.access_token si necesitas máxima seguridad)
        const jwtToken = jwt.sign(
            { id: user.id, username: user.username, avatar: user.avatar, discordToken: tokenData.access_token },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.redirect(`${redirectTo}?token=${jwtToken}`);
    } catch (e) {
        console.error('❌ OAuth error:', e);
        res.redirect('/?error=auth_failed');
    }
});

// ── API — USUARIO Y GUILDS ─────────────────────────────────────────────────────
app.get('/api/me', authMiddleware, (req, res) => res.json(req.user));

app.get('/api/user/:userId', authMiddleware, async (req, res) => {
    try {
        const r = await fetch(`${DISCORD_API}/users/${req.params.userId}`, { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } });
        const user = await r.json();
        res.json({
            id: user.id, username: user.username,
            globalName: user.global_name || user.username,
            avatar: user.avatar
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`,
        });
    } catch { res.json({ id: req.params.userId, username: 'Desconocido', avatar: null }); }
});

app.get('/api/guilds', authMiddleware, async (req, res) => {
    try {
        const uRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
            headers: { Authorization: `Bearer ${req.user.discordToken}` }
        });
        const guilds = await uRes.json();

        const userGuilds = guilds.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8));

        const guildsWithBot = await Promise.all(userGuilds.map(async g => {
            const r = await fetch(`${DISCORD_API}/guilds/${g.id}`, {
                headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` }
            });
            return {
                id: g.id,
                name: g.name,
                icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
                hasBot: r.ok
            };
        }));

        res.json(guildsWithBot);
    } catch (e) {
        res.status(500).json({ error: 'Error al procesar servidores asociados.' });
    }
});
// ── API — PREFIX ──────────────────────────────────────────────────────────────
app.get('/api/guilds/:guildId/config', authMiddleware, async (req, res) => {
    const doc = await Prefix.findOne({ guildId: req.params.guildId });
    res.json({ prefix: doc?.prefix || '!' });
});

app.post('/api/guilds/:guildId/config', authMiddleware, async (req, res) => {
    const { prefix } = req.body;
    if (!prefix || prefix.length > 5) return res.status(400).json({ error: 'El prefijo debe tener entre 1 y 5 caracteres.' });
    await Prefix.findOneAndUpdate({ guildId: req.params.guildId }, { prefix }, { upsert: true });
    res.json({ success: true, prefix });
});

// ── API — WARNS (OPTIMIZADO) ──────────────────────────────────────────────────
app.get('/api/guilds/:guildId/warns', authMiddleware, async (req, res) => {
    res.json(await Warns.find({ guildID: req.params.guildId }));
});

app.delete('/api/guilds/:guildId/warns/:userId', authMiddleware, async (req, res) => {
    await Warns.deleteOne({ guildID: req.params.guildId, userID: req.params.userId });
    res.json({ success: true });
});

app.delete('/api/guilds/:guildId/warns/:userId/:index', authMiddleware, async (req, res) => {
    const { guildId, userId, index } = req.params;
    const doc = await Warns.findOne({ guildID: guildId, userID: userId });
    if (!doc) return res.status(404).json({ error: 'No se encontraron registros de advertencias.' });
    
    const idx = parseInt(index);
    if (isNaN(idx) || idx < 0 || idx >= doc.warnings.length) return res.status(400).json({ error: 'Índice fuera de rango.' });
    
    doc.warnings.splice(idx, 1); // Al estar tipado como sub-esquema, detecta el cambio automáticamente
    await doc.save();
    res.json({ success: true });
});

// ── API — LOGS Y NOTIFICACIONES ───────────────────────────────────────────────
app.get('/api/guilds/:guildId/logs', authMiddleware, async (req, res) => {
    const doc = await Logs.findOne({ guildId: req.params.guildId });
    res.json(doc?.channels || {});
});

app.post('/api/guilds/:guildId/logs', authMiddleware, async (req, res) => {
    await Logs.findOneAndUpdate({ guildId: req.params.guildId }, { channels: req.body.channels }, { upsert: true });
    res.json({ success: true });
});

const notifyModels = { twitch: TwitchNotify, kick: KickNotify, youtube: YouTubeNotify, x: XNotify, tiktok: TikTokNotify };
Object.entries(notifyModels).forEach(([name, Model]) => {
    app.get(`/api/guilds/:guildId/notify/${name}`, authMiddleware, async (req, res) => res.json(await Model.find({ guildId: req.params.guildId })));
    app.post(`/api/guilds/:guildId/notify/${name}`, authMiddleware, async (req, res) => {
        const doc = await new Model({ guildId: req.params.guildId, ...req.body }).save();
        res.json({ success: true, doc });
    });
    app.delete(`/api/guilds/:guildId/notify/${name}/:id`, authMiddleware, async (req, res) => {
        await Model.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    });
});

// ── API — PREMIUM ─────────────────────────────────────────────────────────────
app.get('/api/premium/status', authMiddleware, async (req, res) => {
    const [serverDoc, userDoc] = await Promise.all([
        req.query.guildId ? PremiumServer.findOne({ guildId: req.query.guildId }) : null,
        PremiumUser.findOne({ userId: req.user.id }),
    ]);
    res.json({
        server: { isPremium: isPremiumActive(serverDoc), expiresAt: serverDoc?.premiumExpiresAt || null },
        user:   { isPremium: isPremiumActive(userDoc),   expiresAt: userDoc?.premiumExpiresAt   || null },
    });
});

app.post('/api/premium/redeem', authMiddleware, async (req, res) => {
    const { key, type, guildId } = req.body;
    if (!key || !['user','server'].includes(type)) return res.status(400).json({ error: 'Parámetros inválidos.' });
    if (type === 'server' && !guildId) return res.status(400).json({ error: 'Falta especificar el ID del servidor.' });
    
    const found = await PremiumKeys.findOne({ key, type, redeemed: false });
    if (!found) return res.status(404).json({ error: 'Clave inválida, expirada o ya reclamada.' });
    if (found.expiresAt && new Date(found.expiresAt) < new Date()) return res.status(400).json({ error: 'Esta clave premium ha caducado.' });
    
    found.redeemed = true; 
    found.redeemedAt = new Date();
    if (type === 'server') found.guildId = guildId;
    if (type === 'user')   found.userId   = req.user.id;
    await found.save();
    
    const update = { isPremium: true, premiumExpiresAt: found.expiresAt || null };
    if (type === 'server') await PremiumServer.findOneAndUpdate({ guildId }, update, { upsert: true });
    else                   await PremiumUser.findOneAndUpdate({ userId: req.user.id }, update, { upsert: true });
    
    res.json({ success: true, type, expiresAt: found.expiresAt || null, permanent: !found.expiresAt });
});

// ── API — PLAYER COMUNICATION ──────────────────────────────────────────────────
const BOT_BASE = (process.env.BOT_STATUS_URL || 'http://51.83.6.5:20046/status').replace('/status', '');

async function botFetch(path, opts = {}) {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 4000);
    try {
        const res = await fetch(`${BOT_BASE}${path}`, { ...opts, signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return null;
        return await res.json();
    } catch { 
        clearTimeout(t); 
        return null; 
    }
}

app.get('/api/player/:guildId', authMiddleware, async (req, res) => {
    const data = await botFetch(`/player/${req.params.guildId}`);
    if (!data) return res.status(503).json({ error: 'El servicio del bot de música no se encuentra disponible.' });
    res.json(data);
});

app.post('/api/player/:guildId/:action', authMiddleware, async (req, res) => {
    const data = await botFetch(`/player/${req.params.guildId}/${req.params.action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body),
    });
    if (!data) return res.status(503).json({ error: 'No se pudo enviar la acción. El bot de música no responde.' });
    res.json(data);
});

// ── API — STATUS Y MONITOREO ──────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
    const d = await botFetch('/status');
    res.json({
        site:      { online: true, latency: 0 },
        bot:       d ? d.bot      : { online: false, ping: null, uptime: null, guilds: null, users: null },
        lavalink:  d ? d.lavalink : { nodes: [], totalNodes: 0, connectedNodes: 0 },
        database:  d ? d.database : { online: false, status: 'Desconectado' },
        timestamp: Date.now(),
    });
});

app.get('/api/stats', async (req, res) => {
    const d = await botFetch('/status');
    res.json({ servers: d?.bot?.guilds || 0, users: d?.bot?.users || 0, commands: 80, ping: d?.bot?.ping || 0 });
});

// ── ROUTING ESTÁTICO DE VISTAS ────────────────────────────────────────────────
const PAGES = ['dashboard', 'server', 'status', 'commands', 'player', 'premium'];
PAGES.forEach(p => {
    app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, 'public', `${p}.html`)));
});
app.get('/player/:guildId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API Server escuchando en el puerto ${PORT}`));
