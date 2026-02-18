import { z } from "zod";
import { runSpecKitCli, isSpecKitInstalled, INSTALL_INSTRUCTIONS } from "../cli.js";
import type { ToolDef } from "./index.js";

const inputSchema = z.object({
  project_path: z
    .string()
    .optional()
    .describe("Directory to initialize. Defaults to current directory."),
  project_name: z
    .string()
    .optional()
    .describe("Project name. If omitted, initializes in current directory with --here."),
  ai_agent: z
    .string()
    .optional()
    .default("claude")
    .describe("AI agent to configure for (claude, copilot, cursor-agent, etc.)"),
  script_type: z
    .enum(["sh", "ps"])
    .optional()
    .describe("Script type: sh (bash) or ps (powershell). Auto-detected if omitted."),
});

export const initTool: ToolDef = {
  definition: {
    name: "speckit_init",
    description:
      "Initialize a new spec-kit project. Creates .specify/ directory with templates, constitution, and agent command files.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Directory to initialize. Defaults to current directory.",
        },
        project_name: {
          type: "string",
          description:
            "Project name. If omitted, initializes in current directory with --here.",
        },
        ai_agent: {
          type: "string",
          description: "AI agent to configure for (claude, copilot, cursor-agent, etc.)",
          default: "claude",
        },
        script_type: {
          type: "string",
          enum: ["sh", "ps"],
          description: "Script type: sh (bash) or ps (powershell).",
        },
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);

    if (!(await isSpecKitInstalled())) {
      return {
        content: [{ type: "text" as const, text: INSTALL_INSTRUCTIONS }],
        isError: true,
      };
    }

    const cliArgs: string[] = ["init"];

    if (input.project_name) {
      cliArgs.push(input.project_name);
    } else {
      cliArgs.push("--here");
    }

    cliArgs.push("--ai", input.ai_agent ?? "claude");

    if (input.script_type) {
      cliArgs.push("--script", input.script_type);
    }

    cliArgs.push("--ignore-agent-tools");

    // Auto-accept the "directory not empty" prompt
    const result = await runSpecKitCli(cliArgs, {
      cwd: input.project_path,
      timeout: 120_000,
    });

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

    return {
      content: [{ type: "text" as const, text: output || "Project initialized successfully." }],
      isError: result.exitCode !== 0,
    };
  },
};
