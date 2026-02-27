import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolDef } from "./index.js";
import { featureNameSchema, assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot, checkProjectInitialized } from "../project.js";
import { runHelperScript } from "../scripts.js";

const inputSchema = z.object({
  feature_name: featureNameSchema.describe("Name of the feature to analyze."),
  project_path: z
    .string()
    .optional()
    .describe("Path to the spec-kit project root."),
});

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface Finding {
  severity: Severity;
  pass: string;
  message: string;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

async function readFileOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

/**
 * List markdown files in a directory, returning empty array if dir doesn't exist.
 */
async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => path.join(dirPath, e));
  } catch {
    return [];
  }
}

// Targeted placeholder patterns — avoids matching markdown links like [text](url)
const PLACEHOLDER_PATTERNS = [
  /\[TODO\b[^\]]*\]/gi,
  /\[TBD\b[^\]]*\]/gi,
  /\[FIXME\b[^\]]*\]/gi,
  /\[NEEDS CLARIFICATION\b[^\]]*\]/gi,
  /\[PLACEHOLDER\b[^\]]*\]/gi,
  /TODO(?!:?\s*\[)/gi,   // standalone TODO not immediately followed by [
  /TBD(?!:?\s*\[)/gi,
  /FIXME(?!:?\s*\[)/gi,
];

function countPlaceholders(content: string): number {
  let count = 0;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// --- Analysis passes ---

function passAmbiguity(artifacts: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  const vagueRe =
    /\b(some|many|several|few|often|usually|sometimes|approximately|around|about|roughly|might|probably)\b/gi;
  const unresolvedMarkerRe = /\[NEEDS CLARIFICATION[^\]]*\]|TODO\b|TBD\b/gi;

  for (const [label, content] of Object.entries(artifacts)) {
    const unresolved = content.match(unresolvedMarkerRe);
    if (unresolved) {
      findings.push({
        severity: "HIGH",
        pass: "Ambiguity",
        message: `${label}: ${unresolved.length} unresolved marker${unresolved.length === 1 ? "" : "s"} ([NEEDS CLARIFICATION], TODO, TBD).`,
      });
    }

    const placeholders = countPlaceholders(content);
    if (placeholders > 0) {
      findings.push({
        severity: "MEDIUM",
        pass: "Ambiguity",
        message: `${label}: ${placeholders} placeholder pattern${placeholders === 1 ? "" : "s"} found (TODO/TBD/FIXME/etc.).`,
      });
    }

    const vague = content.match(vagueRe);
    if (vague && vague.length > 3) {
      findings.push({
        severity: "LOW",
        pass: "Ambiguity",
        message: `${label}: ${vague.length} vague quantifier${vague.length === 1 ? "" : "s"} ("${[...new Set(vague.map((v) => v.toLowerCase()))].slice(0, 3).join('", "')}").`,
      });
    }
  }

  return findings;
}

function passDuplication(artifacts: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  const labels = Object.keys(artifacts);
  if (labels.length < 2) return findings;

  // Extract meaningful phrases (4+ word sequences from requirement lines)
  const requirementRe = /^- .{20,}/gm;

  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const aLines = (artifacts[labels[i]].match(requirementRe) ?? []).map((l) =>
        l.trim().toLowerCase()
      );
      const bLines = (artifacts[labels[j]].match(requirementRe) ?? []).map((l) =>
        l.trim().toLowerCase()
      );

      const bSet = new Set(bLines);
      const duplicates = aLines.filter((line) => bSet.has(line));

      if (duplicates.length > 0) {
        findings.push({
          severity: "MEDIUM",
          pass: "Duplication",
          message: `${labels[i]} and ${labels[j]}: ${duplicates.length} duplicated requirement line${duplicates.length === 1 ? "" : "s"} detected.`,
        });
      }
    }
  }

  return findings;
}

function passUnderspecification(
  spec: string | null,
  plan: string | null,
  tasks: string | null
): Finding[] {
  const findings: Finding[] = [];

  if (!spec) {
    findings.push({
      severity: "CRITICAL",
      pass: "Underspecification",
      message: "spec.md is missing. No specification exists for this feature.",
    });
  } else {
    if (!/acceptance criteria|given.*when.*then/i.test(spec)) {
      findings.push({
        severity: "HIGH",
        pass: "Underspecification",
        message: "spec.md: No acceptance criteria detected (no Given/When/Then or 'Acceptance Criteria' section).",
      });
    }
    if (!/## requirements|## functional/i.test(spec)) {
      findings.push({
        severity: "HIGH",
        pass: "Underspecification",
        message: "spec.md: No requirements section detected.",
      });
    }
  }

  if (!plan) {
    findings.push({
      severity: "MEDIUM",
      pass: "Underspecification",
      message: "plan.md is missing. Consider creating a plan with speckit_plan.",
    });
  }

  if (!tasks) {
    findings.push({
      severity: "MEDIUM",
      pass: "Underspecification",
      message: "tasks.md is missing. Consider creating tasks with speckit_tasks.",
    });
  }

  return findings;
}

function passConstitutionAlignment(
  spec: string | null,
  constitution: string | null
): Finding[] {
  const findings: Finding[] = [];
  if (!constitution || !spec) return findings;

  // Extract principle lines from constitution
  const principleLines = constitution
    .split("\n")
    .filter((l) => l.startsWith("- ") && !l.includes("[NEEDS CLARIFICATION]"));

  // Heuristic: check that major technology choices in constitution appear in spec/plan
  const techChoiceRe = /\*\*(Language|Framework|Storage|Testing)\*\*:\s*([^\n]+)/g;
  const techChoices = [...constitution.matchAll(techChoiceRe)];
  for (const match of techChoices) {
    const choiceValue = match[2].trim();
    if (
      choiceValue &&
      !choiceValue.startsWith("[") &&
      choiceValue.length > 2 &&
      !spec.includes(choiceValue)
    ) {
      findings.push({
        severity: "CRITICAL",
        pass: "Constitution Alignment",
        message: `spec.md does not reference the constitutional ${match[1]} choice: "${choiceValue}".`,
      });
    }
  }

  // Check for NEEDS CLARIFICATION in constitution itself — governance gap
  if (/\[NEEDS CLARIFICATION\]/i.test(constitution)) {
    findings.push({
      severity: "HIGH",
      pass: "Constitution Alignment",
      message: "constitution.md still contains unresolved [NEEDS CLARIFICATION] markers.",
    });
  }

  void principleLines; // enumerated above for future use
  return findings;
}

function passCoverageGaps(
  spec: string | null,
  plan: string | null,
  tasks: string | null
): Finding[] {
  const findings: Finding[] = [];

  if (spec && plan) {
    // Extract FR-NNN identifiers from spec
    const frIds = [...spec.matchAll(/\bFR-(\d+)\b/g)].map((m) => m[0]);
    const planText = plan;
    const uncoveredFRs = frIds.filter((fr) => !planText.includes(fr));
    if (uncoveredFRs.length > 0) {
      findings.push({
        severity: "HIGH",
        pass: "Coverage Gaps",
        message: `${uncoveredFRs.length} spec requirement${uncoveredFRs.length === 1 ? "" : "s"} not referenced in plan.md: ${uncoveredFRs.slice(0, 5).join(", ")}${uncoveredFRs.length > 5 ? "..." : ""}.`,
      });
    }
  }

  if (plan && tasks) {
    // Extract phase/section headings from plan and check tasks references them
    const planSections = [...plan.matchAll(/^## (.+)/gm)].map((m) =>
      m[1].trim()
    );
    const tasksText = tasks;
    const uncoveredSections = planSections.filter(
      (section) => !tasksText.toLowerCase().includes(section.toLowerCase())
    );
    if (uncoveredSections.length > 0) {
      findings.push({
        severity: "MEDIUM",
        pass: "Coverage Gaps",
        message: `${uncoveredSections.length} plan section${uncoveredSections.length === 1 ? "" : "s"} not referenced in tasks.md: "${uncoveredSections.slice(0, 3).join('", "')}"${uncoveredSections.length > 3 ? "..." : ""}.`,
      });
    }
  }

  return findings;
}

function passInconsistency(artifacts: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  const labels = Object.keys(artifacts);

  // Look for contradicting numeric values (e.g., "500ms" in spec vs "1000ms" in plan)
  const numericValueRe = /\b(\d+)\s*(ms|s|MB|GB|KB|rpm|rps|req\/s)\b/gi;

  const valuesByUnit: Record<string, Array<{ label: string; value: string }>> = {};

  for (const label of labels) {
    const content = artifacts[label];
    const matches = [...content.matchAll(numericValueRe)];
    for (const m of matches) {
      const unit = m[2].toLowerCase();
      if (!valuesByUnit[unit]) valuesByUnit[unit] = [];
      valuesByUnit[unit].push({ label, value: m[0] });
    }
  }

  for (const [unit, entries] of Object.entries(valuesByUnit)) {
    const uniqueValues = new Set(entries.map((e) => e.value.toLowerCase()));
    if (uniqueValues.size > 1 && entries.length > 1) {
      const distinctLabels = [...new Set(entries.map((e) => e.label))];
      if (distinctLabels.length > 1) {
        findings.push({
          severity: "MEDIUM",
          pass: "Inconsistency",
          message: `Different ${unit} values found across artifacts (${[...uniqueValues].join(", ")}). Verify these are intentional.`,
        });
      }
    }
  }

  return findings;
}

export const analyzeTool: ToolDef = {
  definition: {
    name: "speckit_analyze",
    description:
      "Analyze cross-artifact consistency for a feature across 6 passes: Duplication, Ambiguity, Underspecification, Constitution Alignment, Coverage Gaps, and Inconsistency. Strictly read-only — never writes files.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description: "Name of the feature to analyze.",
        },
        project_path: {
          type: "string",
          description: "Path to the spec-kit project root.",
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

    // Read all artifacts (optional — skip if missing)
    const spec = await readFileOrNull(path.join(featureDir, "spec.md"));
    const plan = await readFileOrNull(path.join(featureDir, "plan.md"));
    const tasks = await readFileOrNull(path.join(featureDir, "tasks.md"));
    const research = await readFileOrNull(path.join(featureDir, "research.md"));
    const dataModel = await readFileOrNull(path.join(featureDir, "data-model.md"));
    const quickstart = await readFileOrNull(path.join(featureDir, "quickstart.md"));
    const constitution = await readFileOrNull(
      path.join(root, ".specify", "memory", "constitution.md")
    );

    // Read contracts/*.md
    const contractsDir = path.join(featureDir, "contracts");
    const contractFiles = await listMarkdownFiles(contractsDir);
    const contractContents: Record<string, string> = {};
    for (const file of contractFiles) {
      const content = await readFileOrNull(file);
      if (content !== null) {
        contractContents[`contracts/${path.basename(file)}`] = content;
      }
    }

    // Read checklists/*.md
    const checklistsDir = path.join(featureDir, "checklists");
    const checklistFiles = await listMarkdownFiles(checklistsDir);
    const checklistContents: Record<string, string> = {};
    for (const file of checklistFiles) {
      const content = await readFileOrNull(file);
      if (content !== null) {
        checklistContents[`checklists/${path.basename(file)}`] = content;
      }
    }

    // Build artifact map (only existing files)
    const artifacts: Record<string, string> = {};
    if (spec) artifacts["spec.md"] = spec;
    if (plan) artifacts["plan.md"] = plan;
    if (tasks) artifacts["tasks.md"] = tasks;
    if (research) artifacts["research.md"] = research;
    if (dataModel) artifacts["data-model.md"] = dataModel;
    if (quickstart) artifacts["quickstart.md"] = quickstart;
    Object.assign(artifacts, contractContents);
    Object.assign(artifacts, checklistContents);

    // Inventory
    const inventoryLines = [
      `- constitution.md: ${constitution ? "EXISTS" : "MISSING"}`,
      `- spec.md: ${spec ? "EXISTS" : "MISSING"}`,
      `- plan.md: ${plan ? "EXISTS" : "MISSING"}`,
      `- tasks.md: ${tasks ? "EXISTS" : "MISSING"}`,
      `- research.md: ${research ? "EXISTS" : "MISSING"}`,
      `- data-model.md: ${dataModel ? "EXISTS" : "MISSING"}`,
      `- quickstart.md: ${quickstart ? "EXISTS" : "MISSING"}`,
    ];
    if (contractFiles.length > 0) {
      inventoryLines.push(`- contracts/: ${contractFiles.length} file${contractFiles.length === 1 ? "" : "s"}`);
    }
    if (checklistFiles.length > 0) {
      inventoryLines.push(`- checklists/: ${checklistFiles.length} file${checklistFiles.length === 1 ? "" : "s"}`);
    }

    // Task progress
    let taskProgressLines: string[] = [];
    if (tasks) {
      const totalTasks = (tasks.match(/- \[[ x]\]/g) ?? []).length;
      const completedTasks = (tasks.match(/- \[x\]/g) ?? []).length;
      taskProgressLines = [
        "## Task Progress",
        "",
        `- Total: ${totalTasks}`,
        `- Completed: ${completedTasks}`,
        `- Remaining: ${totalTasks - completedTasks}`,
        `- Progress: ${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%`,
        "",
      ];
    }

    // Run 6-pass analysis
    const allFindings: Finding[] = [
      ...passDuplication(artifacts),
      ...passAmbiguity(artifacts),
      ...passUnderspecification(spec, plan, tasks),
      ...passConstitutionAlignment(spec, constitution),
      ...passCoverageGaps(spec, plan, tasks),
      ...passInconsistency(artifacts),
    ];

    // Sort by severity, cap at 50
    allFindings.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );
    const findings = allFindings.slice(0, 50);
    const truncated = allFindings.length > 50;

    // Format findings by severity group
    const bySeverity: Record<Severity, Finding[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };
    for (const f of findings) {
      bySeverity[f.severity].push(f);
    }

    const findingLines: string[] = ["## Findings", ""];
    for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[]) {
      const group = bySeverity[severity];
      if (group.length > 0) {
        findingLines.push(`### ${severity} (${group.length})`);
        findingLines.push("");
        for (const f of group) {
          findingLines.push(`- [${f.pass}] ${f.message}`);
        }
        findingLines.push("");
      }
    }

    if (findings.length === 0) {
      findingLines.push("No issues found. All artifacts appear consistent.");
      findingLines.push("");
    }

    if (truncated) {
      findingLines.push(
        `> Note: ${allFindings.length} total findings — only the top 50 are shown.`
      );
      findingLines.push("");
    }

    const output = [
      `# Analysis Report: ${input.feature_name}`,
      `**Date**: ${new Date().toISOString().split("T")[0]}`,
      `**Artifacts read**: ${Object.keys(artifacts).length}`,
      `**Findings**: ${findings.length}${truncated ? ` (of ${allFindings.length})` : ""}`,
      "",
      "## Artifact Inventory",
      "",
      ...inventoryLines,
      "",
      ...taskProgressLines,
      ...findingLines,
      "## Analysis Passes",
      "",
      "1. Duplication — repeated requirements across artifacts",
      "2. Ambiguity — vague language, unresolved markers",
      "3. Underspecification — missing sections, no acceptance criteria",
      "4. Constitution Alignment — key violations (automatic CRITICAL)",
      "5. Coverage Gaps — requirements without plan coverage, plan items without tasks",
      "6. Inconsistency — contradicting values across artifacts",
    ];

    return {
      content: [{ type: "text" as const, text: output.join("\n") }],
    };
  },
};
