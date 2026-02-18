import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";

const inputSchema = z.object({
  feature_name: z.string().describe("Name of the feature to specify (used as directory name)."),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  content: z
    .string()
    .optional()
    .describe(
      "Specification content in markdown. If omitted, creates from template."
    ),
});

const DEFAULT_SPEC = `# Feature Specification: {FEATURE}

**Created**: {DATE}
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST [specific capability]

## Success Criteria

- **SC-001**: [Measurable metric]
`;

export const specifyTool: ToolDef = {
  definition: {
    name: "speckit_specify",
    description:
      "Create or update a feature specification. Creates specs/{feature}/spec.md with requirements, user stories, and acceptance criteria.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature (used as directory name).",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
        content: {
          type: "string",
          description:
            "Specification content in markdown. If omitted, creates from template.",
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = path.resolve(input.project_path);
    const featureDir = path.join(root, "specs", input.feature_name);
    const specPath = path.join(featureDir, "spec.md");

    await fs.mkdir(featureDir, { recursive: true });

    const content =
      input.content ??
      DEFAULT_SPEC.replace(/\{FEATURE\}/g, input.feature_name).replace(
        /\{DATE\}/g,
        new Date().toISOString().split("T")[0]
      );

    await fs.writeFile(specPath, content, "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Specification created at ${specPath}\n\nContent:\n${content}`,
        },
      ],
    };
  },
};
