import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";

const inputSchema = z.object({
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project. Defaults to current directory."),
});

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
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

export const statusTool: ToolDef = {
  definition: {
    name: "speckit_status",
    description:
      "Get the status of a spec-kit project. Shows which specs, plans, tasks, and checklists exist.",
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
    const root = path.resolve(input.project_path);
    const specifyDir = path.join(root, ".specify");
    const specsDir = path.join(root, "specs");

    if (!(await dirExists(specifyDir))) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No spec-kit project found at ${root}. Run speckit_init to initialize.`,
          },
        ],
      };
    }

    const lines: string[] = [`# Spec-Kit Project Status`, `**Root**: ${root}`, ""];

    // Constitution
    const constitutionPath = path.join(specifyDir, "memory", "constitution.md");
    const hasConstitution = await fileExists(constitutionPath);
    lines.push(
      `## Constitution: ${hasConstitution ? "EXISTS" : "MISSING"}`,
      ""
    );

    // Templates
    const templatesDir = path.join(specifyDir, "templates");
    if (await dirExists(templatesDir)) {
      const templates = await fs.readdir(templatesDir);
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
        const hasTasks = await fileExists(path.join(featureDir, "tasks.md"));
        const hasChecklist = await fileExists(
          path.join(featureDir, "checklist.md")
        );

        lines.push(`### ${feature}`);
        lines.push(`- Spec: ${hasSpec ? "YES" : "NO"}`);
        lines.push(`- Plan: ${hasPlan ? "YES" : "NO"}`);
        lines.push(`- Tasks: ${hasTasks ? "YES" : "NO"}`);
        lines.push(`- Checklist: ${hasChecklist ? "YES" : "NO"}`);
        lines.push("");
      }
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};
