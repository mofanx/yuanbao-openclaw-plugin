/**
 * Shared utilities for custom command dispatch.
 */

import type { PipelineContext } from "../pipeline/types.js";

/**
 * Strip a leading @bot mention token so slash commands like `/model` still match
 * when Yuanbao sends the message as `@机器人 /model` or as a custom @mention
 * element followed by a text element.
 */
function stripLeadingMention(text: string, ctx: PipelineContext): string {
  const trimmed = text.trim();

  // Try to remove the specific @bot mention text, if we know it.
  const botMention = ctx.mentions?.find(
    m => m.userId === ctx.account?.botId || (m.text && m.text.replace(/^@/, "") === ctx.account?.botId),
  );
  if (botMention?.text) {
    const mention = botMention.text.replace(/^@/, "");
    const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^@?${escaped}\\s*`, "i");
    const after = trimmed.replace(re, "").trim();
    if (after !== trimmed) return after;
  }

  // Fallback: strip any leading @... token (safe for command detection).
  const afterFallback = trimmed.replace(/^@[^\s]+\s*/, "").trim();
  if (afterFallback.startsWith("/")) return afterFallback;

  return trimmed;
}

/**
 * Extract plain text content from the message body, ignoring custom elements
 * such as @mentions, link cards, etc. This mirrors guard-command's behavior
 * so that commands work the same way in both DMs and group chats.
 */
export function extractCommandText(ctx: PipelineContext): string {
  let text: string;
  if (!ctx.raw.msg_body) {
    text = ctx.rawBody.trim();
  } else {
    text = ctx.raw.msg_body
      .filter(e => e.msg_type === "TIMTextElem")
      .map(e => e.msg_content?.text ?? "")
      .join("")
      .trim();
    if (!text) text = ctx.rawBody.trim();
  }
  return stripLeadingMention(text, ctx);
}

/**
 * Split command text into [name, ...args].
 */
export function parseCommandParts(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}
