# Yuanbao ⇄ Devin CLI 集成指南

让用户在 **腾讯元宝（Yuanbao）** 里直接和 **[Devin CLI](https://cli.devin.ai/docs)** 对话。

集成复用 OpenClaw 内置的 ACP harness 路由能力，把 Devin CLI 注册为 acpx agent alias，通过一个轻量的认证桥接脚本解决 Devin ACP 模式的认证问题。

> **已在以下版本验证**：`devin 2026.5.26-5`、`openclaw 2026.6.1`、Ubuntu 22.04/24.04 headless 无桌面环境。

---

## 1. 工作原理

```
┌──────────┐  WebSocket  ┌─────────────────────┐  ACP/stdio  ┌────────────────────┐  stdio  ┌────────────┐
│ 元宝 App │ ◀──────────▶│  OpenClaw Gateway   │ ◀──spawn──▶ │ devin-acp-auth-    │ ──────▶ │  devin acp │
└──────────┘             │  ├ yuanbao 插件      │             │ bridge.mjs (Node)  │         │  (子进程)  │
                         │  └ acpx 后端         │             └────────────────────┘         └────────────┘
                         └─────────────────────┘
                                  ↑
                         codex-acp-wrapper.mjs（acpx 内部 stderr 捕获层，透明）
```

**为什么需要 `devin-acp-auth-bridge.mjs`（认证桥接器）**：

Devin CLI 2026.5.x ACP 模式启用了严格的凭据策略——**故意不使用**本地 `devin auth login` 的凭据，要求 ACP host（也就是 acpx）在调用 `authenticate` 时通过 `_meta.api_key` 显式传入 API key。而 acpx 2026.5.x 在调用 authenticate 时只发送 `{ methodId }`，不会附带 `_meta.api_key`，导致：
- acpx 无凭据 → 跳过 authenticate → Devin 拒绝建会话
- acpx 有凭据 → 触发 PKCE 浏览器流程 → 网关 systemd 服务无 DISPLAY，且依赖 3s 内拿到 team settings（国内网络到 Devin 服务器经常超时）

**桥接器的做法**：
- 夹在 acpx 与 `devin acp` 之间，透明转发所有 ACP JSON-RPC
- 自动从 `~/.local/share/devin/credentials.toml`（或环境变量）读取 API key
- 在第一个 `session/new` 前，用 `_meta.api_key` 完成非交互式认证（无需浏览器）
- 若 team settings 拉取超时则自动重试（默认最多 7 次）
- **拦截 `initialize` 请求，将客户端信息从 acpx 改为 OpenClaw，避免 Devin 服务端的版本检查错误**
- **支持 Devin CLI 2026.5.26+ 的 ACP 权限持久化功能**

---

## 2. 前置条件

| 依赖         | 最低版本          | 验证命令                              |
|--------------|-------------------|---------------------------------------|
| OpenClaw     | `2026.6.0+`      | `openclaw --version`                  |
| acpx 插件    | OpenClaw 内置     | `openclaw plugins list` 看到 `acpx`  |
| Devin CLI    | `2026.5.26-5+`   | `devin --version`                     |
| Node.js      | `22.x+`           | `node --version`                      |
| 本插件       | `2.13.5+`         | `openclaw channels list`              |

**无需 Devin Desktop**：Devin CLI 可作为独立工具安装，无需安装 Devin Desktop（原 Windsurf IDE）。

---

## 3. Auth 配置（核心，必须先完成）

### 3.1 有桌面 / 可交互终端环境

```bash
# 正常登录
devin auth login

# 验证：应看到 "Logged in (via Devin)"
devin auth status
```

登录后凭据写入 `~/.local/share/devin/credentials.toml`，桥接器自动读取，无需任何额外配置。

### 3.2 无桌面 / SSH 远程 / 纯服务端（仅 Devin CLI）

```bash
# --force-manual-token-flow：跳过浏览器，改为手动粘贴 token
devin auth login --force-manual-token-flow
```

执行后会打印一个 URL，在**另一台设备的浏览器**（手机、电脑均可）打开 → 完成登录 → 复制 token → 粘贴回终端。  
完成后同样写入 `~/.local/share/devin/credentials.toml`，桥接器自动读取。

### 3.3 CI / 自动化部署（无交互）

从已登录的机器获取 API key 并注入到网关服务环境：

```bash
# 1. 在已登录机器上导出 key
DEVIN_KEY=$(sed -n 's/windsurf_api_key *= *"\(.*\)"/\1/p' \
  ~/.local/share/devin/credentials.toml)
echo "key length: ${#DEVIN_KEY}"   # 应为 100+ 字符

# 2. 注入到 systemd 用户服务（持久化）
mkdir -p ~/.config/systemd/user/openclaw-gateway.service.d/
cat > ~/.config/systemd/user/openclaw-gateway.service.d/devin-api-key.conf << EOF
[Service]
Environment=DEVIN_ACP_API_KEY=${DEVIN_KEY}
EOF
systemctl --user daemon-reload
openclaw gateway restart

# 验证：重启后 DEVIN_ACP_API_KEY 在网关进程中可见
grep DEVIN_ACP_API_KEY /proc/$(pgrep -f "openclaw.*gateway")/environ 2>/dev/null \
  && echo "env var injected ✓"
```

桥接器的优先级：`DEVIN_ACP_API_KEY` 环境变量 > `WINDSURF_API_KEY` 环境变量 > `credentials.toml`。

---

## 4. 安装与配置

### 4.1 获取桥接脚本

```bash
# 本仓库已包含桥接脚本，克隆后直接使用
git clone https://github.com/YuanbaoTeam/yuanbao-openclaw-plugin.git
BRIDGE_DIR="$(pwd)/yuanbao-openclaw-plugin"

# 确认脚本存在
ls "$BRIDGE_DIR/scripts/devin-acp-auth-bridge.mjs"
```

### 4.2 更新 OpenClaw 配置

```bash
# 设置 devin alias 指向认证桥接器（替换为实际路径）
BRIDGE="$BRIDGE_DIR/scripts/devin-acp-auth-bridge.mjs"

openclaw config set plugins.entries.acpx.config.agents.devin.command "node"
openclaw config set plugins.entries.acpx.config.agents.devin.args "[\"$BRIDGE\"]"
```

或直接编辑 `~/.openclaw/openclaw.json`（完整配置见 §5）：

```json
"agents": {
  "devin": {
    "command": "node",
    "args": ["/abs/path/to/scripts/devin-acp-auth-bridge.mjs"]
  }
}
```

**重要提示**：acpx 插件不支持在 agent 配置中使用 `env` 字段。如果需要启用桥接器的调试模式，请通过系统环境变量设置（例如在 systemd 服务文件中设置 `DEVIN_ACP_BRIDGE_DEBUG=1`）。

### 4.3 完整最小配置

把下面片段合并到 `~/.openclaw/openclaw.json`。完整可粘贴版本见 [`examples/devin-integration/openclaw.config.json5`](../examples/devin-integration/openclaw.config.json5)。

```json5
{
  acp: {
    enabled: true,
    dispatch: { enabled: true },
    backend: "acpx",
    defaultAgent: "devin",
    allowedAgents: ["devin"],
    maxConcurrentSessions: 4,
    runtime: { ttlMinutes: 120 },
  },

  plugins: {
    entries: {
      acpx: {
        enabled: true,
        config: {
          permissionMode: "approve-all",        // 非交互必须自动通过
          nonInteractivePermissions: "deny",    // 优雅降级，避免崩溃
          probeAgent: "devin",
          agents: {
            devin: {
              command: "node",
              args: ["/abs/path/to/scripts/devin-acp-auth-bridge.mjs"],
            },
          },
        },
      },
    },
  },

  agents: {
    defaults: { workspace: "~/.openclaw/workspace-devin" },
    list: [
      {
        id: "main",
        default: true,
        workspace: "~/.openclaw/workspace-devin",
        runtime: {
          type: "acp",
          acp: {
            agent: "devin",
            backend: "acpx",
            mode: "persistent",
            cwd: "~/.openclaw/workspace-devin",
          },
        },
      },
    ],
  },

  channels: {
    yuanbao: {
      appKey: "<YOUR_YUANBAO_APP_KEY>",
      appSecret: "<YOUR_YUANBAO_APP_SECRET>",
      dm: { policy: "open" },
      requireMention: true,
      outboundQueueStrategy: "merge-text",
      idleMs: 5000,
    },
  },

  bindings: [
    { agentId: "main", match: { channel: "yuanbao" } },
  ],
}
```

### 4.4 应用配置

```bash
mkdir -p ~/.openclaw/workspace-devin
openclaw gateway restart

# 观察网关日志确认正常启动
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep -E "acpx|bridge|devin|error"
```

---

## 5. 验证

### 5.1 快速验证（桥接器直连）

```bash
# 直接运行验证脚本，测试 bridge → devin acp 链路
node scripts/verify-devin-acp.mjs
```

验证脚本测试：spawn `devin acp` → ACP `initialize` → 校验 `protocolVersion` / `agentCapabilities` / `authMethods`。

### 5.2 桥接器自测（含认证）

```bash
DEVIN_ACP_BRIDGE_DEBUG=1 node scripts/devin-acp-auth-bridge.mjs <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true}}}
EOF
```

应看到：
- `[devin-acp-bridge] using API key from ...`
- `ACP: API key provided directly via authenticate meta`（来自 devin stderr）
- 标准 JSON-RPC initialize 响应

### 5.3 观察实时日志

发送一条元宝消息后，在网关日志里确认：

```bash
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log \
  | grep -E "API key provided|PKCE|bridge|Permission denied|ACP_TURN_FAILED"
```

**正常**：看到 `API key provided directly via authenticate meta`，无 `Permission denied`。  
**异常**：看到 `PKCE authentication flow`（没走桥接器）或 `Permission denied`（认证失败）。

### 5.4 Devin CLI 2026.5.26+ 新特性

Devin CLI 2026.5.26-0 及更高版本引入了多项重要的 ACP 相关改进，提升了集成体验：

#### **ACP 权限持久化**
- **跨会话权限保持**：权限授予现在可以跨会话持久化，无需每次重新批准
- **改进的权限管理**：在 Devin Desktop/IDE 中，"Always Allow" 权限授予现在在多个会话间保持有效
- **桥接器兼容性**：`devin-acp-auth-bridge.mjs` 自动支持这些改进，无需额外配置

#### **MCP 工具权限改进**
- **服务器级别权限批准**：当提示 MCP 工具权限时，现在提供两个额外的服务器级别选项：
  - 为当前会话批准服务器上的所有工具
  - 永久批准服务器上的所有工具
- **更广泛的访问控制**：允许更广泛的访问而无需单独批准每个工具
- **桥接器支持**：桥接器自动处理这些新的权限请求模式

#### **编辑器上下文感知**
- **当前文件信息**：支持的编辑器集成现在会向代理显示当前打开的文件
- **光标位置**：代理可以看到光标在文件中的位置
- **标签页信息**：其他打开的编辑器标签页信息作为上下文的一部分
- **增强的代码理解**：这些信息帮助代理更好地理解当前的编辑上下文

#### **新的 ACP 调试命令**
- **`/debug-echo <json>`**：向 ACP 传输写入原始 JSON-RPC 正文
- **测试用途**：用于测试 ACP 客户端如何处理特定消息或错误条件
- **自动补全**：如果缺少，自动插入 `"jsonrpc": "2.0"`
- **桥接器调试**：可以在桥接器环境中使用此命令进行故障排除

#### **云会话支持**
- **`/cloud-attach <session-id>`**：附加到现有的云 Devin 会话，具有完整的 TUI 渲染
- **`/cloud-sessions [--all]`**：列出最近的云 Devin 会话及其可附加的会话 ID
- **无缝集成**：可以在本地和云会话之间切换，享受各自的优势

#### **其他重要改进**
- **Gemini 3.5 Flash 模型支持**：新增对 Google Gemini 3.5 Flash 模型的支持
- **终端通知改进**：更好的终端集成和通知体验
- **Shell 集成增强**：改进的提示导航和可折叠命令部分
- **性能优化**：长对话的背景压缩，减少上下文满时的等待时间

**兼容性说明**：这些新特性在当前的桥接器配置中自动启用，无需修改配置。桥接器的设计确保了向后兼容性。

---

## 6. 桥接器环境变量参考

| 变量                      | 说明                                             | 默认值       |
|---------------------------|--------------------------------------------------|--------------|
| `DEVIN_ACP_API_KEY`       | 直接提供 API key（优先于 credentials.toml）      | —            |
| `WINDSURF_API_KEY`        | 同上，备用变量名                                 | —            |
| `DEVIN_BIN`               | devin 可执行文件路径                             | `"devin"`    |
| `DEVIN_CREDENTIALS_PATH`  | credentials.toml 路径                           | XDG 标准路径 |
| `DEVIN_ACP_AUTH_RETRIES`  | 认证超时重试次数                                 | `6`          |
| `DEVIN_ACP_AUTH_RETRY_MS` | 每次重试间隔（毫秒）                             | `1500`       |
| `DEVIN_ACP_BRIDGE_DEBUG`  | 设为 `1` 开启详细日志                            | —            |

---

## 7. 多 Agent / 多用户路由

按元宝 peer（用户/群）分流到不同 workspace + 不同 Devin 会话（每个 agent 都使用同一个桥接脚本）：

```json5
{
  agents: {
    list: [
      {
        id: "personal",
        workspace: "~/.openclaw/devin-personal",
        runtime: { type: "acp", acp: { agent: "devin", backend: "acpx", mode: "persistent", cwd: "~/.openclaw/devin-personal" } }
      },
      {
        id: "team",
        workspace: "~/.openclaw/devin-team",
        runtime: { type: "acp", acp: { agent: "devin", backend: "acpx", mode: "persistent", cwd: "~/.openclaw/devin-team" } }
      },
    ],
  },
  bindings: [
    { agentId: "personal", match: { channel: "yuanbao", peer: { kind: "direct", id: "USER_ID_XX" } } },
    { agentId: "team",     match: { channel: "yuanbao", peer: { kind: "group",  id: "GROUP_ID_YY" } } },
  ],
}
```

---

## 8. 元宝侧使用

正常 DM 或 @机器人 即可。所有现有元宝功能（merge-text 流式、`/help` `/status` `/new` `/stop` `/restart` `/compact`、quote reply）继续生效。

OpenClaw 的 `/acp` 系列管理命令（`/acp status` `/acp cancel` `/acp model` `/acp permissions`）也可在元宝聊天里发出。

---

## 9. 故障排查

| 现象 | 排查 |
|------|------|
| `Permission denied: an internal error occurred (trace ID: ...)` | 认证失败。检查 `credentials.toml` 是否存在（`devin auth status`）；若无，运行 `devin auth login --force-manual-token-flow`；或设置 `DEVIN_ACP_API_KEY` 环境变量。 |
| `ACP: Starting browser-based PKCE authentication flow`（日志中） | 桥接器未被使用，还在直接用 `devin acp`。检查 acpx 配置中 `agents.devin.command` 是否为 `"node"` 且 `args` 指向桥接脚本。 |
| `Authentication failed: Team settings refresh timed out after 3000ms` | 网络到 Devin 服务器延迟过高。桥接器会自动重试（最多 7 次）；若仍失败，检查网络连接或增大 `DEVIN_ACP_AUTH_RETRIES`。 |
| `bridge authenticate failed permanently` | 多次重试后仍失败。尝试：(1) `devin auth login --force-manual-token-flow` 刷新凭据；(2) 检查 Devin Pro 订阅是否有效（`devin auth status`）。 |
| 网关找不到 `node` 命令 | 确认 `node` 在网关 systemd 服务的 PATH 中；查看 `systemctl --user show openclaw-gateway.service -p Environment`。 |
| `Harness command not found` | `which node` 确认 node 在 PATH；`node scripts/devin-acp-auth-bridge.mjs` 单跑验证脚本可执行。 |
| 元宝里收不到流式增量 | 检查 `acp.stream.coalesceIdleMs`（建议 300）与 `channels.yuanbao.idleMs`（建议 5000），前者应小于后者。 |
| Devin 子进程串话 | 给每个 peer 配独立 `agents.list[]` + `bindings[]`，确保 `workspace` 与 `cwd` 不重叠。 |

---

## 10. 已知限制

- **权限**：`permissionMode: "approve-all"` 等于给 Devin 在 workspace 内完全自动放行。**务必**把 `agents.list[].workspace` 设为独立目录，不要指向家目录或代码仓库根。
- **多账号**：桥接器从同一份 `credentials.toml` 读取凭据；不同 agent 共用同一份认证（Devin Pro 账号层面区分）。
- **模型切换**：`/acp model ...` 命令对 Devin 可能无效，在 Devin 侧用 `~/.config/devin/config.json` 的 `agent.model` 字段配置。
- **Devin 协议变更**：Devin 升级后若 authenticate 策略调整，查看 `~/.openclaw/acpx/codex-acp-wrapper.stderr.*.log` 日志定位。

---

## 11. 升级路径

当前为 **A 路线（配置驱动 + bridge 补丁）**，无侵入式代码修改，官方上游同步零成本。

若需要更深度集成（Devin slash command 透传、Devin 工具确认在元宝侧显示等），可切换到 **B 补强路线**——在本仓库 `src/business/integrations/devin/` 下按需补强，当前配置仍可兼容。
