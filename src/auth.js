// Script de autorización de Spotify. Se ejecuta UNA vez: npm run auth
// Abre un servidor local temporal, te pide iniciar sesión en Spotify
// y guarda token.json con el refresh_token que usa el bot.

import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:8888/callback";
const TOKEN_FILE = new URL("../token.json", import.meta.url);

const SCOPES = ["playlist-modify-public", "playlist-modify-private"].join(" ");

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Falta SPOTIFY_CLIENT_ID o SPOTIFY_CLIENT_SECRET en tu .env");
    process.exit(1);
}

const redirect = new URL(REDIRECT_URI);
const state = crypto.randomBytes(16).toString("hex");

const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state
}).toString();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end("No encontrado");
        return;
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code || url.searchParams.get("state") !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Autorización fallida: ${error ?? "estado o código inválido"}`);
        console.error("Autorización fallida:", error ?? "estado o código inválido");
        server.close();
        process.exit(1);
    }

    try {
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(JSON.stringify(data));
        }

        fs.writeFileSync(
            TOKEN_FILE,
            JSON.stringify(
                {
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    expires_at: Date.now() + data.expires_in * 1000
                },
                null,
                2
            )
        );

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h2>✅ Spotify autorizado</h2><p>Ya puedes cerrar esta pestaña y volver a la terminal.</p>");

        console.log("\n✅ Listo: se guardó token.json. Ahora puedes ejecutar: npm start");
        server.close();
        process.exit(0);
    } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Error al obtener el token. Revisa la terminal.");
        console.error("Error al obtener el token:", err.message);
        server.close();
        process.exit(1);
    }
});

server.listen(Number(redirect.port) || 80, redirect.hostname, () => {
    console.log("\n1) Abre este enlace en tu navegador e inicia sesión en Spotify:\n");
    console.log(authUrl.toString());
    console.log(`\n2) Esperando la autorización en ${REDIRECT_URI} ...`);
});
