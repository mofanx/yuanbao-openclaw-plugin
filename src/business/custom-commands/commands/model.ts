/**
 * /model command — switch the Devin ACP model at runtime.
 *
 * Writes the selected model to ~/.config/devin/acp-model.json; the
 * devin-acp-auth-bridge reads this file when starting a new session.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sendText } from "../../actions/text/send.js";
import { registerPluginCommand } from "../../commands/command-sync/index.js";
import { registerCustomCommand } from "../registry.js";
import { extractCommandText, parseCommandParts } from "../utils.js";
import type { PipelineContext } from "../../pipeline/types.js";

const DEVIN_CONFIG_DIR = join(homedir(), ".config", "devin");
const MODEL_FILE = join(DEVIN_CONFIG_DIR, "acp-model.json");
const USER_MODELS_FILE = join(DEVIN_CONFIG_DIR, "acp-models.json");

/** Minimal fallback when no config file is found. */
const FALLBACK_MODELS: string[] = ["swe-1-6", "swe-1-7"];
const FALLBACK_FREE: string[] = ["swe-1-6", "swe-1-7"];

/** Path to the default-models.json shipped with the plugin (in scripts/ dir). */
function resolveDefaultModelsPath(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    // Walk up until we find scripts/default-models.json (handles dist/ or dist/src/ layouts)
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, "scripts", "default-models.json");
      if (existsSync(candidate)) return candidate;
      dir = dirname(dir);
    }
  } catch {
    // ignore
  }
  return join(homedir(), ".openclaw", "extensions", "openclaw-plugin-yuanbao", "scripts", "default-models.json");
}

type ModelsConfig = { models: string[]; free: string[] };

function readModelsJson(filePath: string): ModelsConfig | null {
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8")) as Partial<ModelsConfig>;
    const models = Array.isArray(data.models)
      ? data.models.filter((m): m is string => typeof m === "string" && m.length > 0)
      : [];
    if (models.length > 0) {
      const free = Array.isArray(data.free)
        ? data.free.filter((m): m is string => typeof m === "string" && models.includes(m))
        : [];
      return { models, free };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function getAllowlist(): string[] {
  const extra = process.env.DEVIN_MODEL_ALLOWLIST;
  if (!extra) return [];
  return extra
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Resolve the full model list using layered config:
 *   1. DEVIN_MODEL_ALLOWLIST env var (always appended)
 *   2. ~/.config/devin/acp-models.json (user override, replaces defaults if present)
 *   3. scripts/default-models.json (shipped with plugin)
 *   4. hardcoded fallback
 */
function resolveModelsConfig(): ModelsConfig {
  // Layer 2: user override
  const userConfig = readModelsJson(USER_MODELS_FILE);
  if (userConfig) {
    return { models: [...new Set([...userConfig.models, ...getAllowlist()])], free: userConfig.free };
  }

  // Layer 3: shipped defaults
  const defaultConfig = readModelsJson(resolveDefaultModelsPath());
  if (defaultConfig) {
    return { models: [...new Set([...defaultConfig.models, ...getAllowlist()])], free: defaultConfig.free };
  }

  // Layer 4: fallback
  return { models: [...new Set([...FALLBACK_MODELS, ...getAllowlist()])], free: FALLBACK_FREE };
}

/** Return all valid model names. */
export function getKnownModels(): string[] {
  return resolveModelsConfig().models;
}

/** Check whether a model name is in the known list. */
export function isValidModel(model: string): boolean {
  return getKnownModels().includes(model);
}

export function formatModelList(): string {
  const { models, free } = resolveModelsConfig();
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
        `❌ 未知模型：${model}\n\n${formatModelList()}\n\n请使用列表中的模型名。如需添加自定义模型，可编辑 ~/.config/devin/acp-models.json 或设置 DEVIN_MODEL_ALLOWLIST 环境变量。`,
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
