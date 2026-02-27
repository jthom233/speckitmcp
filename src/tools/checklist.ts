import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";
import { loadTemplate } from "../templates.js";
import { runHelperScript } from "../scripts.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature to create a checklist for."),
  project_path: z
    .string()
    .optional()
    .describe("Path to the spec-kit project root."),
  // Primary param — descriptive name like "requirements", "api", "security"
  checklist_name: z
    .string()
    .optional()
    .describe(
      "Descriptive name for the checklist file (e.g., requirements, api, security). Saved as checklists/{checklist_name}.md."
    ),
  // Backward-compat alias — if checklist_type is passed, treat it as checklist_name
  checklist_type: z
    .string()
    .optional()
    .describe("Deprecated alias for checklist_name. Use checklist_name instead."),
  content: z
    .string()
    .optional()
    .describe("Checklist content in markdown. If omitted, creates from template."),
});

// Requirement quality checklist template (not an implementation verification checklist)
const DEFAULT_CHECKLIST = `# {NAME} Requirement Quality Checklist: {FEATURE}

**Purpose**: Assess specification quality for {FEATURE}
**Created**: {DATE}
**Source**: specs/{FEATURE}/spec.md

## Completeness

- [ ] CHK001 [Spec §FR] Are all functional requirements testable and measurable?
- [ ] CHK002 [Spec §NFR] Are non-functional requirements quantified (latency, throughput, availability)?
- [ ] CHK003 [Spec §User Stories] Does every user story have acceptance criteria (Given/When/Then)?

## Clarity

- [ ] CHK004 [Ambiguity] Are all vague quantifiers ("some", "many", "often") replaced with exact values?
- [ ] CHK005 [Ambiguity] Are all undefined terms and acronyms defined in the spec?
- [ ] CHK006 [Ambiguity] Are error handling behaviors specified for all failure modes?

## Coverage

- [ ] CHK007 [Gap] Are all external dependencies (APIs, services, libraries) identified?
- [ ] CHK008 [Gap] Are all integration touchpoints with other systems specified?
- [ ] CHK009 [Gap] Are data storage and schema requirements documented?

## Consistency

- [ ] CHK010 [Conflict] Do requirements contradict each other anywhere in the spec?
- [ ] CHK011 [Conflict] Are priorities assigned and conflict-free?
- [ ] CHK012 [Spec §SC] Do success criteria map to specific, verifiable requirements?

## Constitution Alignment

- [ ] CHK013 [Conflict] Does the spec align with technology choices in the project constitution?
- [ ] CHK014 [Conflict] Does the spec respect governance rules defined in the constitution?

## Notes

- Mark items as done: \`[x]\`
- Add inline findings or comments below each item
`;

export const checklistTool: ToolDef = {
  definition: {
    name: "speckit_checklist",
    description:
      "Create a requirement quality checklist for a feature. Generates checklists that assess spec quality (completeness, clarity, coverage, consistency) — not implementation status. Saved to specs/{feature}/checklists/{name}.md.",
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
        checklist_name: {
          type: "string",
          description:
            "Descriptive name for the checklist (e.g., requirements, api, security). Saved as checklists/{checklist_name}.md.",
        },
        checklist_type: {
          type: "string",
          description: "Deprecated alias for checklist_name.",
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
    const root = resolveProjectRoot(input.project_path as string | undefined);
    const featureDir = path.join(root, "specs", input.feature_name);
    assertPathWithinRoot(featureDir, root);

    // Resolve checklist name — checklist_name takes priority; fall back to checklist_type for compat
    const checklistName = input.checklist_name ?? input.checklist_type ?? "requirements";

    // Write to checklists/ subdirectory
    const checklistsDir = path.join(featureDir, "checklists");
    const checklistPath = path.join(checklistsDir, `${checklistName}.md`);
    assertPathWithinRoot(checklistPath, root);

    // Best-effort: try check-prerequisites script
    const projectInfo = await checkProjectInitialized(root);
    if (projectInfo.initialized) {
      runHelperScript("check-prerequisites", [], {
        cwd: root,
        scriptsDir: projectInfo.scriptsDir,
      }).catch(() => {
        // Script unavailable — proceed without it
      });
    }

    // Create checklists/ subdirectory
    await fs.mkdir(checklistsDir, { recursive: true });

    let content: string;
    if (input.content) {
      content = input.content;
    } else {
      const today = new Date().toISOString().split("T")[0];
      const nameLabel =
        checklistName.charAt(0).toUpperCase() + checklistName.slice(1);

      // Load from template if available; fall back to embedded default
      const template = await loadTemplate(
        `checklist-${checklistName}`,
        projectInfo.templatesDir,
        DEFAULT_CHECKLIST
      );

      content = template
        .replace(/\{FEATURE\}/g, input.feature_name)
        .replace(/\{DATE\}/g, today)
        .replace(/\{NAME\}/g, nameLabel);
    }

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
