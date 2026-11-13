# Spotify Rewards Bot

Bot que agrega canciones a una **playlist de Spotify** cuando alguien canjea una **recompensa de puntos de canal** en Twitch. Funciona junto con **Streamer.bot**.

El espectador canjea la recompensa y escribe en el campo de texto:

- un enlace de Spotify (`https://open.spotify.com/track/...`, también con `/intl-es/` o `spotify.link/...`), o
- `artista - canción` (por ejemplo: `Bad Bunny - Monaco`).

El bot busca la canción, la agrega a la playlist y avisa en el chat. Si algo falla (enlace inválido, canción no encontrada o ya repetida), avisa y **reembolsa los puntos**.

---

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior
- [Streamer.bot](https://streamer.bot) con tu cuenta de Twitch conectada
- Una cuenta de Spotify (la dueña de la playlist)
- Un canal de Twitch con puntos de canal (Afiliado o Socio)

---

## 1. Instalar el proyecto

Abre una terminal dentro de la carpeta del proyecto y ejecuta:

```
npm install
```

Después copia `.env.example` y renómbralo a `.env`. Ahí irás llenando los datos de los pasos siguientes.

---

## 2. Crear la app de Spotify

1. Entra a <https://developer.spotify.com/dashboard> e inicia sesión.
2. Haz clic en **Create app**. Ponle el nombre que quieras.
3. En **Redirect URIs** agrega exactamente: `http://127.0.0.1:8888/callback`
4. Guarda. En **Settings** copia el **Client ID** y el **Client Secret**.
5. Pégalos en tu `.env`:

```
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret
```

> Spotify puede pedirte agregar tu usuario en **User Management** si la app está en modo desarrollo. Usa el correo de la cuenta de Spotify que va a autorizar.

---

## 3. Elegir la playlist

1. En Spotify, crea (o elige) la playlist donde se agregarán las canciones.
2. Clic derecho en la playlist, luego **Compartir**, luego **Copiar enlace**.
3. El enlace luce así: `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc`
4. El ID es lo que está entre `/playlist/` y el `?`. Pégalo en el `.env`:

```
SPOTIFY_PLAYLIST_ID=37i9dQZF1DXcBWIGoYBM5M
```

La playlist debe ser **tuya** (de la cuenta que vas a autorizar).

---

## 4. Autorizar Spotify (solo una vez)

```
npm run auth
```

1. La terminal mostrará un enlace. Ábrelo en el navegador.
2. Inicia sesión con la cuenta dueña de la playlist y acepta los permisos.
3. Verás "Spotify autorizado" y se creará el archivo `token.json`.

`token.json` contiene tu acceso a Spotify. **No lo compartas ni lo subas a GitHub.**

---

## 5. Configurar Streamer.bot

### 5.1 WebSocket Server

1. Ve a **Servers/Clients → WebSocket Server**.
2. Deja la dirección `127.0.0.1` y el puerto `8080`.
3. Activa **Auto Start**.
4. (Recomendado) Activa **Authentication** y define una contraseña. Para editarla, primero haz clic en **Stop Server**, y luego **Start Server**.
5. Si pusiste contraseña, agrégala al `.env`:

```
STREAMERBOT_PASSWORD=tu_contraseña
```

Si no usas contraseña, deja ese campo vacío.

### 5.2 Acción `SendChat` (envía mensajes al chat)

1. En **Actions**, clic derecho, **Add**. Nómbrala exactamente `SendChat`.
2. En **Sub-Actions**, clic derecho, **Add → Twitch → Chat → Send Message**.
3. En el texto escribe: `%message%`
4. Elige desde qué cuenta se envía (Broadcaster o Bot) y guarda.

### 5.3 Acción `RefundRedemption` (devuelve los puntos, opcional)

1. Crea otra acción llamada `RefundRedemption`.
2. Agrega el sub-action de Twitch para **cancelar o reembolsar una redención** (en Streamer.bot suele estar en **Twitch → Rewards**; el nombre exacto varía según la versión).
3. Como **Reward ID** usa `%rewardId%` y como **Redemption ID** usa `%redemptionId%`.

Si no quieres reembolsos, deja vacío `REFUND_ACTION=` en el `.env`.

### 5.4 Crear la recompensa

1. Ve a **Platforms → Twitch → Channel Point Rewards → Add**.
2. Actívale **Require viewer to enter text**.
3. Ponle nombre (por ejemplo `Pedir canción`), costo y cooldown.
4. Ponle en el `.env` el mismo nombre:

```
REWARD_TITLE=Pedir canción
```

> Crea la recompensa **desde Streamer.bot**, no desde Twitch. Así Streamer.bot tiene permiso para reembolsarla.

Si prefieres identificarla por ID (no se rompe si cambias el nombre), pon `REWARD_ID=` con su ID y deja `REWARD_TITLE` vacío.

---

## 6. Iniciar el bot

```
npm start
```

Deberías ver:

```
[OK] Conectado a Streamer.bot
```

Canjea la recompensa con un enlace o con `artista - canción` y revisa que aparezca el mensaje en el chat y la canción en la playlist.

---

## Variables del `.env`

| Variable | Descripción |
|---|---|
| `STREAMERBOT_HOST` / `STREAMERBOT_PORT` | Dirección del WebSocket Server (por defecto `127.0.0.1:8080`) |
| `STREAMERBOT_PASSWORD` | Contraseña del WebSocket (vacía si no tiene) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Credenciales de tu app de Spotify |
| `SPOTIFY_PLAYLIST_ID` | ID de la playlist |
| `SPOTIFY_REDIRECT_URI` | Debe coincidir con el Redirect URI de tu app |
| `SPOTIFY_MARKET` | País para la disponibilidad de canciones (ej. `MX`, `ES`, `US`) |
| `REWARD_TITLE` / `REWARD_ID` | Nombre o ID de la recompensa a escuchar |
| `PLAYLIST_NAME` | Cómo se nombra la playlist en el mensaje del chat |
| `CHAT_ACTION` | Nombre de la acción que envía mensajes (por defecto `SendChat`) |
| `REFUND_ACTION` | Nombre de la acción que reembolsa puntos |

---

## Problemas comunes

**No pasa nada al canjear.**
Activa el `console.log` comentado al inicio del handler en `src/index.js` para ver el evento. Revisa que el nombre de la recompensa coincida con `REWARD_TITLE` (o usa `REWARD_ID`).

**`Authentication required` o `Request failed`.**
Streamer.bot tiene contraseña y el `.env` no la tiene, o es distinta. También revisa que el WebSocket Server esté iniciado.

**Los mensajes no salen en el chat.**
Verifica que la acción `SendChat` exista, esté activada y se llame exactamente igual que `CHAT_ACTION`. Mira la pestaña **Log** de Streamer.bot.

**`No existe token.json`.**
Ejecuta `npm run auth`.

**Error 403 de Spotify al agregar.**
Autorizaste con una cuenta distinta a la dueña de la playlist, o faltan permisos. Borra `token.json` y vuelve a ejecutar `npm run auth`. Si tu app está en modo desarrollo, agrega tu usuario en **User Management**.

**Error `invalid_grant` al renovar el token.**
Se revocó el acceso. Borra `token.json` y vuelve a autorizar con `npm run auth`.

**La canción equivocada se agrega.**
Con texto libre se usa el primer resultado de Spotify. Pide a tu comunidad usar el formato `artista - canción` o pegar el enlace.

---

## Seguridad

Nunca compartas `.env` ni `token.json`. Ya están incluidos en `.gitignore`. Si se filtran, regenera el Client Secret en el Dashboard de Spotify y vuelve a autorizar.
