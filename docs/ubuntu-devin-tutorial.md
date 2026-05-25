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
# 应显示版本号，例如：openclaw/2026.5.6
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

```bash
# 登录 Devin 账号
devin auth login

# 验证登录状态
devin auth status
# 应显示 "logged in" 或类似信息
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

### 5.3 配置 ACP 和 acpx

```bash
# 配置 ACP 调度
openclaw config set acp.enabled true
openclaw config set acp.dispatch.enabled true
openclaw config set acp.backend "acpx"
openclaw config set acp.defaultAgent "devin"
openclaw config set acp.allowedAgents '["devin"]'
openclaw config set acp.maxConcurrentSessions 4
openclaw config set acp.runtime.ttlMinutes 120

# 配置 acpx 插件
openclaw config set plugins.entries.acpx.config.permissionMode "approve-all"
openclaw config set plugins.entries.acpx.config.nonInteractivePermissions "deny"
openclaw config set plugins.entries.acpx.config.probeAgent "devin"
openclaw config set plugins.entries.acpx.config.agents.devin.command "devin"
openclaw config set plugins.entries.acpx.config.agents.devin.args '["acp"]'

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
```

### 5.4 配置元宝通道

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

### 5.5 创建工作目录

```bash
mkdir -p ~/.openclaw/workspace-devin
```

### 5.6 配置通道绑定

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

### 5.7 重启 Gateway 应用配置

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

### 7.2 私聊方式

1. 在元宝 APP 中找到你的机器人
2. 发送 `/acp spawn devin --mode persistent --bind here` 启动 ACP 会话
3. 发送消息给机器人
4. 机器人会通过 Devin CLI 处理你的请求并返回回复

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

### 8.2 `Agent not in allowlist`

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

### 8.3 Devin 启动后报 "Permission prompt unavailable"

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

### 8.4 元宝里收不到流式增量

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

### 8.5 鉴权失败

**原因**：Devin CLI 未登录或网关服务未继承用户环境

**解决**：
```bash
# 检查 Devin 登录状态
devin auth status

# 如果未登录，重新登录
devin auth login

# 如果网关以 systemd 服务运行，可能需要显式设置 HOME 环境变量
# 编辑 systemd 服务文件（如果使用 systemd）
sudo systemctl edit openclaw-gateway

# 添加环境变量
[Service]
Environment="HOME=/home/yourusername"

# 重启服务
sudo systemctl restart openclaw-gateway
```

### 8.6 网关无法启动

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

### 8.7 元宝机器人无响应

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

### 8.8 工作目录权限问题

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
