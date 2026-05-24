#!/usr/bin/env node
// =============================================================================
// verify-devin-acp.mjs
//
// 验证本机 `devin acp` 是否可被 acpx 风格的 ACP 客户端正确驱动。
// 复制 acpx 对一个 ACP harness 的最小启动序列：
//   1. spawn `devin acp` 子进程
//   2. 发送 JSON-RPC `initialize` 请求
//   3. 校验返回字段
//   4. 关闭子进程，打印结论
//
// 用法:
//   node scripts/verify-devin-acp.mjs            # 默认 5s 超时
//   DEVIN_BIN=/path/to/devin node scripts/verify-devin-acp.mjs
//   VERIFY_TIMEOUT_MS=10000 node scripts/verify-devin-acp.mjs
// =============================================================================

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const DEVIN_BIN = process.env.DEVIN_BIN || "devin";
const TIMEOUT_MS = Number.parseInt(process.env.VERIFY_TIMEOUT_MS ?? "8000", 10);

const COLOR = process.stdout.isTTY ? {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
} : { red: (s) => s, green: (s) => s, yellow: (s) => s, dim: (s) => s };

function fail(msg, extra) {
  console.error(`${COLOR.red("[FAIL]")} ${msg}`);
  if (extra) console.error(COLOR.dim(extra));
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`${COLOR.green("[ OK ]")} ${msg}`);
}

function info(msg) {
  console.log(`${COLOR.yellow("[INFO]")} ${msg}`);
}

async function main() {
  info(`Spawning: ${DEVIN_BIN} acp  (timeout ${TIMEOUT_MS}ms)`);

  let child;
  try {
    child = spawn(DEVIN_BIN, ["acp"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
  } catch (err) {
    fail(`failed to spawn '${DEVIN_BIN}': ${err.message}`,
      "Ensure Devin CLI is installed: curl -fsSL https://cli.devin.ai/install.sh | bash");
    return;
  }

  let stderrBuf = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderrBuf += chunk; });

  let stdoutBuf = "";
  child.stdout.setEncoding("utf8");
  let resolveFrame;
  let framePromise = new Promise((r) => { resolveFrame = r; });
  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk;
    // ACP uses JSON-RPC over stdio, line-delimited
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        resolveFrame(msg);
        framePromise = new Promise((r) => { resolveFrame = r; });
      } catch {
        // non-JSON line (Devin emits tracing logs on stderr, but be defensive)
      }
    }
  });

  const exitPromise = new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });

  // Send initialize request — matches what zed/acpx clients send.
  const req = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    },
  };
  info(`>> initialize  (protocolVersion=1)`);
  child.stdin.write(JSON.stringify(req) + "\n");

  let response;
  try {
    response = await Promise.race([
      framePromise,
      delay(TIMEOUT_MS).then(() => { throw new Error(`timeout after ${TIMEOUT_MS}ms`); }),
    ]);
  } catch (err) {
    fail(`no JSON-RPC response: ${err.message}`,
      stderrBuf ? `stderr tail:\n${stderrBuf.slice(-800)}` : undefined);
    child.kill("SIGTERM");
    await exitPromise.catch(() => {});
    return;
  }

  info(`<< ${JSON.stringify(response).slice(0, 400)}${JSON.stringify(response).length > 400 ? "..." : ""}`);

  // Validations
  let allOk = true;
  if (response.jsonrpc !== "2.0" || response.id !== 1) {
    fail(`unexpected JSON-RPC envelope: ${JSON.stringify({ jsonrpc: response.jsonrpc, id: response.id })}`);
    allOk = false;
  }
  if (response.error) {
    fail(`initialize returned error: ${JSON.stringify(response.error)}`);
    allOk = false;
  }
  const result = response.result;
  if (!result) {
    fail(`initialize response missing 'result'`);
    allOk = false;
  } else {
    if (result.protocolVersion !== 1) {
      fail(`protocolVersion mismatch: got ${result.protocolVersion}, expected 1`);
      allOk = false;
    } else {
      ok(`protocolVersion = 1`);
    }
    if (!result.agentCapabilities) {
      fail(`missing agentCapabilities`);
      allOk = false;
    } else {
      ok(`agentCapabilities: ${Object.keys(result.agentCapabilities).join(", ")}`);
    }
    if (!Array.isArray(result.authMethods) || result.authMethods.length === 0) {
      fail(`authMethods missing — devin not authenticated? run 'devin auth status'`);
      allOk = false;
    } else {
      ok(`authMethods: ${result.authMethods.map((m) => m.id).join(", ")}`);
    }
    if (result.agentInfo?.name) {
      ok(`agentInfo: ${result.agentInfo.name} (${result.agentInfo.version || "unknown"})`);
    }
  }

  // Tear down
  child.stdin.end();
  child.kill("SIGTERM");
  await Promise.race([exitPromise, delay(2000)]).catch(() => {});
  if (!child.killed) child.kill("SIGKILL");

  if (allOk) {
    console.log("");
    console.log(COLOR.green("✓ devin acp 验证通过——可以在 OpenClaw acpx 配置里把 devin 注册为 agent alias。"));
    console.log(COLOR.dim("  下一步：参考 docs/devin-integration.md §3 写入 OpenClaw 配置。"));
  } else {
    console.log("");
    console.log(COLOR.red("✗ 验证未通过。请排查上述失败项后再配置 OpenClaw。"));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  fail(`unexpected: ${err?.stack || err}`);
});
