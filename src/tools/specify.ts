import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";
import { runHelperScript } from "../scripts.js";
import { loadTemplate } from "../templates.js";

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

const DEFAULT_REQUIREMENTS_CHECKLIST = `# Requirements Checklist: {FEATURE}

**Created**: {DATE}

## Functional Requirements

- [ ] All FR-* requirements from spec.md have acceptance scenarios
- [ ] All acceptance scenarios are testable
- [ ] Edge cases are documented

## Non-Functional Requirements

- [ ] Performance expectations documented
- [ ] Security considerations noted
- [ ] Accessibility requirements noted (if applicable)

## Review

- [ ] Spec reviewed by stakeholder
- [ ] Ambiguities resolved or flagged with [NEEDS CLARIFICATION]
`;

const inputSchema = z.object({
  feature_name: featureNameSchema
    .optional()
    .describe("Name of the feature to specify (used as directory name)."),
  description: z
    .string()
    .optional()
    .describe(
      "Alternative to feature_name for unnamed features. Used as the spec description when feature_name is not provided."
    ),
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
        description: {
          type: "string",
          description:
            "Alternative to feature_name for unnamed features. Used as the spec description when feature_name is not provided.",
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
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);

    if (!input.feature_name && !input.description) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Either feature_name or description is required.",
          },
        ],
        isError: true,
      };
    }

    const root = resolveProjectRoot(input.project_path as string | undefined);
    const projectInfo = await checkProjectInitialized(root);
    const { scriptsDir, templatesDir } = projectInfo;

    const featureName = input.feature_name ?? "unnamed";
    const featureDir = path.join(root, "specs", featureName);
    assertPathWithinRoot(featureDir, root);
    const specPath = path.join(featureDir, "spec.md");

    // Try helper script first; fall back to manual directory creation
    let usedScript = false;
    const scriptResult = await runHelperScript(
      "create-new-feature",
      [featureName],
      { cwd: root, scriptsDir }
    );
    if (
      scriptResult.success &&
      scriptResult.json !== undefined &&
      typeof scriptResult.json === "object" &&
      scriptResult.json !== null &&
      "paths" in scriptResult.json
    ) {
      usedScript = true;
    }

    if (!usedScript) {
      await fs.mkdir(featureDir, { recursive: true });
    }

    const today = new Date().toISOString().split("T")[0];
    let specTemplate = await loadTemplate("spec-template", templatesDir, DEFAULT_SPEC);
    specTemplate = specTemplate
      .replace(/\{FEATURE\}/g, featureName)
      .replace(/\{DATE\}/g, today);
    if (input.description) {
      specTemplate = specTemplate.replace(
        /\{DESCRIPTION\}/g,
        input.description
      );
    }

    const content = input.content ?? specTemplate;

    await fs.writeFile(specPath, content, "utf-8");

    // Create checklists directory and requirements checklist
    const checklistsDir = path.join(featureDir, "checklists");
    await fs.mkdir(checklistsDir, { recursive: true });
    const requirementsChecklistPath = path.join(
      checklistsDir,
      "requirements.md"
    );
    const checklistContent = DEFAULT_REQUIREMENTS_CHECKLIST.replace(
      /\{FEATURE\}/g,
      featureName
    ).replace(/\{DATE\}/g, today);
    await fs.writeFile(requirementsChecklistPath, checklistContent, "utf-8");

    // Count [NEEDS CLARIFICATION] markers
    const clarificationCount = (
      content.match(/\[NEEDS CLARIFICATION\]/g) ?? []
    ).length;

    let responseText =
      `Specification created at ${specPath}\n` +
      `Requirements checklist created at ${requirementsChecklistPath}\n\n` +
      `Content:\n${content}`;

    if (clarificationCount > 3) {
      responseText +=
        `\n\n⚠ WARNING: This spec contains ${clarificationCount} [NEEDS CLARIFICATION] markers. ` +
        `Consider resolving ambiguities with speckit_clarify before proceeding to plan.`;
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
