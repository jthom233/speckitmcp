import { runSpecKitCli, isSpecKitInstalled, INSTALL_INSTRUCTIONS } from "../cli.js";
import type { ToolDef } from "./index.js";

export const checkTool: ToolDef = {
  definition: {
    name: "speckit_check",
    description:
      "Check that spec-kit and all required tools are installed. Returns version and system information.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  async execute() {
    if (!(await isSpecKitInstalled())) {
      return {
        content: [{ type: "text" as const, text: INSTALL_INSTRUCTIONS }],
        isError: true,
      };
    }

    const versionResult = await runSpecKitCli(["version"], { timeout: 10_000 });
    const checkResult = await runSpecKitCli(["check"], { timeout: 30_000 });

    const output = [
      "=== spec-kit Version ===",
      versionResult.stdout,
      "=== Prerequisites Check ===",
      checkResult.stdout,
      checkResult.stderr,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      content: [{ type: "text" as const, text: output }],
      isError: checkResult.exitCode !== 0,
    };
  },
};
