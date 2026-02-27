import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

interface PromptDef {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

const prompts: PromptDef[] = [
  {
    name: "sdd_workflow",
    description:
      "Complete Spec-Driven Development workflow guide. Walks through all phases: constitution, specify, clarify, plan, tasks, checklist, analyze, implement, tasks_to_issues.",
    arguments: [
      {
        name: "project_description",
        description: "Brief description of what you want to build.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_constitution",
    description:
      "Guide for creating a project constitution. Establishes principles, tech choices, and governance.",
    arguments: [
      {
        name: "project_type",
        description: "Type of project (web app, API, CLI, mobile, etc.).",
        required: true,
      },
    ],
  },
  {
    name: "sdd_specify",
    description:
      "Guide for writing a feature specification with user stories, acceptance criteria, and requirements.",
    arguments: [
      {
        name: "feature_description",
        description: "What the feature should do.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_clarify",
    description:
      "Guide for identifying ambiguities in a specification using scan/answer actions.",
    arguments: [
      {
        name: "feature_name",
        description: "Name of the feature to clarify.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_plan",
    description:
      "Guide for creating a technical implementation plan with research phase, data model, contracts, quickstart, and architecture.",
    arguments: [
      {
        name: "feature_name",
        description: "Name of the feature to plan.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_tasks",
    description:
      "Guide for breaking down a plan into phased, actionable tasks with dependencies and parallel opportunities.",
    arguments: [
      {
        name: "feature_name",
        description: "Name of the feature to break into tasks.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_implement",
    description:
      "Guide for executing tasks systematically, tracking progress, and marking tasks complete. Includes checklist gate and force-bypass support.",
    arguments: [
      {
        name: "feature_name",
        description: "Name of the feature to implement.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_analyze",
    description:
      "Guide for validating cross-artifact consistency between spec, plan, and tasks.",
    arguments: [
      {
        name: "feature_name",
        description: "Name of the feature to analyze.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_checklist",
    description:
      "Guide for generating requirement quality checklists stored in checklists/ subdirectory. Validates spec completeness, not implementation.",
    arguments: [
      {
        name: "feature_name",
        description: "Name of the feature to validate.",
        required: true,
      },
    ],
  },
  {
    name: "sdd_taskstoissues",
    description:
      "Guide for converting a tasks.md file into GitHub issues. Supports dry_run mode (default true) and custom labels.",
    arguments: [
      {
        name: "feature_name",
        description: "Name of the feature whose tasks to convert to issues.",
        required: true,
      },
    ],
  },
];

export function listPrompts() {
  return prompts;
}

export function getPrompt(
  name: string,
  args: Record<string, string>
): { messages: Array<{ role: "user"; content: { type: "text"; text: string } }> } {
  switch (name) {
    case "sdd_workflow":
      return msg(`I want to build: ${args.project_description ?? "[not specified]"}

Please guide me through the complete Spec-Driven Development workflow:

1. **Constitution** - Establish project principles, tech stack, and governance
2. **Specify** - Create a feature specification with user stories and acceptance criteria
3. **Clarify** (optional) - Identify and resolve ambiguities using scan/answer actions
4. **Plan** - Create a technical implementation plan (research → data-model → contracts → quickstart)
5. **Tasks** - Break the plan into actionable, phased tasks
6. **Checklist** (optional) - Generate requirement quality checklists in checklists/ subdirectory
7. **Analyze** (optional) - Validate cross-artifact consistency
8. **Implement** - Execute the tasks systematically (checklist gate enforced)
9. **Tasks to Issues** (optional) - Convert tasks.md to GitHub issues

Use the speckit_* tools to create and manage all artifacts in the specs/ directory.
Start with speckit_init if the project isn't initialized yet, then work through each phase.`);

    case "sdd_constitution":
      return msg(`Create a project constitution for a ${args.project_type ?? "software"} project.

The constitution should define:
- Core architectural principles (3-5 principles appropriate for this project type)
- Technology choices with rationale
- Quality standards (testing, security, accessibility)
- Development practices
- Governance rules

Use the speckit_constitution tool with action "write" to save the constitution.
Keep it concise and actionable - avoid generic platitudes.`);

    case "sdd_specify":
      return msg(`Create a feature specification for: ${args.feature_description ?? "[not specified]"}

The specification should include:
- User stories prioritized as P1, P2, P3 (each independently testable)
- Acceptance scenarios in Given/When/Then format
- Functional requirements (FR-001, FR-002, etc.)
- Edge cases
- Success criteria with measurable outcomes

Use the speckit_specify tool to create the spec file.
Focus on WHAT and WHY, not HOW. No implementation details.`);

    case "sdd_clarify":
      return msg(`Review the specification for "${args.feature_name ?? "feature"}" and identify ambiguities.

Use the speckit_clarify tool with the following action model:

- **action "scan"**: Reads spec.md and identifies up to 5 prioritized ambiguities. Returns targeted questions for each underspecified or contradictory area. Run this first.
- **action "answer"**: After the user provides answers, writes them inline in spec.md by replacing [NEEDS CLARIFICATION] markers with the resolved content.

Workflow:
1. Call speckit_clarify with action "scan" and feature_name "${args.feature_name ?? "feature"}"
2. Present the returned questions to the user
3. Collect the user's answers
4. Call speckit_clarify with action "answer" to encode answers back into spec.md`);

    case "sdd_plan":
      return msg(`Create a technical implementation plan for the "${args.feature_name ?? "feature"}" specification.

Read the project constitution (speckit://constitution) as governing context, then read the spec (speckit://specs/${args.feature_name ?? "feature"}/spec).

Use the speckit_plan tool through the following phases:

- **phase "research"**: Investigate technical landscape, identify unknowns, survey relevant libraries. Produces research.md.
- **Design phase**: Create supporting artifacts:
  - data-model: Entity definitions, relationships, schema decisions (data-model.md)
  - contracts: API surface, event schemas, integration boundaries (contracts/ subdirectory)
  - quickstart: Developer onboarding and local setup guide (quickstart.md)
- **Main plan**: Create plan.md with architecture, tech stack rationale, and implementation approach. Accepts optional content params: research_content, data_model_content, contracts, quickstart_content to embed phase outputs.

The tool reads the constitution automatically as a gate before writing the plan.`);

    case "sdd_tasks":
      return msg(`Create a task breakdown for the "${args.feature_name ?? "feature"}" plan.

First read the spec and plan, then create tasks that:
- Are organized into phases (Setup -> Foundation -> User Stories -> Polish)
- Include task IDs (T001, T002, etc.)
- Mark parallel tasks with [P]
- Map tasks to user stories with [US1], [US2], etc.
- Include specific file paths
- Have clear dependencies between phases

Use the speckit_tasks tool to create the tasks file.`);

    case "sdd_implement":
      return msg(`Execute the implementation for "${args.feature_name ?? "feature"}".

1. Read the current tasks and plan using speckit_implement with action "read"
   - The read action loads tasks.md and plan.md, plus any optional docs provided
2. Work through tasks in order, respecting dependencies
3. Before completing any task, the tool checks for incomplete checklist items (checklist gate)
   - If blockers are found, fix them first or use the force param to bypass the gate
4. For each task:
   a. Implement the task
   b. Mark it complete using speckit_implement with action "complete_task" and the task_id
5. Add implementation notes as needed using action "update_status"
6. After completing a phase, verify before moving to the next`);

    case "sdd_analyze":
      return msg(`Analyze cross-artifact consistency for "${args.feature_name ?? "feature"}".

Use the speckit_analyze tool to:
1. Check that all artifacts exist (spec, plan, tasks)
2. Identify unresolved NEEDS CLARIFICATION markers
3. Count remaining placeholders and TODOs
4. Review task completion progress
5. Verify that the plan addresses all requirements from the spec
6. Verify that tasks cover all items from the plan

Report any gaps, contradictions, or missing coverage.`);

    case "sdd_checklist":
      return msg(`Generate a requirement quality checklist for "${args.feature_name ?? "feature"}".

Use the speckit_checklist tool to create a checklist that validates requirement completeness — not implementation:
- Are all functional requirements clearly stated?
- Are acceptance criteria measurable and unambiguous?
- Are edge cases and error scenarios addressed in the spec?
- Are non-functional requirements (performance, security, accessibility) specified?

Key details:
- Checklists are stored in specs/${args.feature_name ?? "feature"}/checklists/ subdirectory
- Use the checklist_name param to name the checklist (e.g., "requirements", "security")
- Quality markers used in output: [Spec §section], [Gap], [Ambiguity], [Conflict]
- This validates spec quality, not whether code has been written`);

    case "sdd_taskstoissues":
      return msg(`Convert tasks.md to GitHub issues for "${args.feature_name ?? "feature"}".

Use the speckit_taskstoissues tool to parse tasks.md and create GitHub issues.

Key details:
- **dry_run** (default true): Preview issues that would be created without actually creating them. Set to false to create them.
- **labels** param: Comma-separated list of labels to apply to all created issues (e.g., "feature,speckit")
- Task parsing format: Tasks must have IDs like T001, T002, etc. The tool also extracts priorities and user story references ([US1], [P1], etc.)
- Run with dry_run=true first to review the issue list before committing

Workflow:
1. Call speckit_taskstoissues with dry_run=true to preview
2. Review the output and adjust tasks.md if needed
3. Call again with dry_run=false to create the issues`);

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Prompt "${name}" not found`);
  }
}

function msg(text: string) {
  return {
    messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
  };
}
