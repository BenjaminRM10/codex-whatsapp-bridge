# codex-whatsapp-bridge

MVP local para controlar Codex desde WhatsApp usando Easyhook.

## Configuracion

Instalacion:

```bash
curl -fsSL https://raw.githubusercontent.com/BenjaminRM10/codex-whatsapp-bridge/main/install.sh | bash
```

El instalador abre un onboarding para capturar:

- `EASYHOOK_API_KEY`
- `EASYHOOK_FROM`
- `ALLOWED_USERS`
- ruta default del repo
- tunnel automatico
- notificacion por WhatsApp al arrancar
- variables opcionales como `WEBHOOK_BEARER_SECRET`, `CODEX_BIN`, `CODEX_USE_PTY`

Si quieres instalar sin onboarding:

```bash
curl -fsSL https://raw.githubusercontent.com/BenjaminRM10/codex-whatsapp-bridge/main/install.sh | SKIP_SETUP=1 bash
```

Mientras pruebas desde este checkout:

```bash
REPO_RAW_BASE=file://$PWD bash ./install.sh
```

Puedes volver a abrir el onboarding cuando quieras:

```bash
codex-whatsapp setup
```

Arranque para levantar el tunnel y obtener la URL publica:

```bash
codex-whatsapp start --tunnel
```

Modo desarrollo:

```bash
cp .env.example .env
npm run start:tunnel
```

La herramienta arranca el servidor local y un Cloudflare Tunnel automaticamente. En consola imprimira una URL como:

```text
https://xxxx.trycloudflare.com/webhook
```

Esa es la URL que debes pegar en Easyhook.

## Variables

```bash
EASYHOOK_API_KEY=eh_live_xxx
EASYHOOK_FROM=5218661479075
ALLOWED_USERS=5215660069997,521XXXXXXXXXX
PORT=8787
HOST=127.0.0.1
TUNNEL=1
NOTIFY_ON_START=0
DEFAULT_CWD=/home/benjaminrm10/repos/agent-tool
WEBHOOK_BEARER_SECRET=opcional
CODEX_BIN=codex
CODEX_USE_PTY=1
```

`NOTIFY_ON_START=1` manda la URL publica por WhatsApp al primer numero de `ALLOWED_USERS`.

## Comandos WhatsApp

```text
/status
/cwd /ruta/del/repo
/resume
/resume instruccion inicial
/send texto para Codex
/enter
/up
/down
/model
/model gpt-5-codex
/permissions
/permissions on-request
/tail
/stop
/help
```

Notas:

- `/resume` arranca `codex resume` en la ruta configurada.
- `/send` escribe texto al proceso de Codex y presiona Enter.
- `/model` y `/permissions` mandan esos slash commands al proceso activo, igual que si los escribieras en la terminal.
- Para seleccionar una conversacion del menu de `codex resume`, usa `/up`, `/down` y `/enter`.
- Por defecto intenta correr Codex con pseudo-TTY usando `script`, para que `codex resume` se comporte mas parecido a la terminal. Si da problemas, usa `CODEX_USE_PTY=0`.
