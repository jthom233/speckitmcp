import { getSpecKitVersion, isSpecKitInstalled, INSTALL_INSTRUCTIONS } from "../cli.js";
import type { ToolDef } from "./index.js";

export const versionTool: ToolDef = {
  definition: {
    name: "speckit_version",
    description:
      "Get version information for both the MCP server and the spec-kit CLI.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  async execute() {
    const lines: string[] = [
      "=== MCP Server ===",
      "spec-kit-mcp v1.0.0",
      "",
    ];

    if (await isSpecKitInstalled()) {
      try {
        const cliVersion = await getSpecKitVersion();
        lines.push("=== spec-kit CLI ===", cliVersion);
      } catch {
        lines.push("=== spec-kit CLI ===", "Installed but version check failed.");
      }
    } else {
      lines.push("=== spec-kit CLI ===", INSTALL_INSTRUCTIONS);
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};
