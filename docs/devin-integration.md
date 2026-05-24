# Yuanbao ⇄ Devin CLI 集成指南

让用户在 **腾讯元宝（Yuanbao）** 里直接和 **[Devin CLI](https://cli.devin.ai/docs)** 对话。

本集成不修改本插件代码，纯配置即可。它复用 OpenClaw 内置的 ACP harness 路由能力，把 Devin CLI 注册为一个 acpx agent alias。

> **状态：A 极简路线**（基于 OpenClaw `acpx` 后端 + `devin acp` ACP 服务器）。已在 `devin 2026.5.6-12` 与 `openclaw 2026.5.6` / `@openclaw/acpx 2026.5.22` 上验证 ACP `initialize` 握手通过。

---

## 1. 工作原理

```
┌──────────┐   WebSocket    ┌────────────────┐   ACP/stdio   ┌────────────┐
│ 元宝 App │ ◀─────────────▶│ OpenClaw Gtwy  │ ◀──spawn────▶ │  devin acp │
└──────────┘                │  ├ yuanbao 插件 │               │ (子进程)   │
                            │  └ acpx 后端   │               └────────────┘
                            └────────────────┘
```

- **本插件**：负责元宝侧协议（消息收发、签名、群聊、流式 merge-text 等）。
- **OpenClaw acpx**：负责把消息派发给一个 ACP harness 子进程。
- **Devin CLI**：通过 `devin acp` 暴露 ACP 服务器，由 acpx 拉起并双向通信。

我们要做的只是告诉 acpx："`devin` 这个 agent id 对应的命令是 `devin acp`"。

---

## 2. 前置条件

| 依赖             | 最低版本              | 验证命令                                   |
| ---------------- | --------------------- | ------------------------------------------ |
| OpenClaw         | `2026.4.10+`          | `openclaw --version`                       |
| `@openclaw/acpx` | 跟随 OpenClaw 版本    | `openclaw plugins list` 看到 `acpx`        |
| Devin CLI        | 任意支持 `devin acp`  | `devin --version` 且 `devin acp --help` 有输出 |
| 本插件           | `2.13.5+`             | 已正常接入元宝（`openclaw channels list`） |

**Devin 必须已登录**：执行 `devin auth status` 应为已认证。Devin CLI 不会在 ACP 模式下提供交互式登录。

```bash
# 一次性安装/检查
openclaw plugins install @openclaw/acpx
openclaw config set plugins.entries.acpx.enabled true
devin auth status      # 应输出 logged in
devin acp --help       # 应出现 "Run as an ACP ... server over stdio"
```

---

## 3. 最小配置（推荐起步）

把下面的片段合并到你的 OpenClaw 配置（默认 `~/.openclaw/config.json5`）。完整可粘贴版本见 [`examples/devin-integration/openclaw.config.json5`](../examples/devin-integration/openclaw.config.json5)。

```json5
{
  // 1) 启用 ACP 调度并把 devin 加入白名单
  acp: {
    enabled: true,
    backend: "acpx",
    defaultAgent: "devin",
    allowedAgents: ["devin"],
    maxConcurrentSessions: 4,
    stream: {
      coalesceIdleMs: 300,   // 与元宝 outboundQueue idleMs 协调
      maxChunkChars: 1200,
    },
    runtime: { ttlMinutes: 120 },
  },

  // 2) acpx 注册 devin alias —— 关键一行
  plugins: {
    entries: {
      acpx: {
        enabled: true,
        config: {
          permissionMode: "approve-all",        // ACP 非交互，必须自动通过
          nonInteractivePermissions: "deny",    // 拒绝走优雅降级，避免 AcpRuntimeError
          probeAgent: "devin",                  // /acp doctor 用 devin 做健康探测
          agents: {
            devin: {
              command: "devin",
              args: ["acp"],
            },
          },
        },
      },
    },
  },

  // 3) 默认 agent 走 ACP harness，命中 devin alias
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
            mode: "persistent",   // 长驻 devin acp 进程，复用会话
            cwd: "~/.openclaw/workspace-devin",
          },
        },
      },
    ],
  },

  // 4) 元宝通道按常规配置（如已配好可跳过）
  channels: {
    yuanbao: {
      // appKey / appSecret 见本仓库 README
      dm: { policy: "open" },
      requireMention: true,
      outboundQueueStrategy: "merge-text",
      idleMs: 5000,
    },
  },
}
```

应用配置：

```bash
openclaw gateway restart
openclaw acp doctor      # 应报告 backend acpx healthy + devin reachable
```

如果 `acp doctor` 报告 `devin` 不可达，回到第 2 节检查 `devin acp` 单跑是否成功（见 [§6 验证脚本](#6-验证脚本)）。

---

## 4. 多 Agent / 多用户路由

按元宝 peer（用户/群）分流到不同 workspace + 不同 Devin 会话：

```json5
{
  agents: {
    list: [
      { id: "personal", workspace: "~/.openclaw/devin-personal",
        runtime: { type: "acp", acp: { agent: "devin", backend: "acpx", mode: "persistent", cwd: "~/.openclaw/devin-personal" } } },
      { id: "team",     workspace: "~/.openclaw/devin-team",
        runtime: { type: "acp", acp: { agent: "devin", backend: "acpx", mode: "persistent", cwd: "~/.openclaw/devin-team" } } },
    ],
  },
  bindings: [
    { agentId: "personal", match: { channel: "yuanbao", peer: { kind: "direct", id: "USER_ID_XX" } } },
    { agentId: "team",     match: { channel: "yuanbao", peer: { kind: "group",  id: "GROUP_ID_YY" } } },
  ],
}
```

每个 peer 拥有独立 Devin session（acpx 持久会话）和独立工作目录。

---

## 5. 元宝侧使用

正常 DM 或 @机器人 即可，所有现有元宝功能（merge-text 流式、`/help` `/status` `/new` `/stop` `/restart` `/compact`、quote reply）继续生效——它们由本插件处理，不会进入 Devin。

OpenClaw 的 `/acp` 系列管理命令（`/acp status` `/acp cancel` `/acp model` `/acp permissions`）也可在元宝聊天里发出，由 OpenClaw 网关本地处理。

> Devin 自己的 slash commands（如 `/help` `/exit`）目前**不映射**到元宝。若需要这种能力，看本仓库 README 的 "B 补强路线" 规划。

---

## 6. 验证脚本

```bash
node scripts/verify-devin-acp.mjs
```

该脚本：
1. 直接 spawn `devin acp` 子进程。
2. 通过 stdio 发送一个最小 ACP `initialize` JSON-RPC 请求。
3. 校验返回的 `protocolVersion`、`agentCapabilities`、`authMethods`。
4. 输出整段握手日志，便于排错。

通过该脚本不代表 OpenClaw 路径也通；OpenClaw 侧再用 `openclaw acp doctor` 复核。

---

## 7. 已知限制与权衡

- **权限**：`permissionMode: "approve-all"` 等于给 Devin 在 workspace 内完全自动放行（无 TTY 可批准）。**务必**把 `agents.list[].workspace` 设为独立目录，不要指向家目录或代码仓库根。
- **多账号鉴权**：Devin CLI 使用本机 `devin auth login` 的凭据；网关上跑多个 Devin alias 时它们共用同一份认证。
- **模型切换**：Devin ACP 是否支持 `session/set_model` 取决于 Devin 版本。`/acp model ...` 命令对 Devin 可能无效；改在 Devin 那边配 default model。
- **Devin ACP 协议变更**：若升级 Devin 后 `acp doctor` 突然报错，先看 Devin changelog 是否调整了协议字段；acpx 在 `protocolVersion` 协商失败时会回报错误。
- **Devin 工作目录与 cwd**：`agents.list[].runtime.acp.cwd` 决定 `devin acp` 启动时的工作目录；Devin 会以此为根读写文件，建议显式设置。

---

## 8. 故障排查

| 现象                                              | 排查                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `openclaw acp doctor` 报 `Harness command not found` | `which devin`；确认 `devin` 在 OpenClaw 服务用户的 PATH 中。                                  |
| `Agent not in allowlist`                          | `acp.allowedAgents` 是否包含 `"devin"`。                                                   |
| Devin 启动后立刻报 `Permission prompt unavailable` | `plugins.entries.acpx.config.permissionMode` 必须是 `"approve-all"`。                       |
| 元宝里收不到流式增量                                | 看 `acp.stream.coalesceIdleMs` 与 `channels.yuanbao.idleMs` 是否冲突，前者建议小于后者。 |
| Devin 子进程串话                                  | 给每个元宝 peer 配独立 `agents.list[]` + `bindings[]`，确保 `workspace` 与 `cwd` 不重叠。      |
| 鉴权失败                                          | `devin auth status`；网关 systemd 服务可能没继承用户环境，必要时在 service 里显式注入 `HOME`。 |

---

## 9. 升级路径

A 路线无新增代码，**官方上游同步零成本**。

若 A 跑通后觉得元宝 ↔ Devin 体验仍有缺口（如 Devin slash command 透传、Devin 工具元宝侧确认等），再切到 **B 补强路线** —— 在本仓库新增 `src/business/integrations/devin/` 子模块按需补强。届时仍兼容当前配置。
