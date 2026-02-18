import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";

const inputSchema = z.object({
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  action: z
    .enum(["read", "write"])
    .optional()
    .default("read")
    .describe("Action: read (get constitution) or write (update constitution)."),
  content: z
    .string()
    .optional()
    .describe("New constitution content in markdown. Required for write action."),
});

export const constitutionTool: ToolDef = {
  definition: {
    name: "speckit_constitution",
    description:
      "Read or update the project constitution. The constitution defines core principles, technology choices, quality standards, and governance rules for the project.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
        action: {
          type: "string",
          enum: ["read", "write"],
          description: "Action: read or write.",
          default: "read",
        },
        content: {
          type: "string",
          description: "New constitution content (required for write action).",
        },
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = path.resolve(input.project_path);
    const constitutionPath = path.join(root, ".specify", "memory", "constitution.md");

    if (input.action === "read") {
      try {
        const content = await fs.readFile(constitutionPath, "utf-8");
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `No constitution found at ${constitutionPath}. Initialize the project with speckit_init first.`,
            },
          ],
        };
      }
    }

    if (input.action === "write") {
      if (!input.content) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Content is required for write action.",
            },
          ],
          isError: true,
        };
      }

      await fs.mkdir(path.dirname(constitutionPath), { recursive: true });
      await fs.writeFile(constitutionPath, input.content, "utf-8");
      return {
        content: [
          {
            type: "text" as const,
            text: `Constitution updated at ${constitutionPath}`,
          },
        ],
      };
    }

    return {
      content: [{ type: "text" as const, text: "Invalid action." }],
      isError: true,
    };
  },
};
