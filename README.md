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

Ejemplo de respuestas:

```text
Easyhook API key: eh_live_xxx
WhatsApp sender number from Easyhook: 5218661479075
Your WhatsApp number(s) allowed to control Codex: 5215660069997
Default repo/folder where Codex should run: /home/benjaminrm10/repos/agent-tool
```

Lo demas se configura automaticamente:

- `HOST=127.0.0.1`
- `PORT=8787`
- `TUNNEL=auto`

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

Para guardar el bearer secret que Easyhook entrega despues de registrar la URL:

```bash
codex-whatsapp set-secret <BEARER_SECRET_DE_EASYHOOK>
```

Arranque para levantar Codex WhatsApp y obtener la URL publica:

```bash
codex-whatsapp start
```

Modo desarrollo:

```bash
cp .env.example .env
npm run start:tunnel
```

La herramienta arranca el servidor local. Si detecta que esta escuchando en una IP local o privada, abre Cloudflare Tunnel automaticamente. En consola imprimira la URL:

```text
Webhook URL: https://xxxx.trycloudflare.com/webhook
```

En Easyhook pega esa URL como webhook y suscribete a los eventos. Despues Easyhook te dara un bearer secret. Guardalo con:

```bash
codex-whatsapp set-secret <BEARER_SECRET_DE_EASYHOOK>
```

Tambien puedes pegar el bearer secret directamente en la terminal donde esta corriendo `codex-whatsapp start`; cuando aparece la URL, el proceso te lo pide. Si lo pegas ahi, no necesitas reiniciar.

El flujo esperado es:

```text
1. Corre codex-whatsapp start
2. Copia Webhook URL en Easyhook
3. Suscribete a los eventos en Easyhook
4. Copia el bearer secret que Easyhook te entrega
5. Pegalo en la terminal de codex-whatsapp cuando te lo pida
6. Desde tu numero autorizado manda /status por WhatsApp
7. Deja esa terminal abierta; es el servidor local
```

## Variables

```bash
EASYHOOK_API_KEY=eh_live_xxx
EASYHOOK_FROM=5218661479075
ALLOWED_USERS=5215660069997,521XXXXXXXXXX
PORT=8787
HOST=127.0.0.1
TUNNEL=auto
NOTIFY_ON_START=0
DEFAULT_CWD=/home/benjaminrm10/repos/agent-tool
WEBHOOK_BEARER_SECRET=lo_entrega_easyhook_despues_de_configurar_url
CODEX_BIN=codex
CODEX_USE_PTY=1
```

Puedes forzar el tunnel con `codex-whatsapp start --tunnel` o desactivarlo con `codex-whatsapp start --no-tunnel`.

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
