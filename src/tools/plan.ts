import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";

const inputSchema = z.object({
  feature_name: z.string().describe("Name of the feature to create a plan for."),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  content: z
    .string()
    .optional()
    .describe("Plan content in markdown. If omitted, creates from template."),
});

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

export const planTool: ToolDef = {
  definition: {
    name: "speckit_plan",
    description:
      "Create or update a technical implementation plan. Creates specs/{feature}/plan.md with architecture, tech stack, and implementation approach.",
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
        content: {
          type: "string",
          description:
            "Plan content in markdown. If omitted, creates from template.",
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = path.resolve(input.project_path);
    const featureDir = path.join(root, "specs", input.feature_name);
    const planPath = path.join(featureDir, "plan.md");

    await fs.mkdir(featureDir, { recursive: true });

    const content =
      input.content ??
      DEFAULT_PLAN.replace(/\{FEATURE\}/g, input.feature_name).replace(
        /\{DATE\}/g,
        new Date().toISOString().split("T")[0]
      );

    await fs.writeFile(planPath, content, "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Plan created at ${planPath}\n\nContent:\n${content}`,
        },
      ],
    };
  },
};
