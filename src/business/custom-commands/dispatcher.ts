/**
 * Custom command dispatcher middleware.
 *
 * Runs before the SDK's guard-command so that personal commands are
 * handled without needing to be registered in the global command registry.
 */

import { sendText } from "../actions/text/send.js";
import type { DeliverTarget } from "../actions/deliver.js";
import type { MiddlewareDescriptor } from "../pipeline/types.js";
import { getCustomCommand } from "./registry.js";
import { extractCommandText, parseCommandParts } from "./utils.js";
import "./loader.js";

function buildDeliverTarget(ctx: Parameters<MiddlewareDescriptor["handler"]>[0]): DeliverTarget {
  return {
    isGroup: ctx.isGroup,
    target: ctx.isGroup ? ctx.groupCode! : ctx.fromAccount,
    account: ctx.account,
    fromAccount: ctx.account.botId,
    wsClient: ctx.wsClient,
    groupCode: ctx.groupCode,
  };
}

export const customCommandDispatcher: MiddlewareDescriptor = {
  name: "custom-command-dispatcher",
  handler: async (ctx, next) => {
    const text = extractCommandText(ctx);
    if (!text.startsWith("/")) {
      await next();
      return;
    }

    const parts = parseCommandParts(text);
    const cmdName = parts[0];
    if (!cmdName) {
      await next();
      return;
    }

    const cmd = getCustomCommand(cmdName);
    if (!cmd) {
      await next();
      return;
    }

    // Group chat: custom commands require @bot mention, except in DMs.
    if (ctx.isGroup && !ctx.isAtBot) {
      await next();
      return;
    }

    if (cmd.requireOwner) {
      const ownerId = ctx.account.botOwnerId || ctx.raw.bot_owner_id;
      if (!ownerId || ctx.raw.from_account !== ownerId) {
        await sendText({
          text: "⚠️ 该命令仅 Bot 创建人可用。",
          dt: buildDeliverTarget(ctx),
        });
        return;
      }
    }

    const handled = await cmd.handler(ctx);
    if (!handled) {
      await next();
    }
  },
};
