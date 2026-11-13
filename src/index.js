import "dotenv/config";
import { StreamerbotClient } from "@streamerbot/client";
import { addSong, extractTrackId, searchTrackId } from "./spotify.js";

// ---------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------

const REWARD_TITLE = (process.env.REWARD_TITLE ?? "").trim().toLowerCase();
const REWARD_ID = (process.env.REWARD_ID ?? "").trim();
const PLAYLIST_NAME = process.env.PLAYLIST_NAME || "la playlist";
const CHAT_ACTION = process.env.CHAT_ACTION || "SendChat";
const REFUND_ACTION = (process.env.REFUND_ACTION ?? "RefundRedemption").trim();

if (!REWARD_ID && !REWARD_TITLE) {
    console.error("Define REWARD_TITLE o REWARD_ID en tu .env");
    process.exit(1);
}

const client = new StreamerbotClient({
    host: process.env.STREAMERBOT_HOST || "127.0.0.1",
    port: Number(process.env.STREAMERBOT_PORT) || 8080,
    // Si no hay contraseña, se envía undefined y no se autentica.
    password: process.env.STREAMERBOT_PASSWORD || undefined,
    onConnect: () => console.log("[OK] Conectado a Streamer.bot"),
    onDisconnect: () => console.log("[AVISO] Desconectado de Streamer.bot, reintentando...")
});

console.log("================================");
console.log("     SPOTIFY REWARDS BOT");
console.log("================================");
console.log("[INFO] Conectando con Streamer.bot...");

// ---------------------------------------------------------------
// Acciones de Streamer.bot
// ---------------------------------------------------------------

async function sendChat(message) {
    try {
        await client.doAction({ name: CHAT_ACTION }, { message });
    } catch (err) {
        console.error("[ERROR CHAT]", err.message);
    }
}

async function refund(rewardId, redemptionId) {
    if (!REFUND_ACTION) return;

    try {
        await client.doAction({ name: REFUND_ACTION }, { rewardId, redemptionId });
    } catch (err) {
        console.error("[ERROR REEMBOLSO]", err.message);
    }
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------

function isSongReward(reward) {
    if (!reward) return false;
    if (REWARD_ID) return reward.id === REWARD_ID;
    return String(reward.title ?? "").trim().toLowerCase() === REWARD_TITLE;
}

// Evita procesar dos veces el mismo canje (por reconexiones o eventos repetidos).
const processed = new Set();

function alreadyProcessed(id) {
    if (!id) return false;
    if (processed.has(id)) return true;

    processed.add(id);
    if (processed.size > 500) {
        processed.delete(processed.values().next().value);
    }

    return false;
}

// ---------------------------------------------------------------
// Evento principal: canje de recompensa
// ---------------------------------------------------------------

client.on("Twitch.RewardRedemption", async ({ data }) => {
    // Descomenta esta línea la primera vez para ver la estructura real del evento:
    // console.log(JSON.stringify(data, null, 2));

    const reward = data?.reward;
    if (!isSongReward(reward)) return;

    const redemptionId = data.id;
    if (alreadyProcessed(redemptionId)) return;

    const username = data.user_name ?? data.user_login ?? "Usuario";
    const input = (data.user_input ?? "").trim();

    console.log(`[CANJE] ${username}: ${input || "(sin texto)"}`);

    if (!input) {
        await sendChat(`@${username} escribe el enlace de Spotify o "artista - canción" al canjear.`);
        await refund(reward.id, redemptionId);
        return;
    }

    try {
        const isLink = /^(https?:\/\/|spotify:)/i.test(input);

        const trackId = isLink
            ? await extractTrackId(input.split(/\s+/)[0])
            : await searchTrackId(input);

        if (!trackId) {
            await sendChat(
                isLink
                    ? `@${username} ese enlace no es válido. Solo se aceptan canciones individuales de Spotify.`
                    : `@${username} no encontré esa canción. Prueba con "artista - canción" o con el enlace.`
            );
            await refund(reward.id, redemptionId);
            return;
        }

        const result = await addSong(trackId);

        if (result.status === "duplicate") {
            await sendChat(
                `@${username} esa canción ya está en la playlist: ${result.name} - ${result.artists}.`
            );
            await refund(reward.id, redemptionId);
            return;
        }

        await sendChat(
            `🎵 @${username} agregó "${result.name}" - ${result.artists} a ${PLAYLIST_NAME}.`
        );
    } catch (error) {
        console.error("[ERROR SPOTIFY]", error.message);
        await sendChat(`@${username} no pude agregar esa canción. Se te devolvieron los puntos.`);
        await refund(reward.id, redemptionId);
    }
});
