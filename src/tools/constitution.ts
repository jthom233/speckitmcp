import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { resolveProjectRoot } from "../project.js";
import { loadTemplate } from "../templates.js";

const EMBEDDED_TEMPLATE = `# Project Constitution

**Version**: 1.0.0
**Created**: {DATE}

## Core Principles

- [NEEDS CLARIFICATION] Define core principles for this project
- Prefer simplicity over complexity
- Code is read more than written — optimize for readability

## Technology Choices

**Language/Runtime**: [NEEDS CLARIFICATION]
**Frameworks**: [NEEDS CLARIFICATION]
**Storage**: [NEEDS CLARIFICATION]
**Testing**: [NEEDS CLARIFICATION]

## Quality Standards

- All public APIs must have documentation
- Test coverage must meet or exceed project baseline
- No unhandled promise rejections in production code

## Governance

- All changes require review before merge
- Breaking changes require a version bump
- Deprecations must be announced before removal
`;

const inputSchema = z.object({
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  action: z
    .enum(["read", "write", "create"])
    .optional()
    .default("read")
    .describe(
      "Action: read (get constitution), write (update constitution), or create (load template for AI to fill out)."
    ),
  content: z
    .string()
    .optional()
    .describe("New constitution content in markdown. Required for write action."),
  version_bump: z
    .enum(["major", "minor", "patch"])
    .optional()
    .describe(
      "On write action, bump the version in the constitution. major: X+1.0.0, minor: X.Y+1.0, patch: X.Y.Z+1."
    ),
  placeholders: z
    .record(z.string())
    .optional()
    .describe(
      "On create or write, replace [TOKEN] patterns in the content with the provided values. Keys are token names (without brackets)."
    ),
});

function applyVersionBump(
  content: string,
  bump: "major" | "minor" | "patch"
): string {
  return content.replace(
    /\*\*Version\*\*:\s*(\d+)\.(\d+)\.(\d+)/,
    (_match, major, minor, patch) => {
      const maj = parseInt(major, 10);
      const min = parseInt(minor, 10);
      const pat = parseInt(patch, 10);
      if (bump === "major") return `**Version**: ${maj + 1}.0.0`;
      if (bump === "minor") return `**Version**: ${maj}.${min + 1}.0`;
      return `**Version**: ${maj}.${min}.${pat + 1}`;
    }
  );
}

function applyPlaceholders(
  content: string,
  placeholders: Record<string, string>
): string {
  let result = content;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replace(new RegExp(`\\[${key}\\]`, "g"), value);
  }
  return result;
}

export const constitutionTool: ToolDef = {
  definition: {
    name: "speckit_constitution",
    description:
      "Read, create, or update the project constitution. The constitution defines core principles, technology choices, quality standards, and governance rules for the project.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
        action: {
          type: "string",
          enum: ["read", "write", "create"],
          description:
            "Action: read (get constitution), write (update constitution), or create (load template for AI to fill out).",
          default: "read",
        },
        content: {
          type: "string",
          description: "New constitution content (required for write action).",
        },
        version_bump: {
          type: "string",
          enum: ["major", "minor", "patch"],
          description:
            "On write action, bump the version in the constitution. major: X+1.0.0, minor: X.Y+1.0, patch: X.Y.Z+1.",
        },
        placeholders: {
          type: "object",
          description:
            "On create or write, replace [TOKEN] patterns with provided values. Keys are token names (without brackets).",
          additionalProperties: { type: "string" },
        },
      },
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = resolveProjectRoot(input.project_path as string | undefined);
    const templatesDir = path.join(root, ".specify", "templates");
    const constitutionPath = path.join(
      root,
      ".specify",
      "memory",
      "constitution.md"
    );

    if (input.action === "create") {
      const today = new Date().toISOString().split("T")[0];
      let template = await loadTemplate(
        "constitution-template",
        templatesDir,
        EMBEDDED_TEMPLATE
      );
      template = template.replace(/\{DATE\}/g, today);
      if (input.placeholders) {
        template = applyPlaceholders(template, input.placeholders);
      }
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Constitution template loaded. Fill in the [NEEDS CLARIFICATION] and [TOKEN] sections, then call speckit_constitution with action=write.\n\n` +
              template,
          },
        ],
      };
    }

    if (input.action === "read") {
      try {
        const content = await fs.readFile(constitutionPath, "utf-8");
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `No constitution found at ${constitutionPath}. Use action=create to generate a template, or initialize the project with speckit_init first.`,
            },
          ],
        };
      }
    }

    if (input.action === "write") {
      if (!input.content) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Content is required for write action.",
            },
          ],
          isError: true,
        };
      }

      let finalContent = input.content;

      if (input.version_bump) {
        finalContent = applyVersionBump(finalContent, input.version_bump);
      }

      if (input.placeholders) {
        finalContent = applyPlaceholders(finalContent, input.placeholders);
      }

      await fs.mkdir(path.dirname(constitutionPath), { recursive: true });
      await fs.writeFile(constitutionPath, finalContent, "utf-8");
      return {
        content: [
          {
            type: "text" as const,
            text: `Constitution updated at ${constitutionPath}`,
          },
        ],
      };
    }

    return {
      content: [{ type: "text" as const, text: "Invalid action." }],
      isError: true,
    };
  },
};
