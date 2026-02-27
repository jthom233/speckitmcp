import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";
import { runHelperScript } from "../scripts.js";
import { loadTemplate } from "../templates.js";

const DEFAULT_TASKS = `# Tasks: {FEATURE}

**Input**: Design documents from specs/{FEATURE}/
**Prerequisites**: plan.md (required), spec.md (required)

## Phase 1: Setup

- [ ] [T001] [P1] Initialize project structure per implementation plan
- [ ] [T002] [P1] Install dependencies and configure build tools

## Phase 2: Foundational

- [ ] [T003] [P1] Implement core data models
- [ ] [T004] [P1] Implement primary business logic
- [ ] [T005] [P1] Implement main interface (API/UI/CLI)

## Phase 3: User Stories — P1

- [ ] [T006] [P1] [US1] [Brief user story title — replace me]

## Phase 4: User Stories — P2

- [ ] [T007] [P2] [US2] [Brief user story title — replace me]

## Phase 5: User Stories — P3+

- [ ] [T008] [P3] [US3] [Brief user story title — replace me]

## Phase 6: Polish

- [ ] [T009] [P1] Error handling and input validation
- [ ] [T010] [P1] Documentation
- [ ] [T011] [P1] Testing and coverage

## Dependencies

- Phase 2 depends on Phase 1
- Phase 3 depends on Phase 2
- Phase 4 depends on Phase 3 (can start early)
- Phase 5 depends on Phase 3 (can start early)
- Phase 6 depends on all previous phases
`;

const inputSchema = z.object({
  feature_name: featureNameSchema.describe(
    "Name of the feature to create tasks for."
  ),
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
    const root = resolveProjectRoot(input.project_path as string | undefined);
    const projectInfo = await checkProjectInitialized(root);
    const { scriptsDir, templatesDir } = projectInfo;

    const featureDir = path.join(root, "specs", input.feature_name);
    assertPathWithinRoot(featureDir, root);
    const tasksPath = path.join(featureDir, "tasks.md");

    // Gate: spec.md must exist
    const specPath = path.join(featureDir, "spec.md");
    try {
      await fs.access(specPath);
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `spec.md must exist before creating tasks. Run speckit_specify first.`,
          },
        ],
        isError: true,
      };
    }

    // Gate: plan.md must exist
    const planPath = path.join(featureDir, "plan.md");
    try {
      await fs.access(planPath);
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `plan.md must exist before creating tasks. Run speckit_plan first.`,
          },
        ],
        isError: true,
      };
    }

    // Best-effort: run check-prerequisites script
    await runHelperScript("check-prerequisites", [input.feature_name], {
      cwd: root,
      scriptsDir,
    });

    await fs.mkdir(featureDir, { recursive: true });

    const tasksTemplate = await loadTemplate(
      "tasks-template",
      templatesDir,
      DEFAULT_TASKS
    );
    const content =
      input.content ??
      tasksTemplate.replace(/\{FEATURE\}/g, input.feature_name);

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
