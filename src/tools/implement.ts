import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature being implemented."),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  task_id: z
    .string()
    .optional()
    .describe("Task ID to mark as complete (e.g., T001)."),
  action: z
    .enum(["read", "complete_task", "update_status"])
    .optional()
    .default("read")
    .describe(
      "Action: read (show tasks), complete_task (mark task done), update_status (update implementation notes)."
    ),
  notes: z
    .string()
    .optional()
    .describe("Implementation notes to append."),
});

export const implementTool: ToolDef = {
  definition: {
    name: "speckit_implement",
    description:
      "Track implementation progress for a feature. Read current tasks, mark tasks complete, or add implementation notes.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature being implemented.",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
        task_id: {
          type: "string",
          description: "Task ID to mark as complete (e.g., T001).",
        },
        action: {
          type: "string",
          enum: ["read", "complete_task", "update_status"],
          description: "Action to perform.",
          default: "read",
        },
        notes: {
          type: "string",
          description: "Implementation notes to append.",
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = path.resolve(input.project_path);
    const tasksPath = path.join(root, "specs", input.feature_name, "tasks.md");
    assertPathWithinRoot(tasksPath, root);

    try {
      let content = await fs.readFile(tasksPath, "utf-8");

      if (input.action === "read") {
        return {
          content: [{ type: "text" as const, text: content }],
        };
      }

      if (input.action === "complete_task" && input.task_id) {
        // Replace "- [ ] TXXX" with "- [x] TXXX"
        const pattern = new RegExp(
          `- \\[ \\] (${input.task_id}\\b)`,
          "g"
        );
        const updated = content.replace(pattern, "- [x] $1");

        if (updated === content) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Task ${input.task_id} not found or already completed.`,
              },
            ],
          };
        }

        await fs.writeFile(tasksPath, updated, "utf-8");
        return {
          content: [
            {
              type: "text" as const,
              text: `Task ${input.task_id} marked as complete.`,
            },
          ],
        };
      }

      if (input.action === "update_status" && input.notes) {
        content += `\n\n## Implementation Notes (${new Date().toISOString().split("T")[0]})\n\n${input.notes}\n`;
        await fs.writeFile(tasksPath, content, "utf-8");
        return {
          content: [
            {
              type: "text" as const,
              text: "Implementation notes added.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: "No action taken. Specify action and required parameters.",
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Tasks file not found at ${tasksPath}. Create tasks first with speckit_tasks.`,
          },
        ],
        isError: true,
      };
    }
  },
};
