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

function resolveCurrentModel(): string {
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

async function sendReply(ctx: PipelineContext, text: string): Promise<void> {
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
      await sendReply(ctx, `当前模型：${current}\n用法：/model <模型名>`);
      return true;
    }

    mkdirSync(join(homedir(), ".config", "devin"), { recursive: true });
    writeFileSync(MODEL_FILE, JSON.stringify({ model, updatedAt: Date.now() }, null, 2));

    await sendReply(
      ctx,
      `✅ 已切换模型为 ${model}\n新会话生效，当前会话可发送 /new 或等待会话超时后重建。`,
    );
    return true;
  },
};

registerCustomCommand(modelCommand);
registerPluginCommand(modelCommand.name, modelCommand.description);
