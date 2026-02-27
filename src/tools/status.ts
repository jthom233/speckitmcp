import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";

const inputSchema = z.object({
  project_path: z
    .string()
    .optional()
    .describe("Path to the spec-kit project. Defaults to current directory."),
});

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function listFeatures(specsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(specsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listDirFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Parse tasks.md content and return completion stats.
 * Counts `- [x]` (completed) and `- [ ]` (pending) lines.
 */
function parseTaskStats(content: string): {
  completed: number;
  pending: number;
  total: number;
  percent: number;
} {
  const completedMatches = content.match(/^- \[x\] /gim) ?? [];
  const pendingMatches = content.match(/^- \[ \] /gim) ?? [];
  const completed = completedMatches.length;
  const pending = pendingMatches.length;
  const total = completed + pending;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, pending, total, percent };
}

export const statusTool: ToolDef = {
  definition: {
    name: "speckit_status",
    description:
      "Get the status of a spec-kit project. Shows which specs, plans, tasks, checklists, research, data-model, quickstart, and contracts exist.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to the spec-kit project. Defaults to current directory.",
        },
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = resolveProjectRoot(input.project_path);
    const project = await checkProjectInitialized(root);

    if (!project.initialized) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No spec-kit project found at ${root}. Run speckit_init to initialize.`,
          },
        ],
      };
    }

    const { specifyDir, specsDir, templatesDir, memoryDir } = project;

    const lines: string[] = [`# Spec-Kit Project Status`, `**Root**: ${root}`, ""];

    // Constitution
    const constitutionPath = path.join(memoryDir, "constitution.md");
    const hasConstitution = await fileExists(constitutionPath);
    lines.push(
      `## Constitution: ${hasConstitution ? "EXISTS" : "MISSING"}`,
      ""
    );

    // Templates
    if (await dirExists(templatesDir)) {
      const templates = await listDirFiles(templatesDir);
      lines.push(`## Templates: ${templates.length} available`, "");
    }

    // Features / Specs
    const features = await listFeatures(specsDir);
    if (features.length === 0) {
      lines.push("## Features: None yet", "");
    } else {
      lines.push(`## Features (${features.length})`, "");
      for (const feature of features) {
        const featureDir = path.join(specsDir, feature);

        const hasSpec = await fileExists(path.join(featureDir, "spec.md"));
        const hasPlan = await fileExists(path.join(featureDir, "plan.md"));
        const tasksPath = path.join(featureDir, "tasks.md");
        const hasTasks = await fileExists(tasksPath);
        const hasResearch = await fileExists(path.join(featureDir, "research.md"));
        const hasDataModel = await fileExists(path.join(featureDir, "data-model.md"));
        const hasQuickstart = await fileExists(path.join(featureDir, "quickstart.md"));

        // Checklists: check legacy flat file AND new directory
        const legacyChecklistPath = path.join(featureDir, "checklist.md");
        const checklistsDir = path.join(featureDir, "checklists");
        const hasLegacyChecklist = await fileExists(legacyChecklistPath);
        const hasChecklistsDir = await dirExists(checklistsDir);

        // Contracts directory
        const contractsDir = path.join(featureDir, "contracts");
        const hasContractsDir = await dirExists(contractsDir);

        lines.push(`### ${feature}`);
        lines.push(`- Spec: ${hasSpec ? "YES" : "NO"}`);
        lines.push(`- Plan: ${hasPlan ? "YES" : "NO"}`);

        // Tasks with completion stats
        if (hasTasks) {
          const tasksContent = await fs.readFile(tasksPath, "utf-8");
          const stats = parseTaskStats(tasksContent);
          if (stats.total > 0) {
            lines.push(
              `- Tasks: YES — ${stats.completed}/${stats.total} completed (${stats.percent}%)`
            );
          } else {
            lines.push(`- Tasks: YES`);
          }
        } else {
          lines.push(`- Tasks: NO`);
        }

        lines.push(`- Research: ${hasResearch ? "YES" : "NO"}`);
        lines.push(`- Data Model: ${hasDataModel ? "YES" : "NO"}`);
        lines.push(`- Quickstart: ${hasQuickstart ? "YES" : "NO"}`);

        // Checklists: report format found
        if (hasChecklistsDir) {
          const checklistFiles = await listDirFiles(checklistsDir);
          lines.push(`- Checklists: YES (directory, ${checklistFiles.length} file(s): ${checklistFiles.join(", ") || "none"})`);
        } else if (hasLegacyChecklist) {
          lines.push(`- Checklists: YES (legacy checklist.md)`);
        } else {
          lines.push(`- Checklists: NO`);
        }

        // Contracts directory
        if (hasContractsDir) {
          const contractFiles = await listDirFiles(contractsDir);
          lines.push(`- Contracts: YES (${contractFiles.length} file(s): ${contractFiles.join(", ") || "none"})`);
        } else {
          lines.push(`- Contracts: NO`);
        }

        lines.push("");
      }
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};
