import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature to clarify."),
  project_path: z
    .string()
    .optional()
    .default(".")
    .describe("Path to the spec-kit project root."),
  questions: z
    .array(z.string())
    .optional()
    .describe("List of clarification questions to add."),
  answers: z
    .record(z.string())
    .optional()
    .describe("Map of question index to answer."),
});

export const clarifyTool: ToolDef = {
  definition: {
    name: "speckit_clarify",
    description:
      "Manage clarification questions for a feature. Identify ambiguities in specs, add questions, and record answers. Helps de-risk before planning.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature to clarify.",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
        },
        questions: {
          type: "array",
          items: { type: "string" },
          description: "List of clarification questions to add.",
        },
        answers: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Map of question number to answer.",
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
    const clarifyPath = path.join(featureDir, "clarifications.md");

    await fs.mkdir(featureDir, { recursive: true });

    let content: string;
    try {
      content = await fs.readFile(clarifyPath, "utf-8");
    } catch {
      content = `# Clarifications: ${input.feature_name}\n\n**Created**: ${new Date().toISOString().split("T")[0]}\n\n`;
    }

    if (input.questions && input.questions.length > 0) {
      content += "\n## Open Questions\n\n";
      for (const q of input.questions) {
        content += `- [ ] ${q}\n`;
      }
    }

    if (input.answers) {
      for (const [key, answer] of Object.entries(input.answers)) {
        content += `\n### Answer to Q${key}\n\n${answer}\n`;
      }
    }

    await fs.writeFile(clarifyPath, content, "utf-8");

    return {
      content: [
        {
          type: "text" as const,
          text: `Clarifications updated at ${clarifyPath}\n\nContent:\n${content}`,
        },
      ],
    };
  },
};
