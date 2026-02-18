import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature to analyze."),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
});

async function readFileOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

export const analyzeTool: ToolDef = {
  definition: {
    name: "speckit_analyze",
    description:
      "Analyze cross-artifact consistency for a feature. Checks that spec, plan, and tasks are aligned. Identifies gaps, contradictions, and missing items.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature to analyze.",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = path.resolve(input.project_path);
    const featureDir = path.join(root, "specs", input.feature_name);
    assertPathWithinRoot(featureDir, root);

    const spec = await readFileOrNull(path.join(featureDir, "spec.md"));
    const plan = await readFileOrNull(path.join(featureDir, "plan.md"));
    const tasks = await readFileOrNull(path.join(featureDir, "tasks.md"));
    const constitution = await readFileOrNull(
      path.join(root, ".specify", "memory", "constitution.md")
    );

    const lines: string[] = [
      `# Analysis Report: ${input.feature_name}`,
      `**Date**: ${new Date().toISOString().split("T")[0]}`,
      "",
      "## Artifact Inventory",
      "",
      `- Constitution: ${constitution ? "EXISTS" : "MISSING"}`,
      `- Specification: ${spec ? "EXISTS" : "MISSING"}`,
      `- Plan: ${plan ? "EXISTS" : "MISSING"}`,
      `- Tasks: ${tasks ? "EXISTS" : "MISSING"}`,
      "",
    ];

    // Check for NEEDS CLARIFICATION markers
    const allContent = [spec, plan, tasks].filter(Boolean).join("\n");
    const clarificationMatches = allContent.match(/NEEDS CLARIFICATION/gi);
    if (clarificationMatches) {
      lines.push(
        `## Unresolved Clarifications: ${clarificationMatches.length}`,
        ""
      );
    }

    // Check for placeholder patterns
    const placeholderPatterns = [
      /\[.*?\]/g, // [placeholder]
      /TODO/gi,
      /TBD/gi,
      /FIXME/gi,
    ];

    let placeholderCount = 0;
    for (const pattern of placeholderPatterns) {
      const matches = allContent.match(pattern);
      if (matches) placeholderCount += matches.length;
    }

    if (placeholderCount > 0) {
      lines.push(
        `## Placeholders Found: ~${placeholderCount}`,
        "(Note: Some may be intentional markdown links. Review manually.)",
        ""
      );
    }

    // Task completion status
    if (tasks) {
      const totalTasks = (tasks.match(/- \[[ x]\]/g) ?? []).length;
      const completedTasks = (tasks.match(/- \[x\]/g) ?? []).length;
      lines.push(
        "## Task Progress",
        "",
        `- Total tasks: ${totalTasks}`,
        `- Completed: ${completedTasks}`,
        `- Remaining: ${totalTasks - completedTasks}`,
        `- Progress: ${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%`,
        ""
      );
    }

    // Provide all artifacts for AI review
    lines.push("## Artifacts for Review", "");

    if (constitution) {
      lines.push("### Constitution", "```markdown", constitution, "```", "");
    }
    if (spec) {
      lines.push("### Specification", "```markdown", spec, "```", "");
    }
    if (plan) {
      lines.push("### Plan", "```markdown", plan, "```", "");
    }
    if (tasks) {
      lines.push("### Tasks", "```markdown", tasks, "```", "");
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
};
