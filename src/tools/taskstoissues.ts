import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot } from "../project.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature whose tasks.md will be converted."),
  project_path: z
    .string()
    .optional()
    .describe("Path to the spec-kit project root. Defaults to current directory."),
  dry_run: z
    .boolean()
    .optional()
    .default(true)
    .describe("Preview issues that would be created without actually creating them. Defaults to true."),
  labels: z
    .array(z.string())
    .optional()
    .describe("Additional labels to attach to each created issue."),
});

interface ParsedTask {
  task_id: string;
  description: string;
  phase: string;
  completed: boolean;
  priority: string | null;
  user_story: string | null;
}

/**
 * Parse tasks.md content into structured task objects.
 * Handles lines matching: `- [ ] [TXXX] ...` or `- [x] [TXXX] ...`
 * Extracts priority tags like [P1], [P2] and user story tags like [US1].
 */
function parseTasks(content: string): ParsedTask[] {
  const lines = content.split("\n");
  const tasks: ParsedTask[] = [];
  let currentPhase = "General";

  for (const line of lines) {
    // Detect phase headings (## Phase N: Name or ## Name)
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      currentPhase = headingMatch[1].trim();
      continue;
    }

    // Match task lines: `- [ ] [TXXX] desc` or `- [x] [TXXX] desc`
    const taskMatch = line.match(/^- \[([ x])\] \[?(T\d+)\]?\s+(.*)/i);
    if (!taskMatch) continue;

    const completed = taskMatch[1] === "x";
    const task_id = taskMatch[2].toUpperCase();
    let rest = taskMatch[3].trim();

    // Extract priority tag [P1], [P2], etc.
    let priority: string | null = null;
    const priorityMatch = rest.match(/\[P(\d+)\]/i);
    if (priorityMatch) {
      priority = `P${priorityMatch[1]}`;
      rest = rest.replace(/\[P\d+\]\s*/i, "").trim();
    }

    // Extract user story tag [US1], [US2], etc.
    let user_story: string | null = null;
    const usMatch = rest.match(/\[US(\d+)\]/i);
    if (usMatch) {
      user_story = `US${usMatch[1]}`;
      rest = rest.replace(/\[US\d+\]\s*/i, "").trim();
    }

    tasks.push({
      task_id,
      description: rest,
      phase: currentPhase,
      completed,
      priority,
      user_story,
    });
  }

  return tasks;
}

/**
 * Build the label list for a task.
 */
function buildLabels(
  task: ParsedTask,
  extraLabels: string[]
): string[] {
  const labels: string[] = [];
  if (task.priority) labels.push(task.priority);
  labels.push(`phase:${task.phase.toLowerCase().replace(/\s+/g, "-")}`);
  if (task.user_story) labels.push(task.user_story);
  labels.push(...extraLabels);
  return labels;
}

/**
 * Run a shell command and return its stdout.
 */
function runCommand(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });
  });
}

export const tasksToIssuesTool: ToolDef = {
  definition: {
    name: "speckit_tasks_to_issues",
    description:
      "Convert spec-kit tasks to GitHub issues. Reads tasks.md and creates corresponding GitHub issues.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature whose tasks.md will be converted.",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root. Defaults to current directory.",
        },
        dry_run: {
          type: "boolean",
          description:
            "Preview issues that would be created without actually creating them. Defaults to true.",
          default: true,
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Additional labels to attach to each created issue.",
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = resolveProjectRoot(input.project_path);
    const featureDir = path.join(root, "specs", input.feature_name);
    assertPathWithinRoot(featureDir, root);
    const tasksPath = path.join(featureDir, "tasks.md");

    // Verify tasks.md exists
    let tasksContent: string;
    try {
      tasksContent = await fs.readFile(tasksPath, "utf-8");
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `tasks.md not found at ${tasksPath}. Run speckit_tasks first to generate it.`,
          },
        ],
        isError: true,
      };
    }

    // Verify git remote is GitHub
    const remoteResult = await runCommand("git", ["remote", "get-url", "origin"], root);
    if (remoteResult.exitCode !== 0 || !remoteResult.stdout) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Could not determine git remote origin. Make sure this project has a git remote named "origin".\n${remoteResult.stderr}`,
          },
        ],
        isError: true,
      };
    }
    const remoteUrl = remoteResult.stdout;
    if (!remoteUrl.includes("github.com")) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Remote origin is not a GitHub URL: ${remoteUrl}\nThis tool only supports GitHub repositories.`,
          },
        ],
        isError: true,
      };
    }

    // Parse tasks
    const allTasks = parseTasks(tasksContent);
    const pendingTasks = allTasks.filter((t) => !t.completed);

    if (allTasks.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No tasks found in ${tasksPath}. The file may not follow the expected format (e.g., \`- [ ] [T001] Description\`).`,
          },
        ],
        isError: true,
      };
    }

    const extraLabels = input.labels ?? [];

    if (input.dry_run) {
      // Dry-run: preview what would be created
      const lines: string[] = [
        `# Dry Run — Issues that would be created`,
        ``,
        `**Feature**: ${input.feature_name}`,
        `**Remote**: ${remoteUrl}`,
        `**Tasks found**: ${allTasks.length} total, ${pendingTasks.length} pending (${allTasks.length - pendingTasks.length} already completed, skipped)`,
        ``,
      ];

      if (pendingTasks.length === 0) {
        lines.push("All tasks are already completed. No issues would be created.");
      } else {
        lines.push(`## Issues to create (${pendingTasks.length})`);
        lines.push("");
        for (const task of pendingTasks) {
          const title = `[${task.task_id}] ${task.description}`;
          const labels = buildLabels(task, extraLabels);
          const body = [
            `**Feature**: ${input.feature_name}`,
            `**Phase**: ${task.phase}`,
            `**Task ID**: ${task.task_id}`,
            task.priority ? `**Priority**: ${task.priority}` : null,
            task.user_story ? `**User Story**: ${task.user_story}` : null,
            ``,
            `---`,
            `*Generated by spec-kit from \`specs/${input.feature_name}/tasks.md\`*`,
          ]
            .filter((l) => l !== null)
            .join("\n");

          lines.push(`### ${title}`);
          lines.push(`- **Labels**: ${labels.join(", ") || "(none)"}`);
          lines.push(`- **Body preview**:`);
          lines.push("  ```");
          body.split("\n").forEach((bl) => lines.push(`  ${bl}`));
          lines.push("  ```");
          lines.push("");
        }
        lines.push(`Run with \`dry_run: false\` to create these issues.`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }

    // Non-dry-run: create issues via `gh issue create`
    if (pendingTasks.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "All tasks are already completed. No issues to create.",
          },
        ],
      };
    }

    const results: string[] = [
      `# GitHub Issue Creation`,
      ``,
      `**Feature**: ${input.feature_name}`,
      `**Remote**: ${remoteUrl}`,
      `**Creating ${pendingTasks.length} issue(s)...**`,
      ``,
    ];

    let successCount = 0;
    let failCount = 0;

    for (const task of pendingTasks) {
      const title = `[${task.task_id}] ${task.description}`;
      const labels = buildLabels(task, extraLabels);
      const body = [
        `**Feature**: ${input.feature_name}`,
        `**Phase**: ${task.phase}`,
        `**Task ID**: ${task.task_id}`,
        task.priority ? `**Priority**: ${task.priority}` : null,
        task.user_story ? `**User Story**: ${task.user_story}` : null,
        ``,
        `---`,
        `*Generated by spec-kit from \`specs/${input.feature_name}/tasks.md\`*`,
      ]
        .filter((l) => l !== null)
        .join("\n");

      const ghArgs = [
        "issue",
        "create",
        "--title",
        title,
        "--body",
        body,
      ];

      if (labels.length > 0) {
        ghArgs.push("--label", labels.join(","));
      }

      const result = await runCommand("gh", ghArgs, root);

      if (result.exitCode === 0) {
        successCount++;
        results.push(`- [${task.task_id}] Created: ${result.stdout || "(no URL returned)"}`);
      } else {
        failCount++;
        results.push(
          `- [${task.task_id}] FAILED: ${result.stderr || "unknown error"}`
        );
      }
    }

    results.push(
      "",
      `## Summary`,
      `- Created: ${successCount}`,
      `- Failed: ${failCount}`,
      `- Total: ${pendingTasks.length}`
    );

    return {
      content: [{ type: "text" as const, text: results.join("\n") }],
      ...(failCount > 0 ? { isError: true } : {}),
    };
  },
};
