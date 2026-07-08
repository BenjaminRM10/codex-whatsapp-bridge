#!/usr/bin/env node
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

loadDotEnv();

const command = process.argv[2] || "start";

if (command === "help" || command === "--help" || command === "-h") {
  console.log(helpText());
  process.exit(0);
}

const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",
  tunnel: process.argv.includes("--tunnel") || process.env.TUNNEL === "1",
  notifyOnStart: process.env.NOTIFY_ON_START === "1",
  easyhookApiKey: required("EASYHOOK_API_KEY"),
  easyhookFrom: required("EASYHOOK_FROM"),
  allowedUsers: new Set((process.env.ALLOWED_USERS || "").split(",").map((s) => onlyDigits(s)).filter(Boolean)),
  defaultCwd: process.env.DEFAULT_CWD || process.cwd(),
  webhookBearerSecret: process.env.WEBHOOK_BEARER_SECRET || "",
  codexBin: process.env.CODEX_BIN || "codex",
  usePty: process.env.CODEX_USE_PTY !== "0",
};

const state = {
  cwd: config.defaultCwd,
  proc: null,
  startedAt: null,
  lastFrom: null,
  output: "",
  tunnelProc: null,
  tunnelUrl: "",
};

if (command === "start") {
  startServer();
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return json(res, 200, { ok: true, running: Boolean(state.proc), cwd: state.cwd });
      }

      if (req.method !== "POST" || req.url !== "/webhook") {
        return json(res, 404, { error: "not_found" });
      }

      if (config.webhookBearerSecret) {
        const auth = req.headers.authorization || "";
        if (auth !== `Bearer ${config.webhookBearerSecret}`) {
          return json(res, 401, { error: "unauthorized" });
        }
      }

      const event = JSON.parse(await readBody(req));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));

      void handleWebhook(event).catch((error) => {
        console.error(error);
      });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
  });

  server.on("error", (error) => {
    console.error(`Failed to listen on ${config.host}:${config.port}: ${error.message}`);
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    console.log(`codex-whatsapp listening on http://${config.host}:${config.port}/webhook`);
    console.log(`Default cwd: ${state.cwd}`);
    if (config.tunnel) startCloudflareTunnel();
  });
}

function startCloudflareTunnel() {
  if (!hasCommand("cloudflared")) {
    console.error("cloudflared no esta instalado. Instala Cloudflare Tunnel o arranca sin --tunnel.");
    console.error("Linuxbrew: brew install cloudflared");
    return;
  }

  const localUrl = `http://${config.host}:${config.port}`;
  const child = spawn("cloudflared", ["tunnel", "--url", localUrl], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  state.tunnelProc = child;

  const onData = (chunk) => {
    const text = stripAnsi(String(chunk));
    process.stdout.write(text);
    const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/);
    if (!match || state.tunnelUrl) return;

    state.tunnelUrl = `${match[0]}/webhook`;
    const message = [
      "Cloudflare Tunnel activo.",
      `Webhook Easyhook: ${state.tunnelUrl}`,
      config.webhookBearerSecret ? "Authorization: Bearer <WEBHOOK_BEARER_SECRET>" : "",
    ].filter(Boolean).join("\n");

    console.log(`\n${message}\n`);

    if (config.notifyOnStart) {
      const firstUser = [...config.allowedUsers][0];
      if (firstUser) void sendText(firstUser, message);
    }
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("exit", (code, signal) => {
    state.tunnelProc = null;
    console.error(`cloudflared termino. code=${code ?? "null"} signal=${signal ?? "null"}`);
  });
}

async function handleWebhook(event) {
  const msg = extractMessage(event);
  if (!msg.text || !msg.from) return;

  const from = onlyDigits(msg.from);
  state.lastFrom = from;

  if (!config.allowedUsers.has(from)) {
    await sendText(from, "No tienes permiso para controlar Codex desde este numero.");
    return;
  }

  const text = msg.text.trim();
  const response = await handleCommand(text, from);
  if (response) await sendText(from, response);
}

async function handleCommand(text, from) {
  if (text === "/help") return helpText();
  if (text === "/status") return statusText();
  if (text === "/tail") return tailText();
  if (text === "/stop") return stopCodex();

  if (text.startsWith("/cwd ")) {
    const nextCwd = text.slice(5).trim();
    if (!path.isAbsolute(nextCwd)) return "La ruta debe ser absoluta. Ejemplo: /cwd /home/benjaminrm10/repos/agent-tool";
    if (!fs.existsSync(nextCwd) || !fs.statSync(nextCwd).isDirectory()) return `No existe esa carpeta: ${nextCwd}`;
    if (state.proc) return "Deten Codex con /stop antes de cambiar de ruta.";
    state.cwd = nextCwd;
    return `Ruta activa:\n${state.cwd}`;
  }

  if (text === "/resume" || text.startsWith("/resume ")) {
    const initial = text === "/resume" ? "" : text.slice(8).trim();
    return startCodex(["resume"], initial, from);
  }

  if (text === "/enter") return writeToCodex("\n");
  if (text === "/up") return writeToCodex("\x1b[A");
  if (text === "/down") return writeToCodex("\x1b[B");

  if (text === "/model" || text.startsWith("/model ")) {
    const value = text === "/model" ? "/model" : `/model ${text.slice(7).trim()}`;
    return writeToCodex(`${value}\n`);
  }

  if (text === "/permissions" || text.startsWith("/permissions ") || text.startsWith("/permission ")) {
    const parts = text.split(/\s+/);
    const value = parts.length === 1 ? "/permissions" : `/permissions ${parts.slice(1).join(" ")}`;
    return writeToCodex(`${value}\n`);
  }

  if (text.startsWith("/send ")) return writeToCodex(`${text.slice(6)}\n`);

  if (state.proc) return writeToCodex(`${text}\n`);

  return "Comando no reconocido. Usa /help. Si quieres hablar con Codex, primero usa /resume.";
}

function startCodex(args, initialInput, from) {
  if (state.proc) return "Codex ya esta activo. Usa /tail, /send, /up, /down, /enter o /stop.";
  if (!fs.existsSync(state.cwd)) return `La ruta activa no existe: ${state.cwd}`;

  const command = buildCodexCommand(args);
  const child = spawn(command.bin, command.args, {
    cwd: state.cwd,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  state.proc = child;
  state.startedAt = new Date();
  state.output = "";

  child.stdout.on("data", (chunk) => appendOutput(chunk, from));
  child.stderr.on("data", (chunk) => appendOutput(chunk, from));

  child.on("exit", (code, signal) => {
    const summary = `Codex termino. code=${code ?? "null"} signal=${signal ?? "null"}\n\n${tailText()}`;
    state.proc = null;
    state.startedAt = null;
    if (state.lastFrom) void sendText(state.lastFrom, summary);
  });

  if (initialInput) {
    setTimeout(() => {
      writeRaw(`${initialInput}\n`);
    }, 700);
  }

  return `Codex iniciado:\n${command.label}\n\nRuta:\n${state.cwd}\n\nUsa /tail para ver salida. Si aparece el selector de sesiones, usa /up, /down y /enter.`;
}

function buildCodexCommand(args) {
  const label = `${config.codexBin} ${args.join(" ")}`;
  if (!config.usePty || !hasCommand("script")) {
    return { bin: config.codexBin, args, label };
  }

  return {
    bin: "script",
    args: ["-qfec", `${quoteShell(config.codexBin)} ${args.map(quoteShell).join(" ")}`, "/dev/null"],
    label: `${label} (pty via script)`,
  };
}

function writeToCodex(input) {
  if (!state.proc) return "Codex no esta activo. Usa /resume primero.";
  writeRaw(input);
  return input === "\n" ? "Enter enviado." : "Enviado a Codex.";
}

function writeRaw(input) {
  state.proc.stdin.write(input);
}

function stopCodex() {
  if (!state.proc) return "Codex no esta activo.";
  state.proc.kill("SIGINT");
  return "SIGINT enviado a Codex. Si no se detiene, manda /stop otra vez.";
}

function appendOutput(chunk, from) {
  const text = stripAnsi(String(chunk));
  state.output = `${state.output}${text}`.slice(-12000);

  const useful = text.trim();
  if (!useful) return;

  clearTimeout(appendOutput.timer);
  appendOutput.timer = setTimeout(() => {
    if (state.proc && from) void sendText(from, tailText());
  }, 1200);
}

function statusText() {
  return [
    `Codex: ${state.proc ? "activo" : "detenido"}`,
    `Ruta: ${state.cwd}`,
    state.tunnelUrl ? `Webhook: ${state.tunnelUrl}` : "",
    state.startedAt ? `Inicio: ${state.startedAt.toISOString()}` : "",
    `Comandos: /resume, /send, /model, /permissions, /tail, /stop`,
  ].filter(Boolean).join("\n");
}

function tailText() {
  const tail = state.output.trim().slice(-3000);
  return tail ? `Ultima salida:\n${tail}` : "Todavia no hay salida capturada.";
}

function helpText() {
  return `Comandos:
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

Arranque:
codex-whatsapp start --tunnel`;
}

async function sendText(to, body) {
  const res = await fetch("https://api.easyhook.dev/v1/messages/text", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.easyhookApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      from: config.easyhookFrom,
      to,
      body: body.slice(0, 3500),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Easyhook send failed: ${res.status} ${text}`);
  }
}

function extractMessage(event) {
  const candidates = [
    event?.message,
    event?.data?.message,
    event?.entry?.[0]?.changes?.[0]?.value?.messages?.[0],
    event,
  ].filter(Boolean);

  for (const msg of candidates) {
    const from = msg.from || msg.sender || msg.contact?.wa_id;
    const text = msg.text?.body || msg.text || msg.body || msg.message?.text?.body;
    if (from && text) return { from, text: String(text) };
  }

  return { from: "", text: "" };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function stripAnsi(value) {
  return value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "")
    .replace(/\r/g, "");
}

function hasCommand(name) {
  const result = spawnSync("command", ["-v", name], { shell: true, stdio: "ignore" });
  return result.status === 0;
}

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("body_too_large"));
      }
    });
    req.on("end", () => resolve(body || "{}"));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function loadDotEnv() {
  const files = [
    path.join(process.env.HOME || "", ".config", "codex-whatsapp", ".env"),
    path.join(process.cwd(), ".env"),
  ];

  for (const file of files) {
    if (!file || !fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
