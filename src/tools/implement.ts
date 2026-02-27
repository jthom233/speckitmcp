import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";
import { runHelperScript } from "../scripts.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature being implemented."),
  project_path: z
    .string()
    .optional()
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
      "Action: read (show tasks and related docs), complete_task (mark task done), update_status (update implementation notes)."
    ),
  notes: z
    .string()
    .optional()
    .describe("Implementation notes to append."),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Bypass the checklist gate when completing a task (default false)."),
});

/**
 * Read a file and return its content, or null if it does not exist.
 */
async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Scan a directory for markdown files and return their paths.
 * Returns an empty array if the directory does not exist.
 */
async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => path.join(dirPath, e));
  } catch {
    return [];
  }
}

export const implementTool: ToolDef = {
  definition: {
    name: "speckit_implement",
    description:
      "Track implementation progress for a feature. Read current tasks and related docs, mark tasks complete (with optional checklist gate), or add implementation notes.",
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
        force: {
          type: "boolean",
          description:
            "Bypass the checklist gate when completing a task (default false).",
          default: false,
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = resolveProjectRoot(input.project_path as string | undefined);
    const featureDir = path.join(root, "specs", input.feature_name);
    const tasksPath = path.join(featureDir, "tasks.md");
    assertPathWithinRoot(tasksPath, root);

    // Best-effort: try check-prerequisites script
    const projectInfo = await checkProjectInitialized(root);
    if (projectInfo.initialized) {
      runHelperScript("check-prerequisites", [], {
        cwd: root,
        scriptsDir: projectInfo.scriptsDir,
      }).catch(() => {
        // Script unavailable — proceed without it
      });
    }

    try {
      let tasksContent = await fs.readFile(tasksPath, "utf-8");

      // --- READ action ---
      if (input.action === "read") {
        const parts: string[] = [tasksContent];

        // Also include plan.md and other docs if they exist
        const extras: Array<{ label: string; file: string }> = [
          { label: "Plan", file: path.join(featureDir, "plan.md") },
          { label: "Research", file: path.join(featureDir, "research.md") },
          { label: "Data Model", file: path.join(featureDir, "data-model.md") },
        ];

        for (const { label, file } of extras) {
          const content = await readFileOrNull(file);
          if (content !== null) {
            parts.push(`\n\n---\n\n## ${label}\n\n${content}`);
          }
        }

        return {
          content: [{ type: "text" as const, text: parts.join("") }],
        };
      }

      // --- COMPLETE_TASK action ---
      if (input.action === "complete_task" && input.task_id) {
        // Checklist gate: scan checklists/ for incomplete items
        if (!input.force) {
          const checklistsDir = path.join(featureDir, "checklists");
          const checklistFiles = await listMarkdownFiles(checklistsDir);
          const incompleteItems: string[] = [];

          for (const file of checklistFiles) {
            const checklistContent = await readFileOrNull(file);
            if (checklistContent === null) continue;
            const checklistLines = checklistContent.split("\n");
            for (const cl of checklistLines) {
              if (/^- \[ \]/.test(cl)) {
                incompleteItems.push(`[${path.basename(file)}] ${cl.trim()}`);
              }
            }
          }

          if (incompleteItems.length > 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: [
                    `Cannot complete task ${input.task_id}: ${incompleteItems.length} checklist item${incompleteItems.length === 1 ? "" : "s"} remain incomplete.`,
                    "",
                    "Incomplete checklist items:",
                    ...incompleteItems.map((item) => `  ${item}`),
                    "",
                    "Resolve all checklist items first, or pass force=true to bypass this gate.",
                  ].join("\n"),
                },
              ],
              isError: true,
            };
          }
        }

        // Fix: capture full task line content after the checkbox, not just the ID
        const escapedId = input.task_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(
          `^(- \\[ \\])( \\[?${escapedId}\\b.*)$`,
          "gm"
        );
        const updated = tasksContent.replace(pattern, "- [x]$2");

        if (updated === tasksContent) {
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

      // --- UPDATE_STATUS action ---
      if (input.action === "update_status" && input.notes) {
        const today = new Date().toISOString().split("T")[0];
        tasksContent += `\n\n## Implementation Notes (${today})\n\n${input.notes}\n`;
        await fs.writeFile(tasksPath, tasksContent, "utf-8");
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
