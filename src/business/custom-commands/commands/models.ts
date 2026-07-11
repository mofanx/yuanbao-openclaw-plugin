/**
 * /models command — list available Devin ACP models.
 */

import { registerPluginCommand } from "../../commands/command-sync/index.js";
import { registerCustomCommand } from "../registry.js";
import {
  formatModelList,
  isValidModel,
  resolveCurrentModel,
  sendReply,
} from "./model.js";
import type { PipelineContext } from "../../pipeline/types.js";

const modelsCommand = {
  name: "/models",
  description: "列出可用的 Devin ACP 模型",
  requireOwner: true,
  handler: async (ctx: PipelineContext): Promise<boolean> => {
    const current = resolveCurrentModel();
    const currentHint = isValidModel(current) ? "" : "（该模型不在已知列表中）";
    await sendReply(
      ctx,
      `当前模型：${current}${currentHint}\n\n${formatModelList()}\n\n用法：/model <模型名>`,
    );
    return true;
  },
};

registerCustomCommand(modelsCommand);
registerPluginCommand(modelsCommand.name, modelsCommand.description);
