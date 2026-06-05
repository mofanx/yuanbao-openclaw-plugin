# OpenClaw ACP 使用指南

ACP (Agent Control Protocol) 是 OpenClaw 用于管理和运行 ACP 支持的编码代理的协议。

---

## 1. ACP 概述

ACP (Agent Control Protocol) 是 OpenClaw 的核心功能之一，允许通过标准化的 JSON-RPC 协议与各种 AI 编码代理（如 Devin、Claude Code 等）进行交互。

### 1.1 openclaw acp 与 ACP Agents 的区别

**`openclaw acp` 命令：**
- OpenClaw 作为 ACP 服务器
- IDE 或 ACP 客户端连接到 OpenClaw
- OpenClaw 将工作转发到 Gateway 会话

**ACP Agents（通过 acpx）：**
- OpenClaw 通过 acpx 运行外部 harness（如 Codex、Claude Code）
- 使用 `/acp spawn` 命令启动 ACP 会话

**快速规则：**
- 编辑器/客户端想通过 ACP 与 OpenClaw 通信：使用 `openclaw acp`
- OpenClaw 应该启动 Codex/Claude/Gemini 作为 ACP harness：使用 `/acp spawn` 和 ACP Agents

### 1.2 主要特性

- **标准化协议**：使用 JSON-RPC 2.0 进行通信
- **多代理支持**：可同时管理多个 ACP 代理
- **会话管理**：支持持久化和临时会话
- **权限控制**：细粒度的执行权限管理
- **后端抽象**：支持不同的 ACP 后端实现（acpx 等）

---

## 2. ACP 命令参考

### 2.1 基础命令

#### `openclaw acp`

运行和管理 ACP 支持的编码代理。

**全局选项：**

| 选项 | 说明 |
|------|------|
| `--no-prefix-cwd` | 不在提示符前添加工作目录前缀 |
| `--password <password>` | 网关密码（如果需要） |
| `--password-file <path>` | 从文件读取网关密码 |
| `--provenance <mode>` | ACP 来源模式：off、meta 或 meta+receipt |
| `--require-existing` | 如果会话密钥/标签不存在则失败 |
| `--reset-session` | 首次使用前重置会话密钥 |
| `--session <key>` | 默认会话密钥（如 agent:main:main） |
| `--session-label <label>` | 默认会话标签 |
| `--token <token>` | 网关令牌（如果需要） |
| `--token-file <path>` | 从文件读取网关令牌 |
| `--url <url>` | 网关 WebSocket URL（默认使用配置中的 gateway.remote.url） |
| `-v, --verbose` | 详细日志输出 |

#### `openclaw acp client`

运行交互式 ACP 客户端。

**选项：**

| 选项 | 说明 |
|------|------|
| `--cwd <dir>` | ACP 会话的工作目录 |
| `--server <command>` | ACP 服务器命令（默认：openclaw） |
| `--server-args <args...>` | ACP 服务器的额外参数 |
| `--server-verbose` | 启用 ACP 服务器的详细日志 |
| `-v, --verbose` | 详细客户端日志 |

---

## 3. 配置说明

### 3.1 启用 ACP

在 `~/.openclaw/openclaw.json` 中配置：

```json5
{
  acp: {
    enabled: true,
    dispatch: {
      enabled: true
    },
    backend: "acpx",
    defaultAgent: "devin",
    allowedAgents: ["devin"],
    maxConcurrentSessions: 4,
    runtime: {
      ttlMinutes: 120
    }
  }
}
```

**配置参数说明：**

| 参数 | 说明 | 必需 |
|------|------|------|
| `enabled` | 是否启用 ACP | 是 |
| `dispatch.enabled` | 是否启用分发 | 是 |
| `backend` | ACP 后端类型 | 是 |
| `defaultAgent` | 默认代理 | 是 |
| `allowedAgents` | 允许的代理列表 | 是 |
| `maxConcurrentSessions` | 最大并发会话数 | 否 |
| `runtime.ttlMinutes` | 会话生存时间（分钟） | 否 |

### 3.2 acpx 插件概述

acpx 是 OpenClaw 的官方 ACP 运行时后端插件，负责管理 ACP 会话和传输。

**插件信息：**

| 属性 | 值 |
|------|-----|
| **插件 ID** | acpx |
| **插件名称** | ACPX Runtime |
| **来源** | npm (@openclaw/acpx) |
| **版本** | 2026.5.28 (npm 最新) |
| **类型** | openclaw 插件 |
| **描述** | OpenClaw ACP runtime backend with plugin-owned session and transport management |

**支持的 ACP harness 别名：**

acpx 内置支持以下 ACP 代理别名（推荐使用这些值作为 agentId）：

- `claude` - Claude Code
- `codex` - OpenClaw Codex
- `copilot` - GitHub Copilot
- `cursor` - Cursor CLI (cursor-agent acp)
- `droid` - Android Studio
- `gemini` - Gemini CLI
- `iflow` - iFlow
- `kilocode` - Kilocode
- `kimi` - Kimi
- `kiro` - Kiro
- `openclaw` - OpenClaw ACP
- `opencode` - OpenCode
- `qwen` - Qwen

**插件状态检查：**

```bash
# 查看插件列表
openclaw plugins list

# 检查 acpx 插件详情
openclaw plugins inspect acpx

# 诊断插件问题
openclaw plugins doctor
```

### 3.3 配置 acpx 插件

```json5
{
  plugins: {
    entries: {
      acpx: {
        enabled: true,
        config: {
          permissionMode: "approve-all",
          nonInteractivePermissions: "deny",
          probeAgent: "devin",
          agents: {
            devin: {
              command: "node",
              args: ["/path/to/bridge-script.mjs"]
            }
          },
          queueOwnerTtlSeconds: 60,
          timeoutSeconds: 120
        }
      }
    }
  }
}
```

**acpx 配置参数：**

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `permissionMode` | 权限模式 | `"approve-all"`, `"approve-reads"`, `"deny-all"` |
| `nonInteractivePermissions` | 非交互权限 | `"fail"`, `"deny"` |
| `probeAgent` | 探测代理 | 代理名称 |
| `agents` | 代理配置 | 对象 |
| `queueOwnerTtlSeconds` | 队列所有者 TTL | 秒数 |
| `timeoutSeconds` | 超时时间 | 秒数 |
| `pluginToolsMcpBridge` | 插件工具 MCP 桥接 | `true`, `false` |
| `openClawToolsMcpBridge` | OpenClaw 工具 MCP 桥接 | `true`, `false` |
| `command` | 自定义 acpx 命令路径 | 路径 |
| `expectedVersion` | 期望版本 | 版本号或 `"any"` |
| `mcpServers` | MCP 服务器配置 | 对象 |

### 3.4 acpx 插件管理命令

#### `openclaw plugins list`

列出所有已发现的插件。

**使用示例：**

```bash
# 列出所有插件
openclaw plugins list

# 查看插件状态（enabled/disabled）
openclaw plugins list | grep acpx
```

#### `openclaw plugins inspect <plugin-id>`

检查插件详细信息。

**使用示例：**

```bash
# 检查 acpx 插件详情
openclaw plugins inspect acpx
```

**输出信息：**
- 插件 ID 和名称
- 插件状态（loaded/unloaded）
- 插件来源和版本
- 安装路径和时间
- 插件类型和能力模式

#### `openclaw plugins doctor`

诊断插件加载问题。

**使用示例：**

```bash
# 诊断所有插件问题
openclaw plugins doctor
```

#### `openclaw plugins enable <plugin-id>`

启用插件。

**使用示例：**

```bash
# 启用 acpx 插件
openclaw plugins enable acpx
```

#### `openclaw plugins disable <plugin-id>`

禁用插件。

**使用示例：**

```bash
# 禁用 acpx 插件
openclaw plugins disable acpx
```

#### `openclaw plugins install <spec>`

安装插件。

**使用示例：**

```bash
# 从 npm 安装 acpx
openclaw plugins install @openclaw/acpx

# 从本地路径安装
openclaw plugins install /path/to/plugin

# 从 git 仓库安装
openclaw plugins install git+https://github.com/user/plugin.git
```

#### `openclaw plugins uninstall <plugin-id>`

卸载插件。

**使用示例：**

```bash
# 卸载 acpx 插件
openclaw plugins uninstall acpx
```

#### `openclaw plugins update`

更新已安装的插件。

**使用示例：**

```bash
# 更新所有插件
openclaw plugins update

# 更新特定插件
openclaw plugins update acpx
```

### 3.5 Devin CLI ACP

Devin CLI 提供了原生的 ACP 支持，可以作为 ACP 服务器运行。

#### 3.5.1 devin acp 命令

**命令：** `devin acp`

**用途：**
- 运行 Devin 作为 Agent Client Protocol (ACP) 服务器
- 通过 stdio 进行 JSON-RPC 通信
- 旨在被 ACP 感知的编辑器或 IDE（如 Devin Desktop 或 Zed）作为子进程调用
- 不是为交互式运行设计的

#### 3.5.2 认证方式

Devin CLI ACP 支持以下认证方式：

1. **环境变量认证：**
   ```bash
   export WINDSURF_API_KEY=your-api-key
   devin acp
   ```

2. **运行时认证：**
   - 可以通过 ACP `authenticate` 请求在运行时接受凭据
   - 需要先运行 `devin auth login` 进行认证

3. **前置要求：**
   ```bash
   # 先进行登录认证
   devin auth login
   ```

#### 3.5.3 在 OpenClaw 中使用

在 OpenClaw 的 acpx 配置中，通过桥接脚本调用 `devin acp`：

```json5
{
  plugins: {
    entries: {
      acpx: {
        enabled: true,
        config: {
          agents: {
            devin: {
              command: "node",
              args: ["/path/to/devin-acp-auth-bridge.mjs"]
            }
          }
        }
      }
    }
  }
}
```

桥接脚本负责：
- 启动 `devin acp` 进程
- 处理 ACP 协议转换
- 管理认证凭据传递

#### 3.5.4 参考资源

- **ACP 官方协议：** https://agentclientprotocol.com
- **Devin CLI 命令文档：** https://docs.devin.ai/cli/reference/commands
- **Devin CLI 认证文档：** https://docs.devin.ai/cli/enterprise/windsurf-auth

### 3.6 配置 Agent 运行时

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace-devin",
      maxConcurrent: 4,
      subagents: {
        maxConcurrent: 8,
        archiveAfterMinutes: 60
      }
    },
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
            cwd: "~/.openclaw/workspace-devin",
            mode: "persistent"
          }
        }
      }
    ]
  }
}
```

**Agent 运行时参数：**

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `type` | 运行时类型 | `"acp"`, `"local"` |
| `acp.agent` | ACP 代理名称 | - |
| `acp.backend` | ACP 后端 | `"acpx"` |
| `acp.cwd` | 工作目录 | 路径 |
| `acp.mode` | 模式 | `"persistent"`, `"ephemeral"` |

---

## 4. 使用示例

### 4.1 基础使用

```bash
# 启动 ACP 客户端
openclaw acp client

# 指定工作目录
openclaw acp client --cwd ~/my-project

# 使用特定会话
openclaw acp --session agent:main:main client

# 详细日志模式
openclaw acp -v client
```

### 4.2 与网关集成

```bash
# 连接到本地网关
openclaw acp --url ws://127.0.0.1:18789 client

# 使用令牌认证
openclaw acp --token your-token-here client

# 从文件读取令牌
openclaw acp --token-file ~/.openclaw/token client
```

### 4.3 会话管理

```bash
# 重置会话
openclaw acp --reset-session client

# 要求现有会话
openclaw acp --require-existing client

# 使用会话标签
openclaw acp --session-label my-session client
```

---

## 5. ACP Sessions 管理

OpenClaw 提供完整的会话管理功能，可以查看、清理和导出 ACP 会话数据。

### 5.1 列出会话

#### `openclaw sessions list`

列出存储的对话会话。

**选项：**

| 选项 | 说明 |
|------|------|
| `--active <minutes>` | 仅显示过去 N 分钟内更新的会话 |
| `--agent <id>` | 要检查的代理 ID（默认：配置的默认代理） |
| `--all-agents` | 聚合所有配置代理的会话 |
| `--json` | 以 JSON 格式输出 |
| `--limit <count>` | 最大显示会话数（默认：100；使用 "all" 显示全部） |
| `--store <path>` | 会话存储路径（默认：从配置解析） |
| `--verbose` | 详细日志 |

**使用示例：**

```bash
# 列出所有会话
openclaw sessions list

# 列出特定代理的会话
openclaw sessions list --agent work

# 聚合所有代理的会话
openclaw sessions list --all-agents

# 仅显示最近 2 小时的会话
openclaw sessions list --active 120

# 显示最新的 25 个会话
openclaw sessions list --limit 25

# JSON 格式输出
openclaw sessions list --json

# 使用特定的会话存储
openclaw sessions list --store ./tmp/sessions.json
```

**注意：** `openclaw sessions` 命令显示的是 OpenClaw Agent 层面的会话，不是 ACP 层面的会话。ACP 层面的会话由 acpx 插件内部管理，通常需要通过渠道端（如元宝）查看。

### 5.2 清理会话

#### `openclaw sessions cleanup`

运行会话存储维护。

**选项：**

| 选项 | 说明 |
|------|------|
| `--active-key <key>` | 保护此会话密钥不被预算驱逐 |
| `--agent <id>` | 要维护的代理 ID（默认：配置的默认代理） |
| `--all-agents` | 在所有配置代理上运行维护 |
| `--dry-run` | 预览维护操作而不写入 |
| `--enforce` | 即使配置模式为 warn 也应用维护 |
| `--fix-dm-scope` | 清理不再匹配 session.dmScope=main 的陈旧直接 DM 会话行 |
| `--fix-missing` | 删除其转录文件缺失的存储条目（绕过年龄/计数保留） |
| `--json` | 输出 JSON |
| `--store <path>` | 会话存储路径（默认：从配置解析） |

**使用示例：**

```bash
# 预览陈旧/上限清理
openclaw sessions cleanup --dry-run

# 预览并清理缺失转录文件的条目
openclaw sessions cleanup --dry-run --fix-missing

# 预览在将 dmScope 返回 main 后的陈旧直接 DM 行
openclaw sessions cleanup --dry-run --fix-dm-scope

# 立即应用维护
openclaw sessions cleanup --enforce

# 预览一个代理的存储
openclaw sessions cleanup --agent work --dry-run

# 预览所有代理存储
openclaw sessions cleanup --all-agents --dry-run

# 使用特定存储应用维护
openclaw sessions cleanup --enforce --store ./tmp/sessions.json
```

### 5.3 导出轨迹

#### `openclaw sessions export-trajectory`

为存储的会话导出脱敏的轨迹包。

**选项：**

| 选项 | 说明 |
|------|------|
| `--agent <id>` | 用于解析默认会话存储的代理 ID |
| `--json` | 输出 JSON |
| `--output <path>` | .openclaw/trajectory-exports 内的输出目录名称 |
| `--request-json-base64 <payload>` | Base64url 编码的导出请求 |
| `--session-key <key>` | 要导出的会话密钥 |
| `--store <path>` | 会话存储路径（默认：从会话密钥解析） |
| `--workspace <path>` | 导出的工作区根目录（默认：当前目录） |

**使用示例：**

```bash
# 导出特定会话
openclaw sessions export-trajectory --session-key agent:main:main

# 指定输出目录
openclaw sessions export-trajectory --session-key agent:main:main --output my-export

# 使用特定工作区
openclaw sessions export-trajectory --session-key agent:main:main --workspace ~/my-project

# JSON 格式输出
openclaw sessions export-trajectory --session-key agent:main:main --json
```

### 5.4 会话存储位置

会话数据存储在以下位置：

- **默认位置**：`~/.openclaw/agents/<agent-id>/sessions/sessions.json`
- **转录文件**：`~/.openclaw/agents/<agent-id>/sessions/<session-id>.jsonl`
- **轨迹导出**：`~/.openclaw/trajectory-exports/`

### 5.5 会话配置

在 `~/.openclaw/openclaw.json` 中配置会话相关设置：

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace-devin",
      maxConcurrent: 4,
      contextTokens: 128000,  // 上下文令牌限制
      subagents: {
        maxConcurrent: 8,
        archiveAfterMinutes: 60
      }
    }
  }
}
```

**配置参数说明：**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `workspace` | 默认工作区路径 | - |
| `maxConcurrent` | 最大并发会话数 | `4` |
| `contextTokens` | 上下文令牌限制 | - |
| `subagents.maxConcurrent` | 子代理最大并发数 | `8` |
| `subagents.archiveAfterMinutes` | 子代理归档时间（分钟） | `60` |

---

## 6. 故障排查

### 6.1 常见问题

#### 网关连接失败

**现象：** 无法连接到网关

**解决：**
```bash
# 检查网关状态
openclaw gateway status

# 检查网关日志
openclaw logs

# 重启网关
openclaw gateway restart
```

#### 代理未找到

**现象：** `Harness command not found`

**解决：**
```bash
# 检查代理配置
openclaw config get plugins.entries.acpx.config.agents

# 验证命令路径
which node
node /path/to/bridge-script.mjs
```

#### 权限被拒绝

**现象：** `Permission denied`

**解决：**
```bash
# 检查权限模式
openclaw config get plugins.entries.acpx.config.permissionMode

# 临时设置为 approve-all（谨慎使用）
openclaw config set plugins.entries.acpx.config.permissionMode "approve-all"
```

#### 会话超时

**现象：** 会话过早断开

**解决：**
```bash
# 增加 TTL
openclaw config set acp.runtime.ttlMinutes 240

# 调整超时设置
openclaw config set plugins.entries.acpx.config.timeoutSeconds 300
```

### 6.2 调试技巧

```bash
# 启用详细日志
openclaw acp -v client

# 查看网关日志
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log

# 检查 ACP 后端日志
tail -f ~/.openclaw/acpx/codex-acp-wrapper.stderr.*.log

# 运行诊断
openclaw doctor
```

---

## 6. 高级配置

### 6.1 多代理配置

```json5
{
  plugins: {
    entries: {
      acpx: {
        config: {
          agents: {
            devin: {
              command: "node",
              args: ["/path/to/devin-bridge.mjs"]
            },
            claude: {
              command: "node",
              args: ["/path/to/claude-bridge.mjs"]
            }
          }
        }
      }
    }
  }
}
```

### 6.2 多工作空间配置

```json5
{
  agents: {
    list: [
      {
        id: "personal",
        workspace: "~/.openclaw/workspace-personal",
        runtime: {
          type: "acp",
          acp: {
            agent: "devin",
            backend: "acpx",
            cwd: "~/.openclaw/workspace-personal"
          }
        }
      },
      {
        id: "work",
        workspace: "~/.openclaw/workspace-work",
        runtime: {
          type: "acp",
          acp: {
            agent: "devin",
            backend: "acpx",
            cwd: "~/.openclaw/workspace-work"
          }
        }
      }
    ]
  }
}
```

### 6.3 环境变量配置

某些配置可以通过环境变量设置：

| 变量 | 说明 |
|------|------|
| `OPENCLAW_GATEWAY_PORT` | 网关端口 |
| `OPENCLAW_STATE_DIR` | 状态目录 |
| `OPENCLAW_CONFIG_PATH` | 配置文件路径 |

---

## 7. 安全建议

1. **权限管理**：生产环境避免使用 `permissionMode: "approve-all"`
2. **工作目录隔离**：为不同代理使用独立的工作目录
3. **令牌管理**：使用 `openclaw secrets` 管理敏感信息
4. **日志审计**：定期检查日志文件
5. **网络隔离**：网关仅监听本地地址

---

## 8. 相关资源

- **官方文档**：https://docs.openclaw.ai/cli/acp
- **配置参考**：`openclaw config --help`
- **诊断工具**：`openclaw doctor`
- **状态检查**：`openclaw status`

---

## 9. 更新日志

- **2026.5.28**：当前版本，支持 acpx 后端
- **2026.4.10**：ACP 功能首次引入

---

## 10. 贡献

如有问题或建议，请访问：
- GitHub Issues
- OpenClaw 社区论坛
