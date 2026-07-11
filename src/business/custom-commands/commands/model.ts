/**
 * /model command — switch the Devin ACP model at runtime.
 *
 * Writes the selected model to ~/.config/devin/acp-model.json; the
 * devin-acp-auth-bridge reads this file when starting a new session.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sendText } from "../../actions/text/send.js";
import { registerPluginCommand } from "../../commands/command-sync/index.js";
import { registerCustomCommand } from "../registry.js";
import { extractCommandText, parseCommandParts } from "../utils.js";
import type { PipelineContext } from "../../pipeline/types.js";

const MODEL_FILE = join(homedir(), ".config", "devin", "acp-model.json");

/** Known Devin ACP model identifiers. Short aliases resolve to the latest version. */
export const KNOWN_MODELS: string[] = [
  "swe-1-6",
  "swe-1-7",
  "swe-1-6-fast",
  "swe-1-7-lightning",
  "swe-1-5",
  "swe-1",
  "swe-1-mini",
  "swe",
  "opus",
  "sonnet",
  "codex",
  "gemini",
  "gpt",
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-sonnet-4-1-20250805",
  "claude-opus-4-1-20250805",
];

function getAllowlist(): string[] {
  const extra = process.env.DEVIN_MODEL_ALLOWLIST;
  if (!extra) return [];
  return extra
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Return all valid model names including the static list and the env allowlist. */
export function getKnownModels(): string[] {
  return [...new Set([...KNOWN_MODELS, ...getAllowlist()])];
}

/** Check whether a model name is in the known list or the env allowlist. */
export function isValidModel(model: string): boolean {
  return getKnownModels().includes(model);
}

export function formatModelList(): string {
  const models = getKnownModels();
  const free = ["swe-1-6", "swe-1-7", "swe"];
  const others = models.filter((m) => !free.includes(m));
  return [
    "免费/默认：",
    ...free.filter((m) => models.includes(m)).map((m) => `  - ${m}`),
    "其他可用模型：",
    ...others.map((m) => `  - ${m}`),
  ].join("\n");
}

export function resolveCurrentModel(): string {
  if (existsSync(MODEL_FILE)) {
    try {
      const data = JSON.parse(readFileSync(MODEL_FILE, "utf8")) as { model?: string };
      if (data.model) return data.model;
    } catch {
      // ignore parse errors
    }
  }
  return process.env.DEVIN_MODEL ?? "default";
}

function parseModelArg(ctx: PipelineContext): string | undefined {
  const text = extractCommandText(ctx);
  const parts = parseCommandParts(text);
  // parts[0] is the command name; parts[1] is the model argument
  return parts[1] ?? undefined;
}

export async function sendReply(ctx: PipelineContext, text: string): Promise<void> {
  await sendText({
    text,
    dt: {
      isGroup: ctx.isGroup,
      target: ctx.isGroup ? ctx.groupCode! : ctx.fromAccount,
      account: ctx.account,
      fromAccount: ctx.account.botId,
      wsClient: ctx.wsClient,
      groupCode: ctx.groupCode,
    },
  });
}

const modelCommand = {
  name: "/model",
  aliases: ["/m"],
  description: "切换 Devin ACP 使用的模型，如 /model swe-1-7",
  requireOwner: true,
  handler: async (ctx: PipelineContext): Promise<boolean> => {
    const model = parseModelArg(ctx);

    if (!model) {
      const current = resolveCurrentModel();
      await sendReply(
        ctx,
        `当前模型：${current}\n\n${formatModelList()}\n\n用法：/model <模型名>\n查看模型列表：/models`,
      );
      return true;
    }

    if (model === "list") {
      await sendReply(ctx, `可用模型列表：\n\n${formatModelList()}\n\n当前模型：${resolveCurrentModel()}`);
      return true;
    }

    if (!isValidModel(model)) {
      await sendReply(
        ctx,
        `❌ 未知模型：${model}\n\n${formatModelList()}\n\n请使用列表中的模型名，或通过 DEVIN_MODEL_ALLOWLIST 环境变量添加额外模型。`,
      );
      return true;
    }

    mkdirSync(join(homedir(), ".config", "devin"), { recursive: true });
    writeFileSync(MODEL_FILE, JSON.stringify({ model, updatedAt: Date.now() }, null, 2));

    await sendReply(
      ctx,
      `✅ 已切换模型为 ${model}\n当前 Devin ACP 会话会立即尝试应用新模型。`,
    );
    return true;
  },
};

registerCustomCommand(modelCommand);
registerPluginCommand(modelCommand.name, modelCommand.description);
