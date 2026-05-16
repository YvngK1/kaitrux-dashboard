// public/js/translate.js

const translations = {
    es: {
        // Navbar común
        "nav-home": "Inicio",
        "nav-dashboard": "Panel",
        "nav-status": "Estado",
        "nav-commands": "Comandos",
        "nav-premium": "Premium",
        "nav-player": "Reproductor",

        // index.html (Landing)
        "idx-title": "El Bot Definitivo para tu Servidor",
        "idx-desc": "Música en alta calidad, moderación estricta, logs avanzados y notificaciones en tiempo real.",
        "idx-btn-login": "Iniciar Sesión con Discord",

        // dashboard.html (Selección de servidor)
        "dash-title": "Tus Servidores",
        "dash-subtitle": "Selecciona un servidor para configurar el bot.",
        "dash-admin-required": "Debes ser Administrador para ver los servidores.",
        "dash-btn-manage": "Configurar",
        "dash-btn-invite": "Invitar Bot",

        // server.html (Configuración del servidor específico)
        "srv-title": "Configuración General",
        "srv-prefix-title": "Prefijo de Comandos",
        "srv-prefix-label": "Establece el prefijo para los comandos de texto:",
        "srv-placeholder-prefix": "Ejemplo: !",
        "srv-logs-title": "Canales de Registro (Logs)",
        "srv-logs-desc": "Configura los canales donde el bot enviará los registros de eventos.",
        "srv-btn-save": "Guardar Cambios",

        // player.html (Música)
        "ply-title": "Controlador de Música",
        "ply-now-playing": "Sonando ahora:",
        "ply-status-paused": "Pausado",
        "ply-btn-resume": "Reanudar",
        "ply-btn-pause": "Pausar",
        "ply-btn-skip": "Saltar",
        "ply-btn-stop": "Detener",
        "ply-volume": "Volumen:",

        // status.html (Monitoreo)
        "st-title": "Estado del Sistema",
        "st-bot": "Estado del Bot:",
        "st-api": "Latencia API:",
        "st-lavalink": "Nodos Lavalink:",
        "st-db": "Base de Datos:",
        "st-online": "En Línea",
        "st-offline": "Desconectado",

        // commands.html (Lista de comandos)
        "cmd-title": "Lista de Comandos",
        "cmd-subtitle": "Explora los comandos disponibles organizados por categorías.",
        "cmd-cat-music": "Música",
        "cmd-cat-mod": "Moderación",

        // premium.html (Suscripción / Claves)
        "prem-title": "Sección Premium",
        "prem-status": "Tu Estado:",
        "prem-active": "Premium Activo",
        "prem-inactive": "No eres Premium",
        "prem-key-label": "Canjear Código Premium:",
        "prem-placeholder-key": "Introduce tu clave aquí...",
        "prem-btn-redeem": "Canjear Clave",

        // 404.html
        "err-title": "404 - Página No Encontrada",
        "err-desc": "Lo sentimos, la página que buscas no existe o ha sido movida.",
        "err-btn": "Volver al Inicio"
    },
    en: {
        // Common Navbar
        "nav-home": "Home",
        "nav-dashboard": "Dashboard",
        "nav-status": "Status",
        "nav-commands": "Commands",
        "nav-premium": "Premium",
        "nav-player": "Player",

        // index.html (Landing)
        "idx-title": "The Ultimate Bot for Your Server",
        "idx-desc": "High-quality music, strict moderation, advanced logs, and real-time notifications.",
        "idx-btn-login": "Login with Discord",

        // dashboard.html (Server Selection)
        "dash-title": "Your Servers",
        "dash-subtitle": "Select a server to configure the bot.",
        "dash-admin-required": "You must be an Administrator to view servers.",
        "dash-btn-manage": "Configure",
        "dash-btn-invite": "Invite Bot",

        // server.html (Specific Server Config)
        "srv-title": "General Configuration",
        "srv-prefix-title": "Command Prefix",
        "srv-prefix-label": "Set the prefix for text commands:",
        "srv-placeholder-prefix": "Example: !",
        "srv-logs-title": "Log Channels (Logs)",
        "srv-logs-desc": "Configure channels where the bot will send event logs.",
        "srv-btn-save": "Save Changes",

        // player.html (Music)
        "ply-title": "Music Controller",
        "ply-now-playing": "Now Playing:",
        "ply-status-paused": "Paused",
        "ply-btn-resume": "Resume",
        "ply-btn-pause": "Pause",
        "ply-btn-skip": "Skip",
        "ply-btn-stop": "Stop",
        "ply-volume": "Volume:",

        // status.html (Monitoring)
        "st-title": "System Status",
        "st-bot": "Bot Status:",
        "st-api": "API Latency:",
        "st-lavalink": "Lavalink Nodes:",
        "st-db": "Database:",
        "st-online": "Online",
        "st-offline": "Offline",

        // commands.html (Command List)
        "cmd-title": "Command List",
        "cmd-subtitle": "Explore the available commands organized by categories.",
        "cmd-cat-music": "Music",
        "cmd-cat-mod": "Moderation",

        // premium.html (Subscription / Keys)
        "prem-title": "Premium Section",
        "prem-status": "Your Status:",
        "prem-active": "Premium Active",
        "prem-inactive": "Not Premium",
        "prem-key-label": "Redeem Premium Code:",
        "prem-placeholder-key": "Enter your key here...",
        "prem-btn-redeem": "Redeem Key",

        // 404.html
        "err-title": "404 - Page Not Found",
        "err-desc": "Sorry, the page you are looking for does not exist or has been moved.",
        "err-btn": "Back to Home"
    }
};

function applyTranslations(lang) {
    document.querySelectorAll("[data-i18n]").forEach(element => {
        const key = element.getAttribute("data-i18n");
        if (translations[lang] && translations[lang][key]) {
            if (element.tagName === "INPUT" && element.hasAttribute("placeholder")) {
                element.placeholder = translations[lang][key];
            } else {
                element.innerHTML = translations[lang][key];
            }
        }
    });
    document.documentElement.lang = lang;
}

function changeLanguage(lang) {
    localStorage.setItem("selectedLanguage", lang);
    applyTranslations(lang);
    const selectElement = document.getElementById("lang-select");
    if (selectElement) selectElement.value = lang;
}

document.addEventListener("DOMContentLoaded", () => {
    const savedLang = localStorage.getItem("selectedLanguage") || 
                      (navigator.language.startsWith("en") ? "en" : "es");
    changeLanguage(savedLang);
});
