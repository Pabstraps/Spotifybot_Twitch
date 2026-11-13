import "dotenv/config";
import fs from "node:fs";

const TOKEN_FILE = new URL("../token.json", import.meta.url);

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID;
const MARKET = process.env.SPOTIFY_MARKET || "MX";

let tokenData = null;
let refreshPromise = null;

// ---------------------------------------------------------------
// Manejo de tokens
// ---------------------------------------------------------------

function loadToken() {
    if (!fs.existsSync(TOKEN_FILE)) {
        throw new Error("No existe token.json. Ejecuta primero: npm run auth");
    }

    tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));

    if (!tokenData.refresh_token) {
        throw new Error("token.json no tiene refresh_token. Ejecuta de nuevo: npm run auth");
    }
}

function saveToken() {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
}

async function refreshAccessToken() {
    // Evita renovar varias veces a la vez si llegan canjes simultáneos.
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: tokenData.refresh_token
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Error renovando token de Spotify: ${JSON.stringify(data)}`);
        }

        tokenData.access_token = data.access_token;
        tokenData.expires_at = Date.now() + data.expires_in * 1000;

        if (data.refresh_token) {
            tokenData.refresh_token = data.refresh_token;
        }

        saveToken();
    })();

    try {
        await refreshPromise;
    } finally {
        refreshPromise = null;
    }
}

async function getAccessToken() {
    if (!tokenData) loadToken();

    if (!tokenData.expires_at || Date.now() >= tokenData.expires_at - 60_000) {
        await refreshAccessToken();
    }

    return tokenData.access_token;
}

// ---------------------------------------------------------------
// Peticiones a la API
// ---------------------------------------------------------------

async function doFetch(endpoint, options, accessToken) {
    return fetch(`https://api.spotify.com/v1${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...options.headers
        }
    });
}

async function spotifyRequest(endpoint, options = {}) {
    let response = await doFetch(endpoint, options, await getAccessToken());

    // Si el token caducó antes de lo esperado, renovar y reintentar una vez.
    if (response.status === 401) {
        tokenData.expires_at = 0;
        response = await doFetch(endpoint, options, await getAccessToken());
    }

    if (!response.ok) {
        throw new Error(`Spotify API: ${response.status} ${await response.text()}`);
    }

    return response.status === 204 ? null : response.json();
}

// ---------------------------------------------------------------
// Utilidades de canciones
// ---------------------------------------------------------------

/**
 * Acepta enlaces de canciones individuales:
 *  - https://open.spotify.com/track/ID
 *  - https://open.spotify.com/intl-es/track/ID?si=...
 *  - spotify:track:ID
 *  - https://spotify.link/xxxx (enlace corto de la app móvil)
 */
export async function extractTrackId(input) {
    let value = String(input).trim();

    if (/^https?:\/\/spotify\.link\//i.test(value)) {
        try {
            const res = await fetch(value, { redirect: "follow" });
            value = res.url;
        } catch {
            return null;
        }
    }

    const match = value.match(
        /^(?:https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?track\/|spotify:track:)([a-zA-Z0-9]{22})(?:[/?#]\S*)?$/i
    );

    return match ? match[1] : null;
}

/**
 * Busca por texto. Si viene como "artista - canción" usa filtros
 * para mayor precisión; si no encuentra nada, hace una búsqueda libre.
 */
export async function searchTrackId(query) {
    const text = String(query).trim();
    if (!text) return null;

    const search = async (q) => {
        const data = await spotifyRequest(
            `/search?q=${encodeURIComponent(q)}&type=track&limit=5&market=${MARKET}`
        );
        const items = data?.tracks?.items ?? [];
        return items.find((t) => t?.id && t.is_playable !== false) ?? null;
    };

    let track = null;

    const parts = text.split(/\s+-\s+/);
    if (parts.length >= 2) {
        const artist = parts[0].trim();
        const title = parts.slice(1).join(" ").trim();
        track = await search(`track:${title} artist:${artist}`);
    }

    if (!track) {
        track = await search(text.replace(/\s+-\s+/g, " "));
    }

    return track?.id ?? null;
}

export async function getTrack(trackId) {
    return spotifyRequest(`/tracks/${encodeURIComponent(trackId)}?market=${MARKET}`);
}

export async function isDuplicate(trackUri) {
    let url = `/playlists/${encodeURIComponent(PLAYLIST_ID)}/items?limit=50`;

    while (url) {
        const data = await spotifyRequest(url);

        const found = (data.items || []).some((entry) => {
            const item = entry.item ?? entry.track;
            return item?.uri === trackUri;
        });

        if (found) return true;

        url = data.next ? data.next.replace("https://api.spotify.com/v1", "") : null;
    }

    return false;
}

export async function addSong(trackId) {
    if (!PLAYLIST_ID) {
        throw new Error("Falta SPOTIFY_PLAYLIST_ID en .env");
    }

    if (!/^[a-zA-Z0-9]{22}$/.test(trackId)) {
        throw new Error("ID de canción no válido.");
    }

    const track = await getTrack(trackId);

    if (!track || !track.uri || track.is_playable === false) {
        throw new Error("La canción no está disponible.");
    }

    const artists = track.artists.map((a) => a.name).join(", ");

    if (await isDuplicate(track.uri)) {
        return { status: "duplicate", name: track.name, artists };
    }

    await spotifyRequest(`/playlists/${encodeURIComponent(PLAYLIST_ID)}/items`, {
        method: "POST",
        body: JSON.stringify({ uris: [track.uri] })
    });

    return {
        status: "added",
        name: track.name,
        artists,
        url: track.external_urls?.spotify
    };
}
