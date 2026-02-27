import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";
import { runHelperScript } from "../scripts.js";
import { loadTemplate } from "../templates.js";

const DEFAULT_PLAN = `# Implementation Plan: {FEATURE}

**Date**: {DATE} | **Spec**: specs/{FEATURE}/spec.md

## Summary

[Extract from feature spec: primary requirement + technical approach]

## Technical Context

**Language/Version**: [e.g., TypeScript 5.x, Python 3.13]
**Primary Dependencies**: [e.g., React, FastAPI]
**Storage**: [e.g., PostgreSQL, SQLite, N/A]
**Testing**: [e.g., vitest, pytest]
**Target Platform**: [e.g., Web, CLI, Mobile]

## Project Structure

\`\`\`text
src/
├── [directory structure]
└── [based on project type]
\`\`\`

## Architecture

[Key architectural decisions and patterns]

## Implementation Approach

[Order of implementation, key dependencies]
`;

const inputSchema = z.object({
  feature_name: featureNameSchema.describe(
    "Name of the feature to create a plan for."
  ),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  phase: z
    .enum(["research", "design", "plan", "all"])
    .optional()
    .default("all")
    .describe(
      "Phase to write: research (research.md), design (data-model.md, contracts/, quickstart.md), plan (plan.md), all (plan.md, backward compat)."
    ),
  content: z
    .string()
    .optional()
    .describe("Plan content in markdown. If omitted, creates from template."),
  plan_content: z
    .string()
    .optional()
    .describe(
      "Explicit plan.md content. Supplements or replaces content param for the plan phase."
    ),
  research_content: z
    .string()
    .optional()
    .describe("Content for research.md (used when phase=research)."),
  data_model_content: z
    .string()
    .optional()
    .describe("Content for data-model.md (used when phase=design)."),
  contracts: z
    .array(z.object({ name: z.string(), content: z.string() }))
    .optional()
    .describe(
      "Array of contract documents to write under contracts/ (used when phase=design)."
    ),
  quickstart_content: z
    .string()
    .optional()
    .describe("Content for quickstart.md (used when phase=design)."),
});

export const planTool: ToolDef = {
  definition: {
    name: "speckit_plan",
    description:
      "Create or update a technical implementation plan. Creates specs/{feature}/plan.md with architecture, tech stack, and implementation approach. Also supports writing research and design artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature to plan.",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
        phase: {
          type: "string",
          enum: ["research", "design", "plan", "all"],
          description:
            "Phase to write: research (research.md), design (data-model.md, contracts/, quickstart.md), plan (plan.md), all (plan.md, backward compat).",
          default: "all",
        },
        content: {
          type: "string",
          description:
            "Plan content in markdown. If omitted, creates from template.",
        },
        plan_content: {
          type: "string",
          description:
            "Explicit plan.md content. Supplements or replaces content param for the plan phase.",
        },
        research_content: {
          type: "string",
          description:
            "Content for research.md (used when phase=research).",
        },
        data_model_content: {
          type: "string",
          description:
            "Content for data-model.md (used when phase=design).",
        },
        contracts: {
          type: "array",
          description:
            "Array of contract documents to write under contracts/ (used when phase=design).",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              content: { type: "string" },
            },
            required: ["name", "content"],
          },
        },
        quickstart_content: {
          type: "string",
          description:
            "Content for quickstart.md (used when phase=design).",
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = resolveProjectRoot(input.project_path as string | undefined);
    const projectInfo = await checkProjectInitialized(root);
    const { scriptsDir, templatesDir } = projectInfo;

    const featureDir = path.join(root, "specs", input.feature_name);
    assertPathWithinRoot(featureDir, root);

    // Gate: spec.md must exist before planning
    const specPath = path.join(featureDir, "spec.md");
    try {
      await fs.access(specPath);
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `spec.md must exist before planning. Run speckit_specify first.`,
          },
        ],
        isError: true,
      };
    }

    // Constitution gate: include constitution content as context
    let constitutionContext = "";
    const constitutionPath = path.join(
      root,
      ".specify",
      "memory",
      "constitution.md"
    );
    try {
      constitutionContext = await fs.readFile(constitutionPath, "utf-8");
    } catch {
      // No constitution — proceed without it
    }

    await fs.mkdir(featureDir, { recursive: true });

    const today = new Date().toISOString().split("T")[0];
    const writtenFiles: string[] = [];

    if (input.phase === "research") {
      if (!input.research_content) {
        return {
          content: [
            {
              type: "text" as const,
              text: "research_content is required for phase=research.",
            },
          ],
          isError: true,
        };
      }
      const researchPath = path.join(featureDir, "research.md");
      assertPathWithinRoot(researchPath, root);
      await fs.writeFile(researchPath, input.research_content, "utf-8");
      writtenFiles.push(researchPath);
    } else if (input.phase === "design") {
      if (input.data_model_content) {
        const dataModelPath = path.join(featureDir, "data-model.md");
        assertPathWithinRoot(dataModelPath, root);
        await fs.writeFile(dataModelPath, input.data_model_content, "utf-8");
        writtenFiles.push(dataModelPath);
      }

      if (input.contracts && input.contracts.length > 0) {
        const contractsDir = path.join(featureDir, "contracts");
        await fs.mkdir(contractsDir, { recursive: true });
        for (const contract of input.contracts) {
          const contractPath = path.join(contractsDir, `${contract.name}.md`);
          assertPathWithinRoot(contractPath, root);
          await fs.writeFile(contractPath, contract.content, "utf-8");
          writtenFiles.push(contractPath);
        }
      }

      if (input.quickstart_content) {
        const quickstartPath = path.join(featureDir, "quickstart.md");
        assertPathWithinRoot(quickstartPath, root);
        await fs.writeFile(quickstartPath, input.quickstart_content, "utf-8");
        writtenFiles.push(quickstartPath);
      }
    } else {
      // "plan" or "all" — write plan.md
      const planPath = path.join(featureDir, "plan.md");
      assertPathWithinRoot(planPath, root);

      let planTemplate = await loadTemplate(
        "plan-template",
        templatesDir,
        DEFAULT_PLAN
      );
      planTemplate = planTemplate
        .replace(/\{FEATURE\}/g, input.feature_name)
        .replace(/\{DATE\}/g, today);

      const finalContent =
        input.plan_content ?? input.content ?? planTemplate;

      await fs.writeFile(planPath, finalContent, "utf-8");
      writtenFiles.push(planPath);

      // Best-effort: run update-agent-context and setup-plan scripts
      await runHelperScript("update-agent-context", [input.feature_name], {
        cwd: root,
        scriptsDir,
      });
      await runHelperScript("setup-plan", [input.feature_name], {
        cwd: root,
        scriptsDir,
      });
    }

    const fileList = writtenFiles.join("\n");
    let responseText = `Files written:\n${fileList}`;

    if (constitutionContext) {
      responseText +=
        `\n\n--- Project Constitution (for reference) ---\n${constitutionContext}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: responseText,
        },
      ],
    };
  },
};
