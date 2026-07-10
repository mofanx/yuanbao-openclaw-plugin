/**
 * Custom slash command registry.
 *
 * Pluggable registry for personal/personal commands that should not be
 * hard-coded into the official pipeline. Commands self-register at module
 * load time and are dispatched by the custom-command-dispatcher middleware.
 */

import type { PipelineContext } from "../pipeline/types.js";

export interface CustomCommand {
  name: string;
  aliases?: string[];
  description: string;
  /** Only allow bot owner to execute. */
  requireOwner?: boolean;
  /** Handler returns true if the command was handled and the pipeline should stop. */
  handler: (ctx: PipelineContext) => Promise<boolean>;
}

const registry = new Map<string, CustomCommand>();

export function registerCustomCommand(cmd: CustomCommand): void {
  const keys = [cmd.name, ...(cmd.aliases ?? [])];
  for (const key of keys) {
    registry.set(key, { ...cmd, name: key });
  }
}

export function getCustomCommand(name: string): CustomCommand | undefined {
  return registry.get(name);
}

export function getCustomCommandNames(): string[] {
  return [...new Set([...registry.keys()])];
}
