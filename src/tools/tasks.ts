import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature to create tasks for."),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  content: z
    .string()
    .optional()
    .describe("Tasks content in markdown. If omitted, creates from template."),
});

const DEFAULT_TASKS = `# Tasks: {FEATURE}

**Input**: Design documents from specs/{FEATURE}/
**Prerequisites**: plan.md (required), spec.md (required)

## Phase 1: Setup

- [ ] T001 Initialize project structure per implementation plan
- [ ] T002 Install dependencies and configure build tools

## Phase 2: Core Implementation

- [ ] T003 Implement core data models
- [ ] T004 Implement primary business logic
- [ ] T005 Implement main interface (API/UI/CLI)

## Phase 3: Features

- [ ] T006 [P] Implement feature 1
- [ ] T007 [P] Implement feature 2

## Phase 4: Polish

- [ ] T008 Error handling and validation
- [ ] T009 Documentation
- [ ] T010 Testing

## Dependencies

- Phase 2 depends on Phase 1
- Phase 3 depends on Phase 2
- Phase 4 depends on Phase 3
`;

export const tasksTool: ToolDef = {
  definition: {
    name: "speckit_tasks",
    description:
      "Create or update a task breakdown. Creates specs/{feature}/tasks.md with phased, actionable tasks with dependencies and parallel opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature.",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
        content: {
          type: "string",
          description:
            "Tasks content in markdown. If omitted, creates from template.",
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
    const tasksPath = path.join(featureDir, "tasks.md");

    await fs.mkdir(featureDir, { recursive: true });

    const content =
      input.content ??
      DEFAULT_TASKS.replace(/\{FEATURE\}/g, input.feature_name);

    await fs.writeFile(tasksPath, content, "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Tasks created at ${tasksPath}\n\nContent:\n${content}`,
        },
      ],
    };
  },
};
