#!/usr/bin/env node
// 直接测试 ACP 协议通信
// 绕过元宝，直接发送 ACP JSON-RPC 消息给 devin acp

import { spawn } from "node:child_process";

console.log("🧪 直接测试 ACP 协议通信\n");

// 直接启动 devin acp，发送 ACP 消息
const devinAcp = spawn("devin", ["acp"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env
  }
});

let sessionId = null;
let hasError = false;

devinAcp.stdout.on("data", (data) => {
  const text = data.toString();
  console.log("📥 Devin:", text.trim());
  
  // 解析响应
  try {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const msg = JSON.parse(line);
        
        // 提取 sessionId
        if (msg.result && msg.result.sessionId) {
          sessionId = msg.result.sessionId;
          console.log("✅ 获取到 sessionId:", sessionId);
        }
        
        // 检查错误
        if (msg.error) {
          hasError = true;
          console.error("❌ 错误:", msg.error.message);
          
          if (msg.error.message.includes("Windsurf version")) {
            console.error("   -> Windsurf 版本错误");
          }
          if (msg.error.message.includes("Permission denied")) {
            console.error("   -> 权限错误");
          }
        }
        
        // 检查认证方法
        if (msg.result && msg.result.authMethods) {
          console.log("✅ 支持的认证方法:", msg.result.authMethods.map(m => m.id).join(", "));
        }
      }
    }
  } catch (e) {
    // 忽略解析错误
  }
});

devinAcp.stderr.on("data", (data) => {
  const text = data.toString();
  console.log("📋 stderr:", text.trim());
});

// 发送 ACP 消息序列
async function sendAcpMessages() {
  // 1. initialize
  console.log("\n📤 发送 initialize...");
  devinAcp.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true
      }
    }
  }) + "\n");
  
  await sleep(2000);
  
  // 2. session/new
  console.log("\n📤 发送 session/new...");
  devinAcp.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "session/new",
    params: {
      cwd: "/home/yan/ubuntu/project/python/yuanbao-openclaw-plugin",
      mcpServers: []
    }
  }) + "\n");
  
  await sleep(5000);
  
  if (!sessionId) {
    console.error("❌ 未能获取 sessionId");
    devinAcp.kill();
    process.exit(1);
  }
  
  // 结束测试
  console.log("\n✅ 测试完成：成功建立 ACP 会话");
  devinAcp.stdin.end();
  
  setTimeout(() => {
    console.log("\n" + "=".repeat(50));
    if (hasError) {
      console.log("❌ 测试失败：检测到错误");
    } else {
      console.log("✅ 测试通过：ACP 通信正常，会话建立成功");
    }
    console.log("=".repeat(50));
    process.exit(hasError ? 1 : 0);
  }, 1000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 超时处理
setTimeout(() => {
  console.error("❌ 测试超时");
  devinAcp.kill();
  process.exit(1);
}, 20000);

// 开始测试
sendAcpMessages();
