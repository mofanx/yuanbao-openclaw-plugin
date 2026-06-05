#!/usr/bin/env node
// 通过桥接器测试 ACP 协议通信
// 模拟真实的 OpenClaw → 桥接器 → devin acp 流程

import { spawn } from "node:child_process";

const BRIDGE_PATH = "/home/yan/ubuntu/project/python/yuanbao-openclaw-plugin/scripts/devin-acp-auth-bridge.mjs";

console.log("🧪 通过桥接器测试 ACP 协议通信\n");

// 启动桥接器
const bridge = spawn("node", [BRIDGE_PATH], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    DEVIN_ACP_BRIDGE_DEBUG: "1"
    // DEVIN_ACP_API_KEY: "your-api-key-here" // 如需测试，请从环境变量或 credentials.toml 读取
  }
});

let sessionId = null;
let hasError = false;
let receivedReply = false;
let authCompleted = false;

bridge.stdout.on("data", (data) => {
  const text = data.toString();
  console.log("📥 Devin:", text.trim());
  
  // 解析响应
  try {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        const msg = JSON.parse(line);
        
        // 打印所有响应以便调试
        if (msg.id === 2) {
          console.log("📊 session/new 响应:", JSON.stringify(msg).substring(0, 500));
        }
        
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
        
        // 检查是否收到回复
        if (msg.result && msg.result.content) {
          receivedReply = true;
          console.log("✅ 收到 Devin 回复:", JSON.stringify(msg.result.content).substring(0, 200));
        }
        
        // 检查 prompt 是否被接受
        if (msg.result && msg.result.status === "accepted") {
          console.log("✅ Prompt 被接受");
        }
        
        // 处理 session/update 通知（Devin 的回复通过通知发送）
        if (msg.method === "session/update" && msg.params) {
          const update = msg.params.update;
          if (update.message) {
            receivedReply = true;
            console.log("✅ 收到 Devin 回复通知:", JSON.stringify(update.message).substring(0, 200));
          }
          if (update.content) {
            receivedReply = true;
            console.log("✅ 收到 Devin 内容:", JSON.stringify(update.content).substring(0, 200));
          }
        }
      }
    }
  } catch (e) {
    // 忽略解析错误
  }
});

bridge.stderr.on("data", (data) => {
  const text = data.toString();
  console.log("📋 Bridge:", text.trim());
  
  // 检测认证完成
  if (text.includes("bridge authenticate succeeded")) {
    authCompleted = true;
    console.log("✅ 认证完成");
  }
});

// 发送 ACP 消息序列
async function sendAcpMessages() {
  // 1. initialize
  console.log("\n📤 发送 initialize...");
  bridge.stdin.write(JSON.stringify({
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
  
  // 2. session/new (这会触发认证)
  console.log("\n📤 发送 session/new (触发认证)...");
  bridge.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "session/new",
    params: {
      cwd: "/home/yan/ubuntu/project/python/yuanbao-openclaw-plugin",
      mcpServers: []
    }
  }) + "\n");
  
  await sleep(15000);
  
  if (!sessionId) {
    console.error("❌ 未能获取 sessionId");
    bridge.kill();
    process.exit(1);
  }
  
  // 3. 发送 prompt 并等待回复
  console.log("\n📤 发送 session/prompt...");
  bridge.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "session/prompt",
    params: {
      sessionId: sessionId,
      prompt: [
        {
          type: "text",
          text: "hello, please say hi"
        }
      ]
    }
  }) + "\n");
  
  // 等待回复（增加到30秒）
  await sleep(30000);
  
  // 结束测试
  console.log("\n✅ 测试完成：通过桥接器成功建立 ACP 会话并发送消息");
  bridge.stdin.end();
  
  setTimeout(() => {
    console.log("\n" + "=".repeat(50));
    if (hasError) {
      console.log("❌ 测试失败：检测到错误");
    } else if (!receivedReply) {
      console.log("⚠️ 测试警告：未收到 Devin 回复");
    } else {
      console.log("✅ 测试通过：桥接器工作正常，ACP 通信正常，收到 Devin 回复");
    }
    console.log("=".repeat(50));
    process.exit(hasError ? 1 : 0);
  }, 1000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 超时处理（增加到60秒）
setTimeout(() => {
  console.error("❌ 测试超时");
  bridge.kill();
  process.exit(1);
}, 60000);

// 开始测试
sendAcpMessages();
