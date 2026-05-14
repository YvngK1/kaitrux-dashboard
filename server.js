const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middlewares básicos
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// CONEXIÓN A BASE DE DATOS
// ──────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch(err => console.error('❌ MongoDB error:', err));

// ──────────────────────────────────────────────
// SCHEMAS (Modelos de Datos)
// ──────────────────────────────────────────────
const Prefix = mongoose.model('Prefix', new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
}));

const Warns = mongoose.model('warnings', new mongoose.Schema({
    guildID: String,
    userID: String,
    warnings: { type: Array, default: [] },
}));

const Logs = mongoose.model('Logs', new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channels: {
        ban: { type: String, default: null },
        kick: { type: String, default: null },
        warn: { type: String, default: null },
        msgDelete: { type: String, default: null },
        msgEdit: { type: String, default: null },
        join: { type: String, default: null },
        leave: { type: String, default: null },
        autoMod: { type: String, default: null },
    },
}));

// Esquemas de Notificaciones (Estructura base similar)
const notifySchema = {
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    discordChannel: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    lastNotifiedAt: { type: Date, default: null },
};

const TwitchNotify = mongoose.model('TwitchNotify', new mongoose.Schema({ ...notifySchema, twitchChannel: String, customMessage: String, lastLiveId: String }));
const KickNotify = mongoose.model('KickNotify', new mongoose.Schema({ ...notifySchema, kickChannel: String, lastLiveId: String }));
const YouTubeNotify = mongoose.model('YouTubeNotify', new mongoose.Schema({ ...notifySchema, youtubeChannelId: String, lastVideoId: String, customMessage: String }, { timestamps: true }));
const XNotify = mongoose.model('XNotify', new mongoose.Schema({ ...notifySchema, xUsername: String, lastTweetId: String }));
const TikTokNotify = mongoose.model('TikTokNotify', new mongoose.Schema({ ...notifySchema, tiktokUsername: String, lastVideoId: String }, { timestamps: true }));

// Esquemas de Premium
const PremiumKeys = mongoose.model('PremiumKeys', new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    type: { type: String, enum: ['user', 'server'], required: true },
    expiresAt: { type: Date, default: null },
    redeemed: { type: Boolean, default: false },
    redeemedAt: { type: Date, default: null },
    guildId: { type: String, default: null },
    userId: { type: String, default: null },
}, { timestamps: true }));

const PremiumServer = mongoose.model('PremiumServer', new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    isPremium: { type: Boolean, default: false },
    premiumExpiresAt: { type: Date, default: null },
}, { timestamps: true }));

const PremiumUser = mongoose.model('PremiumUser', new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    isPremium: { type: Boolean, default: false },
    premiumExpiresAt: { type: Date, default: null },
}, { timestamps: true }));

// ──────────────────────────────────────────────
// MIDDLEWARES DE AUTORIZACIÓN
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

function isPremiumActive(doc) {
    if (!doc || !doc.isPremium) return false;
    if (!doc.premiumExpiresAt) return true; // Permanente
    return new Date(doc.premiumExpiresAt) > new Date();
}

// ──────────────────────────────────────────────
// RUTAS DE AUTENTICACIÓN (Discord OAuth2)
// ──────────────────────────────────────────────
const DISCORD_API = 'https://discord.com/api/v10';

app.get('/api/auth/login', (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: process.env.REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds',
    });
    res.redirect(`${DISCORD_API}/oauth2/authorize?${params}`);
});

app.get('/api/auth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/');
    try {
        const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.REDIRECT_URI,
            }),
        });
        const tokenData = await tokenRes.json();
        const userRes = await fetch(`${DISCORD_API}/users/@me`, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const user = await userRes.json();
        const jwtToken = jwt.sign(
            { id: user.id, username: user.username, avatar: user.avatar, discordToken: tokenData.access_token },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.redirect(`/dashboard?token=${jwtToken}`);
    } catch (e) {
        res.redirect('/?error=auth_failed');
    }
});

// ──────────────────────────────────────────────
// ENDPOINTS DE LA API
// ──────────────────────────────────────────────

// Datos del usuario actual
app.get('/api/me', authMiddleware, (req, res) => res.json(req.user));

// Obtener servidores (Admin + Si tienen el bot)
app.get('/api/guilds', authMiddleware, async (req, res) => {
    try {
        const [uGuildsRes, bGuildsRes] = await Promise.all([
            fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${req.user.discordToken}` } }),
            fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bot ${process.env.BOT_TOKEN}` } })
        ]);
        const guilds = await uGuildsRes.json();
        const botGuilds = await bGuildsRes.json();
        const botGuildIds = new Set(botGuilds.map(g => g.id));

        const result = guilds
            .filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8))
            .map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
                hasBot: botGuildIds.has(g.id)
            }));
        res.json(result);
    } catch (e) { res.status(500).json({ error: 'Error en guilds' }); }
});

// Configuración de Prefix
app.get('/api/guilds/:guildId/config', authMiddleware, async (req, res) => {
    const doc = await Prefix.findOne({ guildId: req.params.guildId });
    res.json({ prefix: doc?.prefix || '!' });
});

app.post('/api/guilds/:guildId/config', authMiddleware, async (req, res) => {
    const { prefix } = req.body;
    if (!prefix || prefix.length > 5) return res.status(400).json({ error: 'Inválido' });
    await Prefix.findOneAndUpdate({ guildId: req.params.guildId }, { prefix }, { upsert: true });
    res.json({ success: true });
});

// Warns y Logs
app.get('/api/guilds/:guildId/warns', authMiddleware, async (req, res) => res.json(await Warns.find({ guildID: req.params.guildId })));
app.get('/api/guilds/:guildId/logs', authMiddleware, async (req, res) => {
    const logs = await Logs.findOne({ guildId: req.params.guildId });
    res.json(logs?.channels || {});
});
app.post('/api/guilds/:guildId/logs', authMiddleware, async (req, res) => {
    await Logs.findOneAndUpdate({ guildId: req.params.guildId }, { channels: req.body.channels }, { upsert: true });
    res.json({ success: true });
});

// Lógica unificada para Notificaciones (DRY - Don't Repeat Yourself)
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

// Player de Música e Info del Bot
const BOT_BASE_URL = (process.env.BOT_STATUS_URL || '').replace('/status', '');
app.get('/api/status', async (req, res) => {
    try {
        const r = await fetch(process.env.BOT_STATUS_URL);
        const d = await r.json();
        res.json({ site: { online: true }, bot: d.bot, lavalink: d.lavalink, database: d.database });
    } catch { res.json({ site: { online: true }, bot: { online: false } }); }
});

// ──────────────────────────────────────────────
// SERVIR FRONTEND (Rutas limpias)
// ──────────────────────────────────────────────
const pages = ['dashboard', 'server', 'status', 'commands', 'player', 'premium'];
pages.forEach(p => app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, 'public', `${p}.html`))));
app.get('/player/:guildId', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 404 Fallback
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server ready on port ${PORT}`));
