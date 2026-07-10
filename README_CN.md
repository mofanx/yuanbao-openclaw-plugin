---
summary: "Yuanbao 机器人概览、功能与配置"
read_when:
  - 你想接入 Yuanbao 机器人
  - 你正在配置 Yuanbao 通道
title: Yuanbao
---

# Yuanbao

[English](./README.md)

腾讯元宝（Tencent Yuanbao）是腾讯的 AI 助手平台。OpenClaw 通道插件通过 WebSocket 将元宝机器人连接到 OpenClaw，使其可以通过私聊和群聊与用户交互。

**状态**：已可用于机器人私聊和群聊。WebSocket 是唯一支持的连接模式。

> **Devin CLI 集成**：本插件可与 [Devin CLI](https://cli.devin.ai/docs) 配合使用，让用户在元宝里直接对话 Devin。零代码改动，纯 OpenClaw `acpx` 配置即可。详见 [`docs/devin-integration.md`](docs/devin-integration.md)。

---

## 快速开始

> **需要 OpenClaw 2026.5.7 或更高版本。** 运行 `openclaw --version` 检查，使用 `openclaw update` 升级。
>
> **当前版本**：v2.17.0+ — 包含时间上下文感知、输出处理重构、流式输出优化等重要改进。

### 1. 添加 Yuanbao 通道

```bash
openclaw channels add --channel yuanbao --token "appKey:appSecret"
```

`--token` 使用 `appKey:appSecret` 的冒号分隔格式。你可以在元宝 App 的应用设置中创建机器人后获取。

### 2. 重启网关应用配置

```bash
openclaw gateway restart
```

### 交互式设置（可选）

也可以使用交互式向导：

```bash
openclaw channels login --channel yuanbao
```

按提示输入 App ID 和 App Secret 即可。

---

## 访问控制

### 私聊

通过 `dm.policy` 控制谁可以私信机器人：

- `"pairing"` — 未知用户收到配对码，通过 CLI 审批
- `"allowlist"` — 仅 `allowFrom` 列表中的用户可以聊天
- `"open"` — 允许所有用户（默认）
- `"disabled"` — 关闭所有私聊

**审批配对请求**：

```bash
openclaw pairing list yuanbao
openclaw pairing approve yuanbao <CODE>
```

### 群聊

**是否需要 @提及**（`channels.yuanbao.requireMention`）：

- `true` — 需要 @机器人（默认）
- `false` — 无需 @提及即可回复

在群聊中回复机器人的消息会被视为隐式 @提及。

---

## 配置示例

### 基础配置：开放私聊

```json5
{
  channels: {
    yuanbao: {
      appKey: "your_app_key",
      appSecret: "your_app_secret",
      dm: {
        policy: "open",
      },
    },
  },
}
```

### 限制私聊给指定用户

```json5
{
  channels: {
    yuanbao: {
      appKey: "your_app_key",
      appSecret: "your_app_secret",
      dm: {
        policy: "allowlist",
        allowFrom: ["user_id_1", "user_id_2"],
      },
    },
  },
}
```

### 关闭群聊 @提及要求

```json5
{
  channels: {
    yuanbao: {
      requireMention: false,
    },
  },
}
```

### 优化 outbound 消息发送

```json5
{
  channels: {
    yuanbao: {
      // 立即发送每条分块，不做缓冲
      outboundQueueStrategy: "immediate",
    },
  },
}
```

### 调整 merge-text 策略

```json5
{
  channels: {
    yuanbao: {
      outboundQueueStrategy: "merge-text",
      minChars: 2800, // 缓冲到该字符数后发送
      maxChars: 3000, // 超过该上限强制拆分
      idleMs: 5000,   // 空闲超时后自动刷新（毫秒）
    },
  },
}
```

---

## 常用命令

| 命令       | 说明                 |
| ---------- | -------------------- |
| `/help`    | 显示可用命令         |
| `/status`  | 显示机器人状态       |
| `/new`     | 开启新会话           |
| `/stop`    | 停止当前运行         |
| `/restart` | 重启 OpenClaw        |
| `/compact` | 压缩会话上下文       |

> 元宝支持原生 slash 命令菜单。网关启动时命令会自动同步到平台。

---

## 故障排查

### 群聊中机器人无响应

1. 确认机器人已加入群聊
2. 确认你 @提及了机器人（默认开启）
3. 查看日志：`openclaw logs --follow`

### 机器人收不到消息

1. 确认机器人已在元宝 App 中创建并通过审核
2. 确认 `appKey` 和 `appSecret` 配置正确
3. 确认网关正在运行：`openclaw gateway status`
4. 查看日志：`openclaw logs --follow`

### 机器人发送空回复或 fallback 回复

1. 检查 AI 模型是否返回了有效内容
2. 默认 fallback 回复为：`暂时无法解答，你可以换个问题问问我哦`
3. 可通过 `channels.yuanbao.fallbackReply` 自定义

### App Secret 泄露

1. 在元宝 App 中重置 App Secret
2. 更新配置中的值
3. 重启网关：`openclaw gateway restart`

---

## 高级配置

### 多账号

```json5
{
  channels: {
    yuanbao: {
      defaultAccount: "main",
      accounts: {
        main: {
          appKey: "key_xxx",
          appSecret: "secret_xxx",
          name: "Primary bot",
        },
        backup: {
          appKey: "key_yyy",
          appSecret: "secret_yyy",
          name: "Backup bot",
          enabled: false,
        },
      },
    },
  },
}
```

`defaultAccount` 控制 outbound API 未指定 `accountId` 时使用的默认账号。

### 消息限制

- `maxChars` — 单条消息最大字符数（默认：`3000`）
- `mediaMaxMb` — 媒体上传/下载大小限制（默认：`20` MB）
- `overflowPolicy` — 消息超出限制时的行为：`"split"`（默认）或 `"stop"`

### 流式输出

元宝支持块级流式输出。开启后，机器人在生成过程中会逐块发送文本。

```json5
{
  channels: {
    yuanbao: {
      disableBlockStreaming: false, // 默认开启块级流式
    },
  },
}
```

设置为 `true` 可在一条消息中发送完整回复。

### 群聊历史上下文

控制群聊中包含多少历史消息作为 AI 上下文：

```json5
{
  channels: {
    yuanbao: {
      historyLimit: 100, // 默认 100，设为 0 禁用
    },
  },
}
```

### 回复引用模式

控制群聊中机器人回复消息时的引用方式：

```json5
{
  channels: {
    yuanbao: {
      replyToMode: "first", // "off" | "first" | "all"（默认："first"）
    },
  },
}
```

| 值        | 行为                           |
| --------- | ------------------------------ |
| `"off"`   | 不引用                         |
| `"first"` | 每条入站消息只引用第一条回复   |
| `"all"`   | 引用所有回复                   |

### Markdown 提示注入

默认情况下，机器人会在系统提示中注入指令，防止 AI 模型将整条回复包裹在 markdown 代码块中。

```json5
{
  channels: {
    yuanbao: {
      markdownHintEnabled: true, // 默认 true
    },
  },
}
```

### 调试模式

为特定机器人 ID 开启未脱敏的日志输出：

```json5
{
  channels: {
    yuanbao: {
      debugBotIds: ["bot_user_id_1", "bot_user_id_2"],
    },
  },
}
```

### 多 Agent 路由

使用 `bindings` 将元宝私聊或群聊路由到不同 agent。

```json5
{
  agents: {
    list: [
      { id: "main" },
      { id: "agent-a", workspace: "/home/user/agent-a" },
      { id: "agent-b", workspace: "/home/user/agent-b" },
    ],
  },
  bindings: [
    {
      agentId: "agent-a",
      match: {
        channel: "yuanbao",
        peer: { kind: "direct", id: "user_xxx" },
      },
    },
    {
      agentId: "agent-b",
      match: {
        channel: "yuanbao",
        peer: { kind: "group", id: "group_zzz" },
      },
    },
  ],
}
```

路由字段：

- `match.channel`: `"yuanbao"`
- `match.peer.kind`: `"direct"`（私聊）或 `"group"`（群聊）
- `match.peer.id`: 用户 ID 或群聊代码

---

## 配置参考

完整配置说明：[Gateway configuration](/gateway/configuration)

| 配置项                                     | 说明                                             | 默认值                                 |
| ------------------------------------------ | ------------------------------------------------ | -------------------------------------- |
| `channels.yuanbao.enabled`                 | 启用/禁用通道                                    | `true`                                 |
| `channels.yuanbao.defaultAccount`          | outbound 路由默认账号                            | `default`                              |
| `channels.yuanbao.accounts.<id>.appKey`    | App Key（用于签名和 ticket 生成）                | —                                      |
| `channels.yuanbao.accounts.<id>.appSecret` | App Secret（用于签名）                           | —                                      |
| `channels.yuanbao.accounts.<id>.token`     | 预签名 token（跳过自动 ticket 签名）             | —                                      |
| `channels.yuanbao.accounts.<id>.name`      | 账号显示名称                                     | —                                      |
| `channels.yuanbao.accounts.<id>.enabled`   | 启用/禁用特定账号                                | `true`                                 |
| `channels.yuanbao.dm.policy`               | 私聊策略                                         | `open`                                 |
| `channels.yuanbao.dm.allowFrom`            | 私聊白名单（用户 ID 列表）                       | —                                      |
| `channels.yuanbao.requireMention`          | 群聊是否需要 @提及                               | `true`                                 |
| `channels.yuanbao.overflowPolicy`          | 长消息处理（`split` 或 `stop`）                  | `split`                                |
| `channels.yuanbao.replyToMode`             | 群聊回复引用策略（`off`、`first`、`all`）        | `first`                                |
| `channels.yuanbao.outboundQueueStrategy`   | outbound 策略（`merge-text` 或 `immediate`）     | `merge-text`                           |
| `channels.yuanbao.minChars`                | merge-text: 触发发送的最小字符数                 | `2800`                                 |
| `channels.yuanbao.maxChars`                | merge-text: 单条消息最大字符数                   | `3000`                                 |
| `channels.yuanbao.idleMs`                  | merge-text: 空闲超时自动刷新（毫秒）             | `5000`                                 |
| `channels.yuanbao.mediaMaxMb`              | 媒体大小限制（MB）                               | `20`                                   |
| `channels.yuanbao.historyLimit`            | 群聊历史上下文条数                               | `100`                                  |
| `channels.yuanbao.disableBlockStreaming`   | 禁用块级流式输出                                 | `false`                                |
| `channels.yuanbao.fallbackReply`           | AI 无内容时的 fallback 回复                      | `暂时无法解答，你可以换个问题问问我哦` |
| `channels.yuanbao.markdownHintEnabled`     | 注入防止 markdown 包裹的指令                     | `true`                                 |
| `channels.yuanbao.debugBotIds`             | 调试白名单机器人 ID（未脱敏日志）                | `[]`                                   |

---

## 支持的消息类型

### 接收

- ✅ 文本
- ✅ 图片
- ✅ 文件
- ✅ 音频 / 语音
- ✅ 视频
- ✅ 贴纸 / 自定义表情
- ✅ 自定义元素（链接卡片等）

### 发送

- ✅ 文本（支持 markdown）
- ✅ 图片
- ✅ 文件
- ✅ 音频
- ✅ 视频
- ✅ 贴纸

### 线程与回复

- ✅ 引用回复（通过 `replyToMode` 配置）
- ❌ Thread 回复（平台不支持）
