import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";

const inputSchema = z.object({
  feature_name: z.string().describe("Name of the feature to create a checklist for."),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  checklist_type: z
    .string()
    .optional()
    .default("validation")
    .describe("Type of checklist (validation, security, performance, accessibility, etc.)."),
  content: z
    .string()
    .optional()
    .describe("Checklist content in markdown. If omitted, creates from template."),
});

const DEFAULT_CHECKLIST = `# {TYPE} Checklist: {FEATURE}

**Purpose**: Validate {FEATURE} implementation against specification
**Created**: {DATE}
**Feature**: specs/{FEATURE}/spec.md

## Functional Requirements

- [ ] CHK001 All acceptance criteria from spec.md are met
- [ ] CHK002 Edge cases handled correctly
- [ ] CHK003 Error scenarios return appropriate feedback

## Code Quality

- [ ] CHK004 No hardcoded values or magic numbers
- [ ] CHK005 Error handling is comprehensive
- [ ] CHK006 Code follows project conventions

## Testing

- [ ] CHK007 Core functionality has tests
- [ ] CHK008 Tests pass reliably
- [ ] CHK009 Edge cases are tested

## Documentation

- [ ] CHK010 README updated with new features
- [ ] CHK011 API changes documented
- [ ] CHK012 Setup instructions accurate

## Notes

- Check items off as completed: \`[x]\`
- Add comments or findings inline
`;

export const checklistTool: ToolDef = {
  definition: {
    name: "speckit_checklist",
    description:
      "Create or update a validation checklist for a feature. Generates checklists for validation, security, performance, or accessibility.",
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
        checklist_type: {
          type: "string",
          description:
            "Type of checklist (validation, security, performance, accessibility).",
          default: "validation",
        },
        content: {
          type: "string",
          description:
            "Checklist content in markdown. If omitted, creates from template.",
        },
      },
      required: ["feature_name"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = path.resolve(input.project_path);
    const featureDir = path.join(root, "specs", input.feature_name);
    const checklistPath = path.join(featureDir, "checklist.md");

    await fs.mkdir(featureDir, { recursive: true });

    const content =
      input.content ??
      DEFAULT_CHECKLIST.replace(/\{FEATURE\}/g, input.feature_name)
        .replace(/\{DATE\}/g, new Date().toISOString().split("T")[0])
        .replace(/\{TYPE\}/g, input.checklist_type.charAt(0).toUpperCase() + input.checklist_type.slice(1));

    await fs.writeFile(checklistPath, content, "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Checklist created at ${checklistPath}\n\nContent:\n${content}`,
        },
      ],
    };
  },
};
