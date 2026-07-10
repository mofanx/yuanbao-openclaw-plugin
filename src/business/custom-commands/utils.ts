/**
 * Shared utilities for custom command dispatch.
 */

import type { PipelineContext } from "../pipeline/types.js";

/**
 * Extract plain text content from the message body, ignoring custom elements
 * such as @mentions, link cards, etc. This mirrors guard-command's behavior
 * so that commands work the same way in both DMs and group chats.
 */
export function extractCommandText(ctx: PipelineContext): string {
  if (!ctx.raw.msg_body) return ctx.rawBody.trim();
  const text = ctx.raw.msg_body
    .filter(e => e.msg_type === "TIMTextElem")
    .map(e => e.msg_content?.text ?? "")
    .join("")
    .trim();
  return text || ctx.rawBody.trim();
}

/**
 * Split command text into [name, ...args].
 */
export function parseCommandParts(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}
