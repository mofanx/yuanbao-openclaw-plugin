#!/usr/bin/env node
// =============================================================================
// devin-acp-auth-bridge.mjs
//
// 一个透明的 ACP(stdio) 认证桥接器，夹在 OpenClaw acpx 与 `devin acp` 之间。
//
// 为什么需要它：
//   Devin CLI（2026.5.x ACP 模式）启用了严格的凭据策略——**故意不使用本地
//   `devin auth login` 的凭据**，要求 ACP host 调用 `authenticate`，且只接受：
//     1) authenticate 带 `_meta.api_key`（非交互，无需浏览器）；或
//     2) PKCE 浏览器流程（网关 systemd 服务无 DISPLAY，无法完成）。
//   而 acpx 调 authenticate 时只发 `{ methodId }`，从不带 `_meta.api_key`，于是
//   要么跳过认证、要么触发无法完成的 PKCE，导致 Devin 服务端在 prompt 时返回
//   `Permission denied: ... an internal error occurred (trace ID: ...)`。
//
// 本桥接器的做法：
//   - spawn `devin acp` 子进程，并在 acpx <-> devin 之间逐行转发 JSON-RPC；
//   - 抓取 `initialize` 响应里的 authMethods，拿到 method id（如 windsurf-api-key）；
//   - 在第一条 `session/new` / `session/load` 之前，主动用 `_meta.api_key` 完成
//     一次非交互认证（API key 默认从 ~/.local/share/devin/credentials.toml 读取）；
//   - 若 acpx 自己发了 authenticate，则把 `_meta.api_key` 注入进去再转发；
//   - 在 `session/new` 成功后，自动设置模型（通过 `session/set_config_option`）；
//   - 其余所有消息（通知、权限请求、prompt、取消等）原样透传。
//
// 配置用法（OpenClaw acpx alias）：
//   plugins.entries.acpx.config.agents.devin = {
//     command: "node",
//     args: ["/abs/path/to/scripts/devin-acp-auth-bridge.mjs"]
//   }
//
// API key 来源（按优先级）：
//   1. 环境变量 DEVIN_ACP_API_KEY
//   2. 环境变量 WINDSURF_API_KEY
//   3. credentials.toml 的 windsurf_api_key
//      路径解析：$DEVIN_CREDENTIALS_PATH
//             或 $XDG_DATA_HOME/devin/credentials.toml
//             或 ~/.local/share/devin/credentials.toml
//
// 其它环境变量：
//   DEVIN_BIN           devin 可执行文件路径（默认 "devin"）
//   DEVIN_ACP_BRIDGE_DEBUG=1   打印调试日志到 stderr
//   DEVIN_ACP_AUTH_RETRIES     认证失败（如 team settings 3s 超时）时的重试次数（默认 6）
//   DEVIN_ACP_AUTH_RETRY_MS    每次重试之间的退避毫秒（默认 1500）
//   DEVIN_MODEL         指定 Devin 使用的模型（如 "swe-1-6"）
// =============================================================================

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEVIN_BIN = process.env.DEVIN_BIN || "devin";
const DEBUG = process.env.DEVIN_ACP_BRIDGE_DEBUG === "1";
const AUTH_RETRIES = Number.parseInt(process.env.DEVIN_ACP_AUTH_RETRIES ?? "6", 10);
const AUTH_RETRY_MS = Number.parseInt(process.env.DEVIN_ACP_AUTH_RETRY_MS ?? "1500", 10);

function resolveModel() {
  // File written by /model command takes precedence over env var
  const modelFile = path.join(homedir(), ".config", "devin", "acp-model.json");
  if (existsSync(modelFile)) {
    try {
      const data = JSON.parse(readFileSync(modelFile, "utf8"));
      if (data.model) {
        logDebug(`using model from ${modelFile}: ${data.model}`);
        return data.model;
      }
    } catch (err) {
      logWarn(`failed to read model file ${modelFile}: ${err?.message || err}`);
    }
  }
  return process.env.DEVIN_MODEL || null;
}

const DEVIN_MODEL = resolveModel();
// 桥接器为自己发起的 authenticate 预留一个不会与 acpx 数字 id 冲突的字符串 id
const BRIDGE_AUTH_ID = "__devin_acp_bridge_authenticate__";
// 桥接器为自己发起的 set_config_option 预留一个不会与 acpx 数字 id 冲突的字符串 id
const SET_MODEL_ID = "__devin_acp_bridge_set_model__";

function logDebug(...args) {
  if (DEBUG) process.stderr.write(`[devin-acp-bridge] ${args.join(" ")}\n`);
}
function logWarn(...args) {
  process.stderr.write(`[devin-acp-bridge] WARN ${args.join(" ")}\n`);
}

function resolveCredentialsPath() {
  if (process.env.DEVIN_CREDENTIALS_PATH) return process.env.DEVIN_CREDENTIALS_PATH;
  const dataHome = process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share");
  return path.join(dataHome, "devin", "credentials.toml");
}

function loadApiKey() {
  // 按照文档优先级：1. DEVIN_ACP_API_KEY > 2. WINDSURF_API_KEY > 3. credentials.toml
  const devinKey = process.env.DEVIN_ACP_API_KEY;
  if (devinKey && devinKey.trim()) {
    logDebug("using API key from DEVIN_ACP_API_KEY environment variable");
    return devinKey.trim();
  }
  
  const windsurfKey = process.env.WINDSURF_API_KEY;
  if (windsurfKey && windsurfKey.trim()) {
    logDebug("using API key from WINDSURF_API_KEY environment variable");
    return windsurfKey.trim();
  }
  
  // 回退到 credentials.toml
  const credPath = resolveCredentialsPath();
  try {
    const toml = readFileSync(credPath, "utf8");
    // 简易解析：windsurf_api_key = "..."（避免引入 TOML 依赖）
    const m = toml.match(/^\s*windsurf_api_key\s*=\s*"([^"]+)"\s*$/m);
    if (m && m[1]) {
      logDebug(`using API key from ${credPath}`);
      return m[1];
    }
    logWarn(`credentials file ${credPath} has no windsurf_api_key`);
  } catch (err) {
    logWarn(`cannot read credentials file ${credPath}: ${err?.message || err}`);
  }
  
  return undefined;
}

const API_KEY = loadApiKey();
if (!API_KEY) {
  logWarn(
    "no Devin API key found — authentication will fall back to PKCE (likely fails headlessly). " +
      "Run `devin auth login` or set DEVIN_ACP_API_KEY.",
  );
}

// 直接传递所有环境变量，确保 WINDSURF_API_KEY 能被 devin acp 子进程继承
const child = spawn(DEVIN_BIN, ["acp"], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
child.on("error", (err) => {
  logWarn(`failed to spawn '${DEVIN_BIN} acp': ${err?.message || err}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  logDebug(`devin acp exited code=${code} signal=${signal}`);
  process.exit(typeof code === "number" ? code : 0);
});

// ---- 状态机 ----
let authMethodId; // 从 initialize 响应里学习
let authState = "idle"; // idle | in-progress | done | unavailable
let authAttempt = 0; // 已尝试的认证次数
let authRetryTimer; // 重试定时器
const queuedToDevin = []; // 认证完成前被暂存的 client->devin 消息（如 session/new）

// ---- 行缓冲：acpx(process.stdin) -> devin(child.stdin) ----
let upBuf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  upBuf += chunk;
  const lines = upBuf.split("\n");
  upBuf = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim()) handleClientLine(line);
  }
});
process.stdin.on("end", () => {
  try { child.stdin.end(); } catch {}
});

// ---- 行缓冲：devin(child.stdout) -> acpx(process.stdout) ----
let downBuf = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  downBuf += chunk;
  const lines = downBuf.split("\n");
  downBuf = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim()) handleAgentLine(line);
  }
});

function sendToDevin(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}
function sendToClient(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}
function rawToDevin(line) {
  child.stdin.write(line + "\n");
}
function rawToClient(line) {
  process.stdout.write(line + "\n");
}

function injectApiKeyMeta(params) {
  const p = params && typeof params === "object" ? { ...params } : {};
  p._meta = { ...(p._meta || {}), api_key: API_KEY };
  return p;
}

function beginBridgeAuth() {
  if (authState !== "idle") return;
  if (!API_KEY || !authMethodId) {
    authState = "unavailable";
    flushQueue();
    return;
  }
  authState = "in-progress";
  sendBridgeAuth();
}

function sendBridgeAuth() {
  authAttempt += 1;
  logDebug(
    `authenticating via _meta.api_key (methodId=${authMethodId}) attempt ${authAttempt}/${AUTH_RETRIES + 1}`,
  );
  sendToDevin({
    jsonrpc: "2.0",
    id: BRIDGE_AUTH_ID,
    method: "authenticate",
    params: { methodId: authMethodId, _meta: { api_key: API_KEY } },
  });
}

// team settings 刷新 3s 超时之类是瞬时网络问题，值得重试
function isRetryableAuthError(error) {
  const msg = (error?.message || "").toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("team settings") ||
    error?.code === -32603
  );
}

function flushQueue() {
  while (queuedToDevin.length) {
    rawToDevin(queuedToDevin.shift());
  }
}

// 处理来自 acpx 的一行
function handleClientLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { rawToDevin(line); return; }

  const method = msg?.method;

  // acpx 自己发起 authenticate：注入 _meta.api_key 再转发
  if (method === "authenticate") {
    logDebug("client authenticate -> injecting _meta.api_key");
    if (API_KEY) msg.params = injectApiKeyMeta(msg.params);
    if (authState === "idle") authState = "in-progress";
    sendToDevin(msg);
    return;
  }

  // 在认证完成前拦截会真正用到凭据的请求，先确保认证
  if (method === "session/new" || method === "session/load" || method === "session/prompt") {
    if (authState === "done" || authState === "unavailable") {
      rawToDevin(line);
      return;
    }
    logDebug(`queueing ${method} until authentication completes`);
    queuedToDevin.push(line);
    beginBridgeAuth();
    return;
  }

  rawToDevin(line);
}

// 处理来自 devin 的一行
function handleAgentLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { rawToClient(line); return; }

  // 桥接器自己发起的 authenticate 的响应：消费掉，不转发给 acpx
  if (msg?.id === BRIDGE_AUTH_ID) {
    if (msg.error) {
      if (authAttempt <= AUTH_RETRIES && isRetryableAuthError(msg.error)) {
        logWarn(
          `bridge authenticate failed (attempt ${authAttempt}), retrying in ${AUTH_RETRY_MS}ms: ${JSON.stringify(msg.error)}`,
        );
        authRetryTimer = setTimeout(sendBridgeAuth, AUTH_RETRY_MS);
        return; // 保持 in-progress，排队消息继续等待
      }
      logWarn(`bridge authenticate failed permanently: ${JSON.stringify(msg.error)}`);
      authState = "unavailable"; // 让排队消息继续，由 devin 自然报错，便于诊断
    } else {
      logDebug(`bridge authenticate succeeded (attempt ${authAttempt})`);
      authState = "done";
    }
    flushQueue();
    return;
  }

  // 抓取 initialize 响应里的 authMethods
  if (msg?.result && Array.isArray(msg.result.authMethods)) {
    const methods = msg.result.authMethods;
    if (methods.length > 0 && !authMethodId) {
      authMethodId = methods[0].id;
      logDebug(`learned authMethodId=${authMethodId}`);
    }
  }

  // 处理 session/new 响应，自动设置模型
  if (msg?.result && msg?.result?.sessionId && DEVIN_MODEL && msg?.id && !msg?.id.toString().startsWith("__")) {
    logDebug(`session/new succeeded, setting model to ${DEVIN_MODEL}`);
    // 发送 session/set_config_option 来设置模型
    sendToDevin({
      jsonrpc: "2.0",
      id: SET_MODEL_ID,
      method: "session/set_config_option",
      params: {
        sessionId: msg.result.sessionId,
        configId: "model",
        value: DEVIN_MODEL
      }
    });
  }

  // 消费掉桥接器自己发起的 set_config_option 的响应
  if (msg?.id === SET_MODEL_ID) {
    if (msg.error) {
      logWarn(`failed to set model: ${JSON.stringify(msg.error)}`);
    } else {
      logDebug(`model set to ${DEVIN_MODEL} successfully`);
    }
    return;
  }

  rawToClient(line);
}

const shutdown = () => { try { clearTimeout(authRetryTimer); } catch {} try { child.kill("SIGTERM"); } catch {} };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
