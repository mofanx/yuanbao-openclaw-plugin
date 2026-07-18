# Changelog

## Unreleased

### 修复
- **fix:** `guard-command` 现在会剥离消息开头的 `@机器人` 前缀，确保群聊中 `@机器人 /acp spawn ...` 能正确识别为控制命令。
- **fix:** `customHandler` 对未知 `TIMCustomElem` 子类型增加兜底：如果 payload 中的 `text` 字段以 `/` 开头，则按 slash 命令处理，避免元宝命令菜单下发的 `/acp` 被识别为 `[当前消息暂不支持查看]`。
- **fix:** `build-context` 在发送者等于 `botOwnerId` 时，向消息上下文注入 `OwnerAllowFrom`，让 OpenClaw core 的 `isAuthorizedSender` 正确授权 `/acp` 等 owner 命令。
- **docs:** 在 `docs/devin-integration.md` 新增 `ACP_SESSION_INIT_FAILED: ACP metadata is missing` 故障排查：由 `acp.runtime.ttlMinutes` 默认 120 分钟导致 ACP runtime 空闲回收、Devin session 无法 resume 并触发元数据清理。

### Devin CLI 集成增强
- **feat:** 添加 `/model` 自定义命令，用于在元宝聊天中切换 Devin ACP 模型
- **feat:** 添加 `/models` 自定义命令，列出当前可用的 Devin ACP 模型
- **feat:** `/model` 命令增加模型名称校验，未知模型名会被拒绝并提示可用列表
- **feat:** 支持 `DEVIN_MODEL_ALLOWLIST` 环境变量扩展可切换模型列表
- **feat:** 桥接器支持 `~/.config/devin/acp-model.json` 文件热监听，实时调用 `session/set_config_option`
- **feat:** 中会话模型切换，切换模型后无需创建新会话，历史记录不丢失
- **docs:** 更新 `docs/devin-integration.md`，补充 `/model`、`/models` 命令、模型校验和插件更新说明
- **docs:** 更新 `docs/ubuntu-devin-tutorial.md`，补充模型切换校验说明
- **docs:** 同步文档与示例中 Devin 默认模型和 ACP runtime TTL 配置：默认模型示例统一为 `swe-1-7`，`acp.runtime.ttlMinutes` 示例统一为 `525600`（约一年），并说明不能填 `0`

## 2.17.0 (2026-07-02) - feat/devin-bridge

### Devin CLI 集成功能
- **feat:** 添加完整的 Devin CLI ACP 认证桥接器
- **feat:** 支持通过元宝直接与 Devin CLI 对话
- **feat:** 添加时间上下文感知，提升 Devin 时间相关请求处理
- **feat:** 输出处理重构，改进流式输出性能
- **feat:** 思考边界修复，改进 AI 回复格式化
- **docs:** 添加完整的 Devin CLI 集成文档
- **docs:** 添加 OpenClaw ACP 使用指南
- **docs:** 添加 Ubuntu 环境下完整教程
- **test:** 添加 Devin ACP 验证脚本
- **test:** 添加桥接器测试脚本

### 官方 v2.17.0 功能合并
- **feat:** 注入当前时间到 agent 上下文
- **refactor:** 用 StreamingOutputSession 替换 QueueSession
- **fix:** 修复思考边界换行规则
- **test:** 大幅提升测试覆盖率到 80%+
- **fix:** 修复 cron 工具输入格式
- **fix:** 修复 WebSocket 心跳异常

## 2.15.0 (2026-06-11)

- **feat:** 支持微信聊天记录解析

## 2.14.0 (2026-06-03)

- **feat:** 新增 QueryBotInfo 查询和缓存 bot 管理员信息
- **fix:** 修复 owner /stop 跳过群队列的问题
- **fix:** 修复 websocket 心跳丢失后未自动重连
- **fix:** 修复 build-context 处理可选 commandParts

## 2.13.5 (2026-05-27)

- **feat:** 文件下载缓存和历史媒体注入优化
- **fix:** /yuanbaobot-upgrade 修复 installed version 查询方式
- **fix:** 修复 COS SDK 构造函数异常
- **fix:** 群聊中仅 @ bot 时才执行 slash command 白名单校验
- **refactor:** COS 上传替换 SDK，改为直接 fetch 调用 API

## 2.13.4 (2026-05-18)

- **fix:** 修复 registerTool 注册异常
- **fix:** 修复 sourceReplyDeliveryMode 投递问题

## 2.13.3 (2026-05-18)

- **feat:** remind tool 功能更新
- **feat:** 版本号对比规则兼容 beta 版本
- **fix:** 修复 ws 运行时异常
- **fix:** 修复消息发送心跳异常

## 2.13.2 (2026-05-13)

- **feat:** markdown 表格渲染优化

## 2.13.1 (2026-05-09)

- **fix:** 修复消息投递异常

## 2.13.0 (2026-05-08)

- **feat:** 增加 openclaw 版本 >= 4.5 校验

## 2.12.0 (2026-04-28)

- **refactor:** 重构版本兼容性适配

## 2.11.0 (2026-04-24)

- **feat:** 群聊支持 bot 管理员使用 slash command
- **fix:** 修复消息串联问题

## 2.10.0 (2026-04-15)

- **feat:** 上下文格式支持
- **feat:** BOT 单聊支持快捷指令
- **fix:** Bot 兜底文案治理

## 2.9.1 (2026-04-10)

- **fix:** 修复群聊中同时 @ 两个 openclaw 机器人回答有误

## 2.9.0 (2026-04-09)

- **feat:** 图文发送优化（含 prompt hints 修改）
- **fix:** 修复 Lighthouse 镜像默认安装插件升级时误报失败
- **fix:** 修复私聊 markdown 复杂数学公式渲染不全

## 2.8.0 (2026-04-08)

- **fix:** 修复 MD 表格切割问题
- **fix:** 修复龙虾部分消息丢失、插件未收到

## 2.7.2 (2026-04-06)

- **fix:** 修复一系列 markdown 渲染问题

## 2.7.1 (2026-04-05)

- **fix:** 兼容模型输出使用 \`\`\` 包裹表格的场景

## 2.7.0 (2026-04-04)

- **feat:** 约束模型使用 \`\`\`markdown 包裹 md 文本
- **feat:** /status 支持显示 yuanbaobot 版本
- **feat:** /yuanbaobot-upgrade 支持指定版本
- **fix:** 修复上下文压缩时文案被插入正文中间
- **fix:** 修复龙虾思考/多轮回答时无分段返回、等待过久
- **perf:** MD 表格切割优化
- **refactor:** /yuanbaobot-upgrade 升级文案和输出内容优化

## 2.6.0 (2026-04-02)

- **fix:** 修复 /status 在长链接异常时未返回 false 状态
- **perf:** MD 表格切割方案优化

## 2.5.1 (2026-04-02)

- **fix:** 修复 openclaw 2026.3.31 版本安装被拦截

## 2.5.0 (2026-04-01)

- **feat:** 增加 seqID 和 traceID
- **fix:** 修复 looksLikeYuanbaoId 验证规则
- **fix:** 修复 formatPairingApproveHint API 兼容 3.13 环境
- **fix:** 优化 remind tool 避免模型幻觉导致定时任务异常
- **refactor:** /issue-log 文案更新

## 2.4.0 (2026-03-30)

- **feat:** Bot 私聊通路优化
- **fix:** 修复 Markdown 切割 bad case
- **fix:** 修复部分模型发文件后兜底文案异常

## 2.3.0 (2026-03-27)

- **feat:** 龙虾输入中状态支持
- **feat:** Bot 发图片/文件链路优化（prompt 改动）
- **fix:** 修复 markdown 切割时部分内容未被切割
- **perf:** 定时任务提示词优化

## 2.2.0 (2026-03-26)

- **feat:** 支持 /issue-log 和 /help 等 openclaw 自带命令
- **feat:** Markdown 切割方案
- **fix:** 修复 @ 龙虾识图时单张图被识别为两张
- **perf:** 定时任务优化

## 2.1.1 (2026-03-26)

- **fix:** 修复客户端私聊通知 push

## 2.1.0 (2026-03-25)

- **feat:** 2.x 插件兼容 2026.3.11 及以下版本
- **feat:** 支持 requireMention 配置控制群聊是否只响应 @
- **refactor:** 龙虾回复的消息若由元宝发出则不再使用引用回复
- **refactor:** 龙虾插件不回复兜底文案

## 2.0.1 (2026-03-24)

- **fix:** 修复 2026.3.23-2 定时任务失效
- **refactor:** Bot 主动私聊功能屏蔽

## 2.0.0 (2026-03-24)

- **feat:** 支持定时任务
- **feat:** 兼容 2026.3.22 版本
- **feat:** 支持 /yuanbaobot-upload-log
- **feat:** 插件撤回消息处理

## 1.0.11 (2026-03-21)

- **feat:** 支持 Bot 私聊成员
- **feat:** 支持 replyToMode=first
- **feat:** Bot 支持发送表情回复

## 1.0.10 (2026-03-20)

- **feat:** 支持 /yuanbaobot-upgrade 命令

## 1.0.9 (2026-03-20)

- **feat:** /yuanbao-upgrade 命令升级功能

## 1.0.8 (2026-03-20)

- **fix:** 修复 1.0.7 安装时间过长

## 1.0.7 (2026-03-19)

- **feat:** 龙虾执行复杂任务前先回复消息（可配置）
- **feat:** 插件兼容 channels.yuanbao.token 配置写法
- **fix:** 消除插件安装时触发 openclaw 安全扫描告警

## 1.0.6 (2026-03-18)

- **feat:** 支持本地 NO_REPLY 配置
- **feat:** 封装 PaiGroupService 提供 3 个 tool 供模型调用
- **feat:** Bot 支持发图片
- **feat:** Bot 支持接收用户文件
- **feat:** 群图片提问只支持 10 分钟内的最后一张图片

## 1.0.5 (2026-03-17)

- **feat:** 支持长文本拆分发送
- **feat:** 日志脱敏和规范化
- **feat:** 支持 /status 命令查看插件运行状态
- **feat:** 添加本地路径工具处理媒体文件
- **feat:** WS 连接重试逻辑优化
- **fix:** Bot 支持处理消息中的多个 @ 操作
- **fix:** 修复 @ 龙虾输出图片数量不一致
- **fix:** 修复 lighthouse 环境无法重装

## 1.0.4 (2026-03-17)

- **fix:** 版本回滚修复

## 1.0.3 (2026-03-16)

- **feat:** WS 支持多账号连接
- **feat:** 远程安装脚本支持参数传入
- **feat:** 更新 onboarding 引导流程
- **feat:** 群图片提问仅使用最后一张图片
- **fix:** 修复 protobuf 解码失败导致消息处理中断
- **fix:** 使用缩略图下载优化性能

## 1.0.2 (2026-03-16)

- **feat:** 修正 openclaw.plugin.json 中的版本号和描述字段

## 1.0.1 (2026-03-16)

- **fix:** 修复 1.0.0 发布配置，重新发版为 1.0.1

## 1.0.0 (2026-03-16)

- **feat:** 支持元宝派里群聊、私聊
- **feat:** 支持元宝派里设置定时任务
