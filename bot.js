import mineflayer from 'mineflayer';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import readline from 'readline';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env explicitly from current directory
dotenv.config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    console.error('[!] ERROR: GROQ_API_KEY is not defined in .env or environment variables!');
    process.exit(1);
}

const groq = new Groq({ apiKey });

// Server and Bot configuration
const BOT_CONFIG = {
    host: process.env.SERVER_HOST || 'sorrypen.aternos.me',
    port: parseInt(process.env.SERVER_PORT || '34747', 10),
    username: process.env.BOT_NAME || 'babbu_katiya',
    auth: 'offline', // Cracked / Offline mode
    checkTimeoutInterval: 60000
};

const BOT_PASSWORD = process.env.BOT_PASSWORD || 'BabbuPass123';

// Available Groq models with fallback
const GROQ_MODELS = [
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'llama3-8b-8192',
    'mixtral-8x7b-32768'
];

let bot;
let isReplying = false;
let lastChatTime = 0;
let hasAttemptedAuth = false;
const CHAT_COOLDOWN_MS = 3500;

// Context memory for AI persona
const chatHistory = [
    {
        role: 'system',
        content: `You are "${BOT_CONFIG.username}", a legendary, witty, street-smart player on a Minecraft Lifesteal SMP server.
Personality & Rules:
- You speak in casual English or fun Hinglish (e.g. "bhai", "meri jaan", "heart de de", "arre yaar").
- You are bold, funny, full of attitude, but entertaining to talk to.
- You talk about stealing hearts, PvP, totems, ender pearls, bases, traps, and alliances.
- Keep responses short and punchy (1 to 2 short sentences, MAX 80 characters) so it fits in Minecraft chat.
- NEVER use markdown (*, _, #, \`), emojis, or quotes. Only plain chat text.`
    }
];

// ----------------------------------------------------
// 1. Interactive Terminal Console (User Send Messages)
// ----------------------------------------------------
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});

rl.on('line', (line) => {
    const input = line.trim();
    if (!input) {
        rl.prompt();
        return;
    }

    if (!bot || !bot.entity) {
        console.log('[!] Bot is not currently connected to the server. Wait for connection.');
        rl.prompt();
        return;
    }

    // Direct chat or command execution
    bot.chat(input);
    console.log(`[You -> Server] ${input}`);
    rl.prompt();
});

// ----------------------------------------------------
// 2. Render Health Check Server (Keep-Alive on Render)
// ----------------------------------------------------
const HTTP_PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: BOT_CONFIG.username,
        server: `${BOT_CONFIG.host}:${BOT_CONFIG.port}`,
        connected: Boolean(bot && bot.entity)
    }));
});

server.listen(HTTP_PORT, () => {
    console.log(`[HTTP] Render health-check web server listening on port ${HTTP_PORT}`);
});

// ----------------------------------------------------
// 3. Minecraft Bot Implementation
// ----------------------------------------------------
function createBot() {
    console.log(`[*] Connecting to ${BOT_CONFIG.host}:${BOT_CONFIG.port} as "${BOT_CONFIG.username}" (Cracked/Offline)...`);
    hasAttemptedAuth = false;

    bot = mineflayer.createBot(BOT_CONFIG);

    bot.on('login', () => {
        console.log(`[+] Logged in successfully to ${BOT_CONFIG.host}!`);
    });

    bot.on('spawn', () => {
        console.log(`[+] ${BOT_CONFIG.username} has spawned in the world!`);
        rl.prompt();

        // Automatic /register and /login on first login
        setTimeout(() => {
            attemptAuth('spawn');
        }, 1500);

        startLifeStealBehavior();
    });

    // Display all general server & player messages cleanly
    bot.on('messagestr', (message) => {
        const cleanMsg = message.trim();
        if (!cleanMsg) return;

        // Print incoming messages to terminal
        console.log(`\n[SERVER] ${cleanMsg}`);
        rl.prompt();

        // Check if server asks for registration or login
        const lower = cleanMsg.toLowerCase();
        if (lower.includes('/register') || lower.includes('register with') || lower.includes('please register')) {
            attemptAuth('register_prompt');
        } else if (lower.includes('/login') || lower.includes('login with') || lower.includes('please login')) {
            attemptAuth('login_prompt');
        }

        // React to death messages in Lifesteal SMP
        if ((lower.includes('was slain') || lower.includes('fell') || lower.includes('died') || lower.includes('killed')) && !lower.includes(BOT_CONFIG.username.toLowerCase())) {
            if (Date.now() - lastChatTime > 15000 && Math.random() < 0.6) {
                setTimeout(() => {
                    const deathRoasts = [
                        'Ek aur free heart market me aa gaya!',
                        'Lmaooo skill issue bro!',
                        'RIP bro, uska heart mere paas aana chahiye tha.',
                        'Free loot alert! Heart kisko mila?'
                    ];
                    safeChat(deathRoasts[Math.floor(Math.random() * deathRoasts.length)]);
                }, 2000);
            }
        }
    });

    // Chat handler
    bot.on('chat', async (username, message) => {
        if (username === bot.username) return; // Ignore self

        console.log(`\n[CHAT] <${username}> ${message}`);
        rl.prompt();

        const cleanMsg = message.trim();
        if (!cleanMsg) return;

        const lower = cleanMsg.toLowerCase();
        const isMentioned = lower.includes('babbu') || lower.includes('katiya') || lower.includes('bot');
        const isQuestion = cleanMsg.endsWith('?') || lower.startsWith('who') || lower.startsWith('what') || lower.startsWith('kaha') || lower.startsWith('kaun');
        const now = Date.now();

        // Respond when mentioned, asked questions, or naturally engage in conversation
        if (isMentioned || isQuestion || (Math.random() < 0.40 && now - lastChatTime > 12000)) {
            triggerAiResponse(username, cleanMsg);
        }
    });

    // Handle Kicks & Errors
    bot.on('kicked', (reason) => {
        console.warn(`\n[!] Bot was kicked from server: ${reason}`);
        rl.prompt();
    });

    bot.on('error', (err) => {
        console.error(`\n[!] Connection error: ${err.message}`);
        rl.prompt();
    });

    bot.on('end', () => {
        console.log('\n[*] Disconnected. Attempting to reconnect in 15 seconds...');
        rl.prompt();
        setTimeout(createBot, 15000);
    });
}

// ----------------------------------------------------
// 4. Registration & Login Helper
// ----------------------------------------------------
function attemptAuth(source) {
    if (!bot || !bot.entity) return;

    if (source === 'register_prompt' || source === 'spawn') {
        console.log(`[*] Executing /register command...`);
        bot.chat(`/register ${BOT_PASSWORD} ${BOT_PASSWORD}`);
    }

    if (source === 'login_prompt' || source === 'spawn') {
        setTimeout(() => {
            if (!bot || !bot.entity) return;
            console.log(`[*] Executing /login command...`);
            bot.chat(`/login ${BOT_PASSWORD}`);
        }, 1200);
    }
}

// ----------------------------------------------------
// 5. Rate-Limited Safe Chat
// ----------------------------------------------------
function safeChat(msg) {
    if (!bot || !bot.entity) return;
    const now = Date.now();
    const delay = Math.max(0, CHAT_COOLDOWN_MS - (now - lastChatTime));

    setTimeout(() => {
        try {
            const clean = msg.replace(/[\r\n]+/g, ' ').substring(0, 100);
            bot.chat(clean);
            lastChatTime = Date.now();
            console.log(`\n[Bot Chat] <${BOT_CONFIG.username}> ${clean}`);
            rl.prompt();
        } catch (e) {
            console.error('[!] Failed to send chat message:', e.message);
        }
    }, delay);
}

// ----------------------------------------------------
// 6. Groq AI Integration
// ----------------------------------------------------
async function triggerAiResponse(username, userMessage) {
    if (isReplying) return;
    isReplying = true;

    try {
        chatHistory.push({
            role: 'user',
            content: `${username}: ${userMessage}`
        });

        if (chatHistory.length > 12) {
            chatHistory.splice(1, 2);
        }

        let replyText = null;

        for (const modelName of GROQ_MODELS) {
            try {
                const response = await groq.chat.completions.create({
                    model: modelName,
                    messages: chatHistory,
                    max_tokens: 45,
                    temperature: 0.85
                });

                replyText = response.choices?.[0]?.message?.content?.trim();
                if (replyText) break;
            } catch (err) {
                console.warn(`[-] Groq ${modelName} error: ${err.message}, trying next...`);
            }
        }

        if (replyText) {
            replyText = replyText
                .replace(/^["']|["']$/g, '')
                .replace(/[*_#`]/g, '')
                .replace(/\n+/g, ' ')
                .trim();

            chatHistory.push({
                role: 'assistant',
                content: replyText
            });

            safeChat(replyText);
        }
    } catch (error) {
        console.error('[!] Error in AI response:', error.message);
    } finally {
        isReplying = false;
    }
}

// ----------------------------------------------------
// 7. Active Movement & LifeSteal Behavior
// ----------------------------------------------------
function startLifeStealBehavior() {
    setInterval(() => {
        if (!bot || !bot.entity) return;

        // Look at nearest player
        const nearestPlayer = bot.nearestEntity((entity) => entity.type === 'player' && entity !== bot.entity);
        if (nearestPlayer && nearestPlayer.position) {
            const distance = bot.entity.position.distanceTo(nearestPlayer.position);
            if (distance < 12) {
                bot.lookAt(nearestPlayer.position.offset(0, 1.6, 0), true);

                if (Math.random() < 0.3) {
                    bot.swingArm('right');
                } else if (Math.random() < 0.25) {
                    bot.setControlState('sneak', true);
                    setTimeout(() => bot.setControlState('sneak', false), 400);
                }
            }
        } else {
            // Random gaze
            const randomYaw = (Math.random() * Math.PI * 2) - Math.PI;
            const randomPitch = (Math.random() * 0.4) - 0.2;
            bot.look(randomYaw, randomPitch, false);
        }

        // Random walking step
        const randomAction = Math.random();
        if (randomAction < 0.4) {
            bot.setControlState('forward', true);
            if (Math.random() < 0.25) bot.setControlState('jump', true);
            setTimeout(() => {
                bot.setControlState('forward', false);
                bot.setControlState('jump', false);
            }, 800 + Math.random() * 1200);
        } else if (randomAction < 0.6) {
            const strafe = Math.random() < 0.5 ? 'left' : 'right';
            bot.setControlState(strafe, true);
            setTimeout(() => bot.setControlState(strafe, false), 600);
        }
    }, 3500);

    // Anti-drown / anti-fall safety
    setInterval(() => {
        if (!bot || !bot.entity) return;
        const block = bot.blockAt(bot.entity.position);
        if (block && (block.name === 'water' || block.name === 'flowing_water' || block.name === 'lava')) {
            bot.setControlState('jump', true);
        }
    }, 500);
}

// Start the bot
createBot();
