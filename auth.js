// Configuración de OAuth2 Discord
// NO expongas client_secret en el frontend; utiliza el flujo implícito.
const CLIENT_ID = "1352110749169750038"; // Reemplaza con tu Client ID

// Asegura que mantenemos el prefijo de carpeta incluso si el usuario accede sin la barra final
// (por ejemplo, https://k1ontop.github.io/kaitruxweb en vez de https://k1ontop.github.io/kaitruxweb/).
const BASE_PATH = (() => {
    const { pathname } = window.location;

    // Si ya termina en '/', no tocar
    if (pathname.endsWith('/')) {
        return pathname;
    }

    // Si la última parte parece un archivo, quitamos solo ese segmento
    if (pathname.split('/').pop().includes('.')) {
        const dir = pathname.replace(/\/[^/]*$/, '');
        return dir.endsWith('/') ? dir : `${dir}/`;
    }

    // Si es una ruta de carpeta sin la barra final, la añadimos
    return `${pathname}/`;
})();

const REDIRECT_URI = `${window.location.origin}${BASE_PATH}servers.html`; // URL de callback
const DISCORD_API = "https://discord.com/api";
const OAUTH_SCOPE = "identify guilds";

// Funciones para manejar la autenticación
function login() {
    const authUrl = `${DISCORD_API}/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(OAUTH_SCOPE)}` +
        `&prompt=consent`;
    window.location.href = authUrl;
}

// Función para manejar el callback después de autenticación
function handleCallback() {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');

    if (!accessToken) {
        return false;
    }

    const expiresIn = Number(hashParams.get('expires_in')) || 0;

    localStorage.setItem('discord_token', accessToken);
    localStorage.setItem('discord_token_expiry', Date.now() + (expiresIn * 1000));

    // Limpiar el fragmento de la URL para evitar que se procese de nuevo
    window.history.replaceState(null, '', window.location.pathname);

    fetchUserInfo();
    fetchUserGuilds();
    return true;
}

// Obtener información del usuario de Discord
async function fetchUserInfo() {
    const token = localStorage.getItem('discord_token');
    if (!token) return;

    try {
        const response = await fetch(`${DISCORD_API}/users/@me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const userData = await response.json();
        localStorage.setItem('discord_user', JSON.stringify(userData));
        updateUIWithUserInfo(userData);
    } catch (error) {
        console.error('Error al obtener información del usuario:', error);
    }
}

// Obtener servidores del usuario
async function fetchUserGuilds() {
    const token = localStorage.getItem('discord_token');
    if (!token) return;

    try {
        const guildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const guildsData = await guildsResponse.json();
        localStorage.setItem('discord_guilds', JSON.stringify(guildsData));

        // Obtener servidores donde está el bot (esto requeriría una API backend)
        const botGuilds = await fetchBotGuilds();

        // Dividir servidores en dos grupos
        categorizeAndDisplayGuilds(guildsData, botGuilds);
    } catch (error) {
        console.error('Error al obtener servidores:', error);
    }
}

// Esta función simula obtener los servidores donde está el bot
// En una implementación real, necesitarías un backend para esto
async function fetchBotGuilds() {
    // Simulación - en la realidad, esto vendría de tu backend
    return new Promise((resolve) => {
        // IDs de ejemplo donde está tu bot
        setTimeout(() => resolve(['servidor1', 'servidor2', 'servidor3']), 200);
    });
}

// Categorizar y mostrar los servidores
function categorizeAndDisplayGuilds(userGuilds, botGuilds) {
    const guildsWithBot = [];
    const guildsWithoutBot = [];

    userGuilds.forEach(guild => {
        // Verificar si el usuario tiene permiso para administrar el servidor
        const canManageGuild = (guild.permissions & 0x20) === 0x20; // Permiso MANAGE_GUILD

        if (botGuilds.includes(guild.id)) {
            guildsWithBot.push(guild);
        } else if (canManageGuild) {
            guildsWithoutBot.push(guild);
        }
    });

    displayGuildsInContainer(guildsWithBot, 'guilds-with-bot');
    displayGuildsInContainer(guildsWithoutBot, 'guilds-without-bot');
}

// Mostrar servidores en su contenedor correspondiente
function displayGuildsInContainer(guilds, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (guilds.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">No hay servidores disponibles</p>';
        return;
    }

    guilds.forEach(guild => {
        const guildElement = document.createElement('div');
        guildElement.className = 'guild-item bg-blue-700 rounded-lg p-4 hover:bg-blue-600 cursor-pointer';

        // Determinar icono del servidor
        let iconUrl = 'default-server-icon.png'; // Imagen predeterminada
        if (guild.icon) {
            iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
        }

        guildElement.innerHTML = `
            <div class="flex items-center">
                <img src="${iconUrl}" alt="${guild.name}" class="w-12 h-12 rounded-full mr-4">
                <div>
                    <h3 class="font-bold">${guild.name}</h3>
                    <p class="text-sm text-blue-300">${guild.id}</p>
                </div>
            </div>
        `;

        guildElement.addEventListener('click', () => {
            window.location.href = `/servers/${guild.id}/dashboard`;
        });

        container.appendChild(guildElement);
    });
}

// Actualizar UI con información del usuario
function updateUIWithUserInfo(user) {
    const userInfoElement = document.getElementById('user-info');
    if (!userInfoElement) return;

    let avatarUrl = 'default-avatar.png'; // Imagen predeterminada
    if (user.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    }

    userInfoElement.innerHTML = `
        <div class="flex items-center">
            <img src="${avatarUrl}" alt="${user.username}" class="w-10 h-10 rounded-full mr-2">
            <div>
                <p class="font-bold">${user.username}</p>
                <p class="text-xs text-blue-300">#${user.discriminator}</p>
            </div>
            <button id="logout-btn" class="ml-4 px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm">
                Cerrar sesión
            </button>
        </div>
    `;

    // Añadir evento para cerrar sesión
    document.getElementById('logout-btn')?.addEventListener('click', logout);
}

// Verificar estado de autenticación
function checkAuth() {
    const token = localStorage.getItem('discord_token');
    const expiry = localStorage.getItem('discord_token_expiry');

    if (!token || !expiry || Date.now() > parseInt(expiry)) {
        // Token expirado o no existe
        document.querySelectorAll('.auth-required').forEach(el => {
            el.style.display = 'none';
        });
        document.querySelectorAll('.auth-not-required').forEach(el => {
            el.style.display = 'block';
        });
        return false;
    }

    // Usuario autenticado
    document.querySelectorAll('.auth-required').forEach(el => {
        el.style.display = 'block';
    });
    document.querySelectorAll('.auth-not-required').forEach(el => {
        el.style.display = 'none';
    });

    // Cargar información del usuario almacenada
    const userData = JSON.parse(localStorage.getItem('discord_user') || '{}');
    if (userData.id) {
        updateUIWithUserInfo(userData);
    } else {
        fetchUserInfo();
    }

    return true;
}

// Cerrar sesión
function logout() {
    localStorage.removeItem('discord_token');
    localStorage.removeItem('discord_token_expiry');
    localStorage.removeItem('discord_user');
    localStorage.removeItem('discord_guilds');

    window.location.href = `${window.location.origin}${BASE_PATH}index.html`;
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    const handledCallback = handleCallback();

    // Comprobar estado de autenticación
    const isAuthenticated = handledCallback || checkAuth();

    // Añadir evento al botón de login
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    }

    // Si estamos en la página de servidores y el usuario está autenticado
    const isServersPage = window.location.pathname.endsWith('/servers.html') || window.location.pathname === '/servers.html';
    if (isServersPage && isAuthenticated) {
        const guildsData = JSON.parse(localStorage.getItem('discord_guilds') || '[]');
        const botGuilds = JSON.parse(localStorage.getItem('bot_guilds') || '[]');

        if (guildsData.length > 0) {
            categorizeAndDisplayGuilds(guildsData, botGuilds);
        } else {
            fetchUserGuilds();
        }
    }
});
