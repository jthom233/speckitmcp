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
      "Complete Spec-Driven Development workflow guide. Walks through all phases: constitution, specify, clarify, plan, tasks, implement, analyze, checklist.",
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
    name: "sdd_plan",
    description:
      "Guide for creating a technical implementation plan with architecture, tech stack, and approach.",
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
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to build: ${args.project_description ?? "[not specified]"}

Please guide me through the complete Spec-Driven Development workflow:

1. **Constitution** - Establish project principles, tech stack, and governance
2. **Specify** - Create a feature specification with user stories and acceptance criteria
3. **Clarify** (optional) - Identify and resolve ambiguities
4. **Plan** - Create a technical implementation plan
5. **Tasks** - Break the plan into actionable, phased tasks
6. **Implement** - Execute the tasks systematically
7. **Analyze** (optional) - Validate cross-artifact consistency
8. **Checklist** (optional) - Generate validation checklists

Use the speckit_* tools to create and manage all artifacts in the specs/ directory.
Start with speckit_init if the project isn't initialized yet, then work through each phase.`,
            },
          },
        ],
      };

    case "sdd_constitution":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a project constitution for a ${args.project_type ?? "software"} project.

The constitution should define:
- Core architectural principles (3-5 principles appropriate for this project type)
- Technology choices with rationale
- Quality standards (testing, security, accessibility)
- Development practices
- Governance rules

Use the speckit_constitution tool with action "write" to save the constitution.
Keep it concise and actionable - avoid generic platitudes.`,
            },
          },
        ],
      };

    case "sdd_specify":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a feature specification for: ${args.feature_description ?? "[not specified]"}

The specification should include:
- User stories prioritized as P1, P2, P3 (each independently testable)
- Acceptance scenarios in Given/When/Then format
- Functional requirements (FR-001, FR-002, etc.)
- Edge cases
- Success criteria with measurable outcomes

Use the speckit_specify tool to create the spec file.
Focus on WHAT and WHY, not HOW. No implementation details.`,
            },
          },
        ],
      };

    case "sdd_plan":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a technical implementation plan for the "${args.feature_name ?? "feature"}" specification.

First read the spec using speckit_implement (action: read) or resources, then create a plan that includes:
- Technology stack with rationale
- Project structure (directory layout)
- Architecture and key design decisions
- Data model (if applicable)
- Implementation approach and order

Use the speckit_plan tool to create the plan file.`,
            },
          },
        ],
      };

    case "sdd_tasks":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Create a task breakdown for the "${args.feature_name ?? "feature"}" plan.

First read the spec and plan, then create tasks that:
- Are organized into phases (Setup → Foundation → User Stories → Polish)
- Include task IDs (T001, T002, etc.)
- Mark parallel tasks with [P]
- Map tasks to user stories with [US1], [US2], etc.
- Include specific file paths
- Have clear dependencies between phases

Use the speckit_tasks tool to create the tasks file.`,
            },
          },
        ],
      };

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Prompt "${name}" not found`);
  }
}
