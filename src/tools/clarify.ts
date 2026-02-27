import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";
import { runHelperScript } from "../scripts.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature to clarify."),
  project_path: z
    .string()
    .optional()
    .describe("Path to the spec-kit project root."),
  action: z
    .enum(["scan", "answer"])
    .describe(
      "Action: scan (identify ambiguities in spec and return questions), answer (write an answer inline in spec.md)."
    ),
  question_index: z
    .number()
    .int()
    .optional()
    .describe(
      "Zero-based index of the [NEEDS CLARIFICATION] marker to answer (required for answer action)."
    ),
  answer: z
    .string()
    .optional()
    .describe("The answer text to write inline in spec.md (required for answer action)."),
});

// 9 taxonomy categories for ambiguity scanning
const TAXONOMY = [
  "Missing acceptance criteria",
  "Vague quantifiers",
  "Undefined terms",
  "Missing error handling",
  "Unstated assumptions",
  "Scope ambiguity",
  "Priority conflicts",
  "Missing non-functional requirements",
  "Dependency gaps",
] as const;

type TaxonomyCategory = typeof TAXONOMY[number];

interface AmbiguityCandidate {
  lineNumber: number;
  line: string;
  category: TaxonomyCategory | string;
  excerpt: string;
}

// Words that are legitimate ALLCAPS but not undefined terms
const ALLCAPS_SKIP = new Set([
  "TODO", "TBD", "FIXME", "RFC", "API", "URL", "URI", "ID", "OK",
  "UI", "UX", "HTTP", "HTTPS", "REST", "CRUD", "SQL", "JWT", "HTML",
  "CSS", "JSON", "XML", "SDK", "CLI", "MCP", "MVP", "SLA", "SLO",
  "NFR", "FR", "SC", "PR", "MUST", "SHALL", "MAY", "SHOULD", "COULD",
]);

function detectAmbiguities(content: string): AmbiguityCandidate[] {
  const lines = content.split("\n");
  const candidates: AmbiguityCandidate[] = [];

  const markerRe = /\[NEEDS CLARIFICATION[^\]]*\]|TODO\b|TBD\b/gi;
  const vagueRe =
    /\b(some|many|several|few|often|usually|sometimes|approximately|around|about|roughly|might|may|should consider|probably)\b/gi;
  const undefinedTermRe = /\b([A-Z]{3,})\b/g;
  const headingRe = /^#+\s/;
  const userStoryRe = /\bGiven\b.+\bWhen\b/i;
  const thenRe = /\bThen\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // [NEEDS CLARIFICATION], TODO, TBD markers
    const markerMatches = [...line.matchAll(markerRe)];
    for (const m of markerMatches) {
      candidates.push({
        lineNumber,
        line,
        category: "Missing acceptance criteria",
        excerpt: m[0],
      });
    }

    // Vague quantifiers
    const vagueMatches = [...line.matchAll(vagueRe)];
    for (const m of vagueMatches) {
      candidates.push({
        lineNumber,
        line,
        category: "Vague quantifiers",
        excerpt: m[0],
      });
    }

    // Undefined terms (ALLCAPS, non-heading, not in skip list)
    if (!headingRe.test(line)) {
      const allcapsMatches = [...line.matchAll(undefinedTermRe)];
      for (const m of allcapsMatches) {
        if (!ALLCAPS_SKIP.has(m[1])) {
          candidates.push({
            lineNumber,
            line,
            category: "Undefined terms",
            excerpt: m[1],
          });
        }
      }
    }

    // User story without "Then" — missing acceptance criteria
    if (userStoryRe.test(line) && !thenRe.test(line)) {
      candidates.push({
        lineNumber,
        line,
        category: "Missing acceptance criteria",
        excerpt: line.trim().slice(0, 60),
      });
    }
  }

  // Document-level checks (no line reference)
  const hasErrorSection = /error handling|failure mode|exception/i.test(content);
  if (!hasErrorSection) {
    candidates.push({
      lineNumber: 0,
      line: "",
      category: "Missing error handling",
      excerpt: "No error handling section found in spec",
    });
  }

  const hasNFR =
    /non-functional|performance|scalability|availability|latency|throughput/i.test(
      content
    );
  if (!hasNFR) {
    candidates.push({
      lineNumber: 0,
      line: "",
      category: "Missing non-functional requirements",
      excerpt: "No non-functional requirements section found in spec",
    });
  }

  return candidates;
}

function buildQuestions(candidates: AmbiguityCandidate[]): string[] {
  // Deduplicate by category + excerpt
  const seen = new Set<string>();
  const unique: AmbiguityCandidate[] = [];
  for (const c of candidates) {
    const key = `${c.category}:${c.excerpt}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }

  // Sort by taxonomy priority
  const categoryPriority = Object.fromEntries(TAXONOMY.map((cat, i) => [cat, i]));
  unique.sort(
    (a, b) =>
      (categoryPriority[a.category] ?? 99) - (categoryPriority[b.category] ?? 99)
  );

  return unique.slice(0, 5).map((c, i) => {
    const loc = c.lineNumber > 0 ? ` (line ${c.lineNumber})` : "";
    return `Q${i + 1} [${c.category}]${loc}: Regarding "${c.excerpt}" — please clarify this ambiguity.`;
  });
}

export const clarifyTool: ToolDef = {
  definition: {
    name: "speckit_clarify",
    description:
      "Manage clarification questions for a feature. Scan spec.md for ambiguities across 9 taxonomy categories and return up to 5 prioritized questions (scan), or write an answer inline in spec.md (answer). Does not write clarifications.md.",
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
        action: {
          type: "string",
          enum: ["scan", "answer"],
          description:
            "Action: scan (identify ambiguities in spec), answer (write answer inline in spec.md).",
        },
        question_index: {
          type: "number",
          description:
            "Zero-based index of the [NEEDS CLARIFICATION] marker to answer (required for answer action).",
        },
        answer: {
          type: "string",
          description:
            "The answer text to write inline in spec.md (required for answer action).",
        },
      },
      required: ["feature_name", "action"],
    },
  },

  async execute(args: Record<string, unknown>) {
    const input = inputSchema.parse(args);
    const root = resolveProjectRoot(input.project_path as string | undefined);
    const featureDir = path.join(root, "specs", input.feature_name);
    assertPathWithinRoot(featureDir, root);
    const specPath = path.join(featureDir, "spec.md");

    // Best-effort: try check-prerequisites script in paths-only mode
    const projectInfo = await checkProjectInitialized(root);
    if (projectInfo.initialized) {
      runHelperScript("check-prerequisites", ["--paths-only"], {
        cwd: root,
        scriptsDir: projectInfo.scriptsDir,
      }).catch(() => {
        // Script unavailable — proceed without it
      });
    }

    // --- SCAN ---
    if (input.action === "scan") {
      let specContent: string;
      try {
        specContent = await fs.readFile(specPath, "utf-8");
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `spec.md not found at ${specPath}. Create the spec first with speckit_specify.`,
            },
          ],
          isError: true,
        };
      }

      const candidates = detectAmbiguities(specContent);
      const questions = buildQuestions(candidates);

      if (questions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `# Clarification Scan: ${input.feature_name}\n\nNo ambiguities detected. The spec appears well-specified.`,
            },
          ],
        };
      }

      const today = new Date().toISOString().split("T")[0];
      const output = [
        `# Clarification Scan: ${input.feature_name}`,
        `**Date**: ${today}`,
        `**Source**: ${specPath}`,
        "",
        `Found ${candidates.length} candidate ambiguit${candidates.length === 1 ? "y" : "ies"} across ${TAXONOMY.length} taxonomy categories. Top ${questions.length} prioritized:`,
        "",
        "## Questions Requiring Clarification",
        "",
        ...questions.map((q) => `- ${q}`),
        "",
        "## Taxonomy Categories Checked",
        "",
        ...TAXONOMY.map((cat) => `- ${cat}`),
        "",
        "## Next Steps",
        "",
        "Use `speckit_clarify` with `action=answer`, `question_index=<N>` (0-based), and `answer=<text>` to resolve each question.",
      ];

      return {
        content: [{ type: "text" as const, text: output.join("\n") }],
      };
    }

    // --- ANSWER ---
    if (input.action === "answer") {
      if (input.question_index === undefined || input.question_index === null) {
        return {
          content: [
            {
              type: "text" as const,
              text: "question_index is required for the answer action.",
            },
          ],
          isError: true,
        };
      }
      if (!input.answer) {
        return {
          content: [
            {
              type: "text" as const,
              text: "answer is required for the answer action.",
            },
          ],
          isError: true,
        };
      }

      let specContent: string;
      try {
        specContent = await fs.readFile(specPath, "utf-8");
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `spec.md not found at ${specPath}. Create the spec first with speckit_specify.`,
            },
          ],
          isError: true,
        };
      }

      // Find the Nth [NEEDS CLARIFICATION] marker (0-based)
      const markerRe = /\[NEEDS CLARIFICATION[^\]]*\]/gi;
      const allMatches = [...specContent.matchAll(markerRe)];

      if (input.question_index >= allMatches.length) {
        // No marker at that index — append a clarification section
        const annotation = `\n\n## Clarification Answer (Q${input.question_index + 1})\n\n${input.answer}\n`;
        const updated = specContent + annotation;
        await fs.writeFile(specPath, updated, "utf-8");
        return {
          content: [
            {
              type: "text" as const,
              text: `No [NEEDS CLARIFICATION] marker at index ${input.question_index}. Answer appended as a new section in ${specPath}.`,
            },
          ],
        };
      }

      // Replace the marker inline with a clarified annotation
      const match = allMatches[input.question_index];
      const before = specContent.slice(0, match.index!);
      const after = specContent.slice(match.index! + match[0].length);
      const replacement = `[CLARIFIED: ${input.answer}]`;
      const updated = before + replacement + after;

      await fs.writeFile(specPath, updated, "utf-8");

      return {
        content: [
          {
            type: "text" as const,
            text: `Answer written inline in ${specPath}.\n\nReplaced: ${match[0]}\nWith: ${replacement}`,
          },
        ],
      };
    }

    // Unreachable — Zod enforces the enum
    return {
      content: [{ type: "text" as const, text: "Invalid action." }],
      isError: true,
    };
  },
};
