# Ubuntu 下使用元宝连接 Devin 手把手教程

本教程将指导你在 Ubuntu 系统上完成腾讯元宝与 Devin CLI 的完整集成配置。

---

## 目录

1. [环境准备](#1-环境准备)
2. [安装 OpenClaw](#2-安装-openclaw)
3. [安装 Devin CLI](#3-安装-devin-cli)
4. [安装元宝插件](#4-安装元宝插件)
5. [配置 OpenClaw](#5-配置-openclaw)
6. [启动与验证](#6-启动与验证)
7. [使用元宝对话 Devin](#7-使用元宝对话-devin)
8. [常见问题排查](#8-常见问题排查)

---

## 1. 环境准备

### 1.1 系统要求

- Ubuntu 20.04 LTS 或更高版本
- Node.js >= 22.19.0 （OpenClaw 要求）
- Python 3.8+ （Devin CLI 可能需要）

### 1.2 安装基础依赖

```bash
# 更新系统包
sudo apt update && sudo apt upgrade -y

# 安装 Node.js（如果未安装）
# OpenClaw 要求 Node.js >= 22.19.0
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version  # 应显示 v22.19.0 或更高
npm --version   # 应显示 10.x.x 或更高
```

### 1.3 安装 mamba（可选，用于 Python 环境管理）

如果你使用 mamba 管理 Python 环境：

```bash
# 安装 micromamba
wget -qO- https://micro.mamba.pm/install.sh | bash

# 重启终端或执行
source ~/.bashrc  # 或 ~/.zshrc
```

---

## 2. 安装 OpenClaw

### 2.1 使用 npm 全局安装

```bash
npm install -g openclaw@latest
```

**注意**：如果你使用 Devin 作为 ACP agent，**不需要**运行 `openclaw onboard --install-daemon`，因为：
- OpenClaw 只作为消息路由器，不需要配置自己的 AI API 密钥
- 实际的 AI 处理由 Devin CLI 完成
- Devin 使用自己的认证（`devin auth login`）

如果以后需要 OpenClaw 的原生 AI 功能，可以再运行 onboarding 向导。

### 2.2 验证安装

```bash
openclaw --version
# 应显示版本号，例如：openclaw/2026.6.1
```

**注意**：如果提示 Node.js 版本不满足要求，请切换到新安装的版本：

```bash
nvm use 22.22.3
nvm alias default 22.22.3
```

### 2.3 安装并启动 Gateway

```bash
# 安装 Gateway 服务
openclaw gateway install

# 启动 Gateway
openclaw gateway start
```

验证 Gateway 运行状态：

```bash
openclaw gateway status
# 应显示 "Runtime: running"
```

---

## 3. 安装 Devin CLI

### 3.1 安装 Devin CLI

```bash
# 使用官方安装脚本（推荐）
curl -fsSL https://cli.devin.ai/install.sh | bash
```

### 3.2 验证安装

```bash
devin --version
# 应显示 Devin CLI 版本号
```

### 3.3 登录 Devin

**有桌面 / 可交互终端（推荐）**：

```bash
devin auth login
devin auth status   # 应显示 "Logged in (via Devin)"
```

**无桌面 / SSH 远程 / 纯服务端（仅 Devin CLI，无 Devin Desktop）**：

```bash
# --force-manual-token-flow：跳过浏览器，改为手动粘贴 token
devin auth login --force-manual-token-flow
```

执行后会打印一个 URL，在**另一台设备的浏览器**（手机/电脑）打开 → 完成登录 → 复制显示的 token → 粘贴回终端。完成后凭据写入 `~/.local/share/devin/credentials.toml`，后续桥接器自动读取，无需任何额外配置。

**CI / 自动化（无任何交互）**：

```bash
# 方式：从已登录机器导出 key，注入到网关服务环境
DEVIN_KEY=$(sed -n 's/windsurf_api_key *= *"\(.*\)"/\1/p' \
  ~/.local/share/devin/credentials.toml)
mkdir -p ~/.config/systemd/user/openclaw-gateway.service.d/
cat > ~/.config/systemd/user/openclaw-gateway.service.d/devin-api-key.conf << EOF
[Service]
Environment=DEVIN_ACP_API_KEY=${DEVIN_KEY}
EOF
systemctl --user daemon-reload
```

### 3.4 验证 ACP 支持

```bash
devin acp --help
# 应显示 "Run as an ACP ... server over stdio" 相关信息
```

---

## 4. 安装元宝插件

### 4.1 克隆本仓库

```bash
cd ~
git clone https://github.com/mofanx/yuanbao-openclaw-plugin.git
cd yuanbao-openclaw-plugin
```

### 4.2 安装依赖

```bash
# 使用 mamba 激活 base 环境（如果使用 mamba）
mamba activate base

# 清理之前的安装（如果有）
rm -rf node_modules package-lock.json

# 使用 pnpm 安装（项目推荐）
pnpm install
```

### 4.3 构建插件

```bash
pnpm run build
```

### 4.4 安装插件到 OpenClaw

```bash
# 方式1：使用本地路径安装
openclaw plugins install /home/yan/ubuntu/project/python/yuanbao-openclaw-plugin

# 方式2：如果已发布到 npm，使用 npm 安装
# openclaw plugins install @openclaw/plugin-yuanbao
```

### 4.5 重启 Gateway 加载插件

```bash
openclaw gateway restart
```

### 4.6 验证插件安装

```bash
openclaw plugins list
# 应看到 "openclaw-plugin-yuanbao" 在列表中
```

---

## 5. 配置 OpenClaw

### 5.1 安装 acpx 插件

```bash
openclaw plugins install @openclaw/acpx
openclaw gateway restart
openclaw config set plugins.entries.acpx.enabled true
openclaw gateway restart
```

### 5.2 获取元宝凭证

1. 打开腾讯元宝 APP
2. 进入应用设置
3. 创建机器人，获取 `appKey` 和 `appSecret`

### 5.3 安装认证桥接器

> **重要**：Devin CLI 2026.5.x ACP 模式故意不使用本地 `devin auth login` 凭据，必须通过
> 认证桥接脚本 `devin-acp-auth-bridge.mjs` 中转认证，否则元宝里会报
> `Permission denied: an internal error occurred`。

```bash
# 确认桥接脚本存在（本仓库自带）
REPO_DIR="$(pwd)"   # 或替换为仓库实际路径
ls "$REPO_DIR/scripts/devin-acp-auth-bridge.mjs"
```

### 5.4 配置 ACP 和 acpx（使用桥接器）

```bash
BRIDGE="$REPO_DIR/scripts/devin-acp-auth-bridge.mjs"

# 配置 ACP 调度
openclaw config set acp.enabled true
openclaw config set acp.dispatch.enabled true
openclaw config set acp.backend "acpx"
openclaw config set acp.defaultAgent "devin"
openclaw config set acp.allowedAgents '["devin"]'
openclaw config set acp.maxConcurrentSessions 4
openclaw config set acp.runtime.ttlMinutes 120

# 配置 acpx 插件（关键：command 指向桥接器，不要直接用 "devin"）
openclaw config set plugins.entries.acpx.config.permissionMode "approve-all"
openclaw config set plugins.entries.acpx.config.nonInteractivePermissions "deny"
openclaw config set plugins.entries.acpx.config.probeAgent "devin"
openclaw config set plugins.entries.acpx.config.agents.devin.command "node"
openclaw config set plugins.entries.acpx.config.agents.devin.args "[\"$BRIDGE\"]"
# 增加超时时间到 600 秒（10分钟），避免复杂任务超时
openclaw config set plugins.entries.acpx.config.timeoutSeconds 600

# 配置默认 agent
openclaw config set agents.defaults.workspace "~/.openclaw/workspace-devin"
openclaw config patch --stdin << 'EOF'
{
  "agents": {
    "list": [
      {
        "id": "main",
        "default": true,
        "workspace": "~/.openclaw/workspace-devin",
        "runtime": {
          "type": "acp",
          "acp": {
            "agent": "devin",
            "backend": "acpx",
            "mode": "persistent",
            "cwd": "~/.openclaw/workspace-devin"
          }
        }
      }
    ]
  }
}
EOF

# 配置 ACP 流式输出聚合时间（优化流式体验）
openclaw config set acp.stream.coalesceIdleMs 300

# 配置 Devin ACP 模式默认模型（可选，也可用 /model 命令在聊天中实时切换）
# devin acp 命令默认不读取 ~/.config/devin/config.json 中的模型配置
# 可通过环境变量 DEVIN_MODEL 设置默认模型，或在聊天中发送 /model swe-1-7
# 常用模型：swe-1-6 / swe-1-7（免费）、claude-sonnet-4-20250514（付费）
sed -i '/Environment=DEVIN_ACP_BRIDGE_DEBUG=1/a Environment=DEVIN_MODEL=swe-1-6' ~/.config/systemd/user/openclaw-gateway.service
systemctl --user daemon-reload
```

### 5.5 配置元宝通道

```bash
# 设置元宝凭证
openclaw config set channels.yuanbao.appKey "YOUR_YUANBAO_APP_KEY"
openclaw config set channels.yuanbao.appSecret "YOUR_YUANBAO_APP_SECRET"

# 配置元宝通道参数
openclaw config patch --stdin << 'EOF'
{
  "channels": {
    "yuanbao": {
      "dm": { "policy": "open" },
      "requireMention": true,
      "outboundQueueStrategy": "merge-text",
      "idleMs": 5000
    }
  }
}
EOF
```

**重要**：请务必替换 `YOUR_YUANBAO_APP_KEY` 和 `YOUR_YUANBAO_APP_SECRET` 为你自己的凭证。

### 5.6 创建工作目录

```bash
mkdir -p ~/.openclaw/workspace-devin
```

### 5.7 配置通道绑定

```bash
# 将元宝通道绑定到 main agent（使用 ACP/Devin）
openclaw config patch --stdin << 'EOF'
{
  "bindings": [
    { "agentId": "main", "match": { "channel": "yuanbao" } }
  ]
}
EOF
```

### 5.8 重启 Gateway 应用配置

```bash
openclaw gateway restart
```

---

## 6. 启动与验证

### 6.1 检查网关状态

```bash
openclaw gateway status
# 应显示 "running" 状态
```

### 6.2 验证 ACP 配置

```bash
openclaw doctor
```

**预期输出**：
- Plugins: acpx 在已加载列表中
- 无错误报告

如果 doctor 报告错误，请参考 [常见问题排查](#8-常见问题排查)。

### 6.3 验证元宝通道

```bash
openclaw channels list --all
# 应看到 "Yuanbao default: installed, configured, enabled"
```

### 6.4 查看日志（可选）

```bash
openclaw logs --follow
```

---

## 7. 使用元宝对话 Devin

### 7.1 启动 ACP 会话

首次使用时，需要在元宝中手动启动 ACP 会话：

```
/acp spawn devin --mode persistent --bind here
```

**说明**：
- `devin` 是 ACP harness 别名（在 acpx 配置中定义）
- `--mode persistent` 持久模式，会话会保持
- `--bind here` 绑定到当前对话

成功后会显示类似：
```
✅ Spawned ACP session agent:devin:acp:xxx (persistent, backend acpx). Bound this conversation to agent:devin:acp:xxx.
```

**重要提示 - Gateway 重启后恢复**：
由于 `persistent` 模式的 ACP 进程会在 Gateway 重启时被终止，重启后需要重新执行：
```
/acp spawn devin --mode persistent --bind here
```

如果遇到 `ACP_TURN_FAILED` 错误，可以先取消再重新创建：
```
/acp cancel
/acp spawn devin --mode persistent --bind here
```

### 7.2 私聊方式

1. 在元宝 APP 中找到你的机器人
2. 发送 `/acp spawn devin --mode persistent --bind here` 启动 ACP 会话
3. 发送消息给机器人
4. 机器人会通过 Devin CLI 处理你的请求并返回回复

**关于流式输出**：
- 元宝插件支持流式输出，但实际效果取决于 Devin CLI ACP 模式的实现
- 当前配置已优化流式参数（`acp.stream.coalesceIdleMs: 300`）
- 如果看不到流式效果，这是因为 Devin CLI ACP 模式可能默认不发送流式事件

### 7.3 群聊方式

1. 将机器人添加到群聊
2. 使用 `@机器人` 提及机器人
3. 机器人会响应你的消息

### 7.4 可用命令

在元宝中可以使用以下命令：

**基础命令**：
- `/help` - 显示可用命令
- `/status` - 显示机器人状态
- `/new` - 开始新会话
- `/stop` - 停止当前运行
- `/restart` - 重启 OpenClaw
- `/compact` - 压缩会话上下文

**ACP 命令**：
- `/acp spawn devin --mode persistent --bind here` - 启动 ACP 会话
- `/acp status` - 查看 ACP 状态
- `/acp cancel` - 取消当前 ACP 任务
- `/acp sessions` - 列出所有 ACP 会话
- `/acp close <session-id>` - 关闭指定 ACP 会话

---

## 8. 常见问题排查

### 8.1 `openclaw doctor` 报 "Harness command not found"

**原因**：`devin` 命令不在 PATH 中

**解决**：
```bash
# 检查 devin 是否在 PATH 中
which devin

# 如果没有输出，检查 npm 全局安装路径
npm config get prefix
# 将该路径的 bin 目录添加到 PATH
export PATH="$PATH:$(npm config get prefix)/bin"

# 永久添加到 ~/.bashrc 或 ~/.zshrc
echo 'export PATH="$PATH:$(npm config get prefix)/bin"' >> ~/.bashrc
source ~/.bashrc
```

### 8.2 Gateway 重启后 ACP 会话失效

**原因**：`persistent` 模式的 ACP 进程会在 Gateway 重启时被终止，旧的会话绑定失效。

**解决**：
```bash
# 在元宝中重新执行
/acp spawn devin --mode persistent --bind here
```

如果遇到错误，可以先取消再重新创建：
```bash
/acp cancel
/acp spawn devin --mode persistent --bind here
```

**说明**：
- 会话历史不会丢失，存储在 `~/.openclaw/agents/main/sessions/`
- 只需要重新创建 ACP 进程会话，对话记录会保留
- 这是 `persistent` 模式的正常行为，不是配置错误

### 8.3 ACP 模式使用的模型不正确

**问题**：在元宝中收到"当日限额已使用完毕"的提示，但直接使用 Devin CLI 时没有此问题

**原因**：
- `devin acp` 命令默认不读取 `~/.config/devin/config.json` 中的模型配置
- ACP 模式使用账户的默认模型（可能是付费模型），而不是 `swe-1-6` 等免费模型

**解决**（推荐方式）：

**方式 1**：在元宝聊天中直接发送 `/model` 命令

```bash
/model swe-1-7
```

- `/model` 会写入 `~/.config/devin/acp-model.json`
- 桥接器监听到文件变化后，立即调用 `session/set_config_option` 更新当前会话模型
- 下一条消息即可使用新模型，历史记录不丢失
- 输入错误模型名时 `/model` 会拒绝切换并提示可用列表，避免会话异常

```bash
# 查看可用模型列表
/models
```

**方式 2**：通过环境变量 `DEVIN_MODEL` 设置默认模型

```bash
# 添加环境变量到 systemd 服务文件
sed -i '/Environment=DEVIN_ACP_BRIDGE_DEBUG=1/a Environment=DEVIN_MODEL=swe-1-6' ~/.config/systemd/user/openclaw-gateway.service
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
```

**常用模型**：
- `swe-1-6` / `swe-1-7`: 免费模型，无每日限额
- `claude-sonnet-4-20250514`: 付费模型，性能更强但有配额限制

**验证配置**：
```bash
# 检查 /model 写入的模型文件
cat ~/.config/devin/acp-model.json

# 检查 Gateway 进程的环境变量（如使用 DEVIN_MODEL）
ps aux | grep openclaw-gateway
cat /proc/<PID>/environ | tr '\0' '\n' | grep DEVIN_MODEL
```

### 8.4 `Agent not in allowlist`

**原因**：`acp.allowedAgents` 配置中缺少 `"devin"`

**解决**：
```bash
# 编辑配置文件
nano ~/.openclaw/config.json5

# 确保 acp.allowedAgents 包含 "devin"
acp: {
  allowedAgents: ["devin"],
  // ...
}

# 重启网关
openclaw gateway restart
```

### 8.5 Devin 启动后报 "Permission prompt unavailable"

**原因**：`permissionMode` 未设置为 `"approve-all"`

**解决**：
```bash
# 编辑配置文件
nano ~/.openclaw/config.json5

# 确保配置如下
plugins: {
  entries: {
    acpx: {
      config: {
        permissionMode: "approve-all",
        // ...
      },
    },
  },
}

# 重启网关
openclaw gateway restart
```

### 8.6 元宝里收不到流式增量

**原因**：`acp.stream.coalesceIdleMs` 与 `channels.yuanbao.idleMs` 配置冲突

**解决**：
```bash
# 编辑配置文件
nano ~/.openclaw/config.json5

# 确保 ACP 端聚合时间小于元宝侧
acp: {
  stream: {
    coalesceIdleMs: 300,  // ACP 端
  },
},
channels: {
  yuanbao: {
    idleMs: 5000,  // 元宝侧，应大于 ACP 端
  },
}

# 重启网关
openclaw gateway restart
```

### 8.7 元宝报错 `Permission denied: an internal error occurred (trace ID: ...)`

**根本原因**：Devin CLI 2026.5.x ACP 模式故意不使用本地 `devin auth login` 的凭据，要求 ACP host 通过 `_meta.api_key` 显式认证。未经认证的会话在收到 prompt 时会从 Devin 服务器返回此错误。

**诊断**：
```bash
# 查看网关日志，确认走的认证路径
tail -50 /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log \
  | grep -E "API key provided|PKCE|bridge authenticate|Permission denied"
```

- `API key provided directly via authenticate meta` → 桥接器工作正常，问题在别处
- `PKCE authentication flow` → 桥接器未被使用，`command` 配置不对
- `bridge authenticate failed` 后跟 `timed out` → 网络到 Devin 服务器延迟过高（桥接器会自动重试）

**解决步骤**：

```bash
# 1. 确认认证桥接器配置正确
python3 -c "
import json
c = json.load(open('/home/$USER/.openclaw/openclaw.json'))
a = c['plugins']['entries']['acpx']['config']['agents']['devin']
print('command:', a['command'])
print('args:', a['args'])
"
# 期望输出：command: node  args: [...bridge.mjs...]

# 2. 若未配置桥接器，重新配置
BRIDGE="/path/to/yuanbao-openclaw-plugin/scripts/devin-acp-auth-bridge.mjs"
openclaw config set plugins.entries.acpx.config.agents.devin.command "node"
openclaw config set plugins.entries.acpx.config.agents.devin.args "[\"$BRIDGE\"]"
openclaw gateway restart

# 3. 确认 Devin 凭据可用（桥接器从这里读取 API key）
devin auth status   # 应显示 "Logged in"

# 无桌面环境（SSH/headless）时重新登录：
# devin auth login --force-manual-token-flow

# 4. 手动测试桥接器
DEVIN_ACP_BRIDGE_DEBUG=1 node "$BRIDGE" <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true},"terminal":true}}}
EOF
# 应看到：ACP: API key provided directly via authenticate meta
```

### 8.8 网关无法启动

**原因**：配置文件语法错误

**解决**：
```bash
# 验证 JSON5 语法
# 可以使用在线工具或安装 json5 验证工具

# 查看详细错误日志
openclaw logs --follow

# 检查配置文件
cat ~/.openclaw/config.json5
```

### 8.9 元宝机器人无响应

**排查步骤**：

```bash
# 1. 检查网关状态
openclaw gateway status

# 2. 检查通道状态
openclaw channels list

# 3. 查看实时日志
openclaw logs --follow

# 4. 验证 ACP 连接
openclaw doctor

# 5. 检查元宝凭证是否正确
# 确认 appKey 和 appSecret 配置无误
```

### 8.10 工作目录权限问题

**原因**：Devin 无法读写工作目录

**解决**：
```bash
# 检查工作目录权限
ls -la ~/.openclaw/workspace-devin

# 修改权限（如果需要）
chmod 755 ~/.openclaw/workspace-devin

# 确保工作目录存在
mkdir -p ~/.openclaw/workspace-devin
```

---

## 9. 高级配置

### 9.1 多 Agent 路由

为不同用户或群配置不同的 Devin 会话：

```json5
{
  agents: {
    list: [
      { 
        id: "personal", 
        workspace: "~/.openclaw/devin-personal",
        runtime: { 
          type: "acp", 
          acp: { 
            agent: "devin", 
            backend: "acpx", 
            mode: "persistent", 
            cwd: "~/.openclaw/devin-personal" 
          } 
        } 
      },
      { 
        id: "team", 
        workspace: "~/.openclaw/devin-team",
        runtime: { 
          type: "acp", 
          acp: { 
            agent: "devin", 
            backend: "acpx", 
            mode: "persistent", 
            cwd: "~/.openclaw/devin-team" 
          } 
        } 
      },
    ],
  },
  bindings: [
    { 
      agentId: "personal", 
      match: { 
        channel: "yuanbao", 
        peer: { kind: "direct", id: "USER_ID_XX" } 
      } 
    },
    { 
      agentId: "team", 
      match: { 
        channel: "yuanbao", 
        peer: { kind: "group", id: "GROUP_ID_YY" } 
      } 
    },
  ],
}
```

### 9.2 使用 systemd 自动启动

创建 systemd 服务文件：

```bash
sudo nano /etc/systemd/system/openclaw-gateway.service
```

添加以下内容：

```ini
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=yourusername
Environment="PATH=/usr/local/bin:/usr/bin:/bin:$(npm config get prefix)/bin"
Environment="HOME=/home/yourusername"
ExecStart=/usr/local/bin/openclaw gateway start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclaw-gateway
sudo systemctl start openclaw-gateway
sudo systemctl status openclaw-gateway
```

---

## 10. 参考资源

- [OpenClaw 官方文档](https://openclaw.dev/docs)
- [Devin CLI 文档](https://cli.devin.ai/docs)
- [本仓库 README](../README.md)
- [详细集成指南](./devin-integration.md)

---

## 11. 获取帮助

如果遇到问题：

1. 查看日志：`openclaw logs --follow`
2. 运行诊断：`openclaw doctor`
3. 查看本项目的 [Issues](https://github.com/mofanx/yuanbao-openclaw-plugin/issues)
4. 参考 [详细集成指南](./devin-integration.md) 的故障排查章节

---

**祝你使用愉快！** 🎉
