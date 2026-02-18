<p align="center">
  <h1 align="center">speckitmcp</h1>
  <p align="center">
    A <a href="https://modelcontextprotocol.io">Model Context Protocol</a> server for <a href="https://github.com/github/spec-kit">GitHub Spec-Kit</a><br/>
    <em>Bring Spec-Driven Development to any AI coding agent.</em>
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#tools">Tools</a> &bull;
  <a href="#resources">Resources</a> &bull;
  <a href="#prompts">Prompts</a> &bull;
  <a href="#the-sdd-workflow">Workflow</a> &bull;
  <a href="#development">Development</a>
</p>

---

## Overview

**speckitmcp** bridges GitHub's [Spec-Kit](https://github.com/github/spec-kit) toolkit with any MCP-compatible AI assistant — Claude Code, Cursor, VS Code Copilot, Windsurf, and more.

It exposes the full **Spec-Driven Development (SDD)** workflow as MCP **tools**, **resources**, and **prompts**, so your AI agent can:

- Initialize and manage spec-kit projects
- Author specifications, technical plans, and task breakdowns
- Track implementation progress and mark tasks complete
- Validate cross-artifact consistency
- Generate quality checklists

All without leaving your editor.

---

## Quick Start

### Prerequisites

| Requirement | Install |
|---|---|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **spec-kit CLI** | `uv tool install --from git+https://github.com/github/spec-kit.git specify-cli` |

### Install & Build

```bash
git clone https://github.com/jthom233/speckitmcp.git
cd speckitmcp
npm install
npm run build
```

### Connect to Your AI Agent

<details>
<summary><strong>Claude Code</strong></summary>

Add to `~/.claude/settings.json` (global) or `.claude/settings.json` (project):

```json
{
  "mcpServers": {
    "spec-kit": {
      "command": "node",
      "args": ["/absolute/path/to/speckitmcp/dist/index.js"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "spec-kit": {
      "command": "node",
      "args": ["/absolute/path/to/speckitmcp/dist/index.js"]
    }
  }
}
```
</details>

<details>
<summary><strong>VS Code / GitHub Copilot</strong></summary>

Add to `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "spec-kit": {
      "command": "node",
      "args": ["/absolute/path/to/speckitmcp/dist/index.js"]
    }
  }
}
```
</details>

<details>
<summary><strong>Windsurf / Other MCP Clients</strong></summary>

Point your client's MCP configuration at:

```
node /absolute/path/to/speckitmcp/dist/index.js
```

The server communicates over **stdio** using the standard MCP JSON-RPC protocol.
</details>

---

## Tools

The server exposes **11 tools** that map to every phase of the SDD workflow:

| Tool | Phase | Description |
|---|---|---|
| `speckit_init` | Setup | Initialize a new spec-kit project with templates and agent commands |
| `speckit_check` | Setup | Verify spec-kit CLI and prerequisites are installed |
| `speckit_status` | Any | Show project status — which specs, plans, and tasks exist |
| `speckit_constitution` | Foundation | Read or write the project constitution (principles, tech stack, governance) |
| `speckit_specify` | Specification | Create or update a feature spec with user stories and acceptance criteria |
| `speckit_clarify` | Refinement | Manage clarification questions to de-risk ambiguous requirements |
| `speckit_plan` | Planning | Create or update a technical implementation plan |
| `speckit_tasks` | Breakdown | Create or update a phased task breakdown with dependencies |
| `speckit_implement` | Execution | Track progress, mark tasks complete, add implementation notes |
| `speckit_analyze` | Validation | Analyze cross-artifact consistency and surface gaps |
| `speckit_checklist` | Quality | Generate validation checklists (functional, security, etc.) |

---

## Resources

The server exposes spec-kit project files as read-only MCP resources:

| URI | Content |
|---|---|
| `speckit://constitution` | Project constitution |
| `speckit://templates/{name}` | Spec-kit Markdown templates |
| `speckit://specs/{feature}/spec` | Feature specification |
| `speckit://specs/{feature}/plan` | Technical implementation plan |
| `speckit://specs/{feature}/tasks` | Task breakdown |
| `speckit://specs/{feature}/checklist` | Validation checklist |
| `speckit://specs/{feature}/clarifications` | Clarification Q&A |

---

## Prompts

Five built-in prompts guide your AI agent through each SDD phase:

| Prompt | Purpose |
|---|---|
| `sdd_workflow` | End-to-end walkthrough of the full SDD lifecycle |
| `sdd_constitution` | Guided creation of project principles and governance |
| `sdd_specify` | Structured feature specification authoring |
| `sdd_plan` | Technical planning with architecture and stack decisions |
| `sdd_tasks` | Task breakdown with phasing, dependencies, and parallelism |

---

## The SDD Workflow

```
  Init ➜ Constitution ➜ Specify ➜ Clarify* ➜ Plan ➜ Tasks ➜ Implement ➜ Analyze* ➜ Checklist*
                                    optional                                optional    optional
```

1. **Init** — `speckit_init` — Scaffold the project with `.specify/` templates
2. **Constitution** — `speckit_constitution` — Lock in principles, tech stack, quality bar
3. **Specify** — `speckit_specify` — Define requirements as prioritized user stories
4. **Clarify** — `speckit_clarify` — Resolve ambiguities before committing to a plan
5. **Plan** — `speckit_plan` — Decide architecture, data model, implementation order
6. **Tasks** — `speckit_tasks` — Break the plan into phased, parallelizable work items
7. **Implement** — `speckit_implement` — Execute tasks, track completion
8. **Analyze** — `speckit_analyze` — Validate spec / plan / tasks alignment
9. **Checklist** — `speckit_checklist` — Final quality gate before shipping

---

## Project Structure

```
src/
├── index.ts                 # Entry point — stdio transport
├── server.ts                # MCP server — handler registration
├── cli.ts                   # spec-kit CLI wrapper (child_process)
├── tools/
│   ├── index.ts             # Tool registry
│   ├── init.ts              # speckit_init
│   ├── check.ts             # speckit_check
│   ├── status.ts            # speckit_status
│   ├── constitution.ts      # speckit_constitution
│   ├── specify.ts           # speckit_specify
│   ├── plan.ts              # speckit_plan
│   ├── tasks.ts             # speckit_tasks
│   ├── implement.ts         # speckit_implement
│   ├── clarify.ts           # speckit_clarify
│   ├── analyze.ts           # speckit_analyze
│   └── checklist.ts         # speckit_checklist
├── resources/
│   └── index.ts             # MCP resource handlers
└── prompts/
    └── index.ts             # SDD workflow prompts
```

---

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/
npm run dev          # Watch mode (rebuild on change)
```

### Manual Smoke Test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
```

You should see a JSON-RPC response with `serverInfo.name: "spec-kit-mcp"`.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5 (strict mode, ESM) |
| Runtime | Node.js 18+ |
| Protocol | [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) v1.x |
| Validation | [Zod](https://zod.dev) |
| Transport | stdio (JSON-RPC 2.0) |
| CLI Integration | Node.js `child_process` wrapping `specify` |

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push to your fork and open a Pull Request

---

## License

[MIT](LICENSE)
