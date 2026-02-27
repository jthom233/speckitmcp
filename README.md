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
- Validate cross-artifact consistency with a 6-pass analysis engine
- Generate quality checklists and convert tasks to GitHub issues

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

The server exposes **13 tools** that map to every phase of the SDD workflow:

| Tool | Description |
|---|---|
| `speckit_init` | Initialize spec-kit project structure |
| `speckit_check` | Run spec-kit validation checks |
| `speckit_version` | Get spec-kit CLI version |
| `speckit_status` | View project status with task completion stats |
| `speckit_constitution` | Read, write, or create project constitution with version bumping |
| `speckit_specify` | Create feature specifications with script integration and template loading |
| `speckit_plan` | Multi-phase planning (research, design, plan) with constitution gate |
| `speckit_tasks` | Generate user-story-organized task lists with prerequisites check |
| `speckit_implement` | Track task completion with checklist gate and regex-safe marking |
| `speckit_clarify` | Scan spec.md for ambiguities or answer them inline (scan/answer actions) |
| `speckit_analyze` | 6-pass analysis (duplication, ambiguity, underspecification, constitution, coverage, inconsistency) |
| `speckit_checklist` | Generate requirement quality checklists in checklists/ subdirectory |
| `speckit_tasks_to_issues` | Convert tasks.md to GitHub issues (dry-run by default) |

### Key Features

- **Script integration** — Platform-aware bash/powershell helper scripts invoked automatically
- **Template loading** — Loads templates from `.specify/templates/` with embedded fallbacks
- **Prerequisites checking** — Tools verify prior artifacts exist before proceeding
- **Constitution gate** — Planning phase reads the project constitution as mandatory context
- **Checklist gate** — Implementation checks for incomplete checklist items before marking tasks done
- **6-pass analysis engine** — Catches duplication, ambiguity, underspecification, constitution violations, coverage gaps, and inconsistencies
- **GitHub issue creation** — Convert a tasks.md file into GitHub issues via `speckit_tasks_to_issues`

---

## Resources

The server exposes spec-kit project files as read-only MCP resources:

| URI | Content |
|---|---|
| `speckit://constitution` | Project constitution |
| `speckit://templates/{name}` | Spec-kit templates |
| `speckit://specs/{feature}/spec` | Feature specification |
| `speckit://specs/{feature}/plan` | Implementation plan |
| `speckit://specs/{feature}/tasks` | Task list |
| `speckit://specs/{feature}/research` | Research notes |
| `speckit://specs/{feature}/data-model` | Data model |
| `speckit://specs/{feature}/quickstart` | Quickstart guide |
| `speckit://specs/{feature}/checklists/{name}` | Quality checklists |
| `speckit://specs/{feature}/contracts/{name}` | API contracts |

---

## Prompts

Ten built-in prompts guide your AI agent through each SDD phase:

| Prompt | Purpose |
|---|---|
| `sdd_workflow` | End-to-end walkthrough of the full SDD lifecycle |
| `sdd_specify` | Structured feature specification authoring |
| `sdd_clarify` | Guided ambiguity resolution |
| `sdd_plan` | Technical planning with architecture and stack decisions |
| `sdd_tasks` | Task breakdown with phasing, dependencies, and parallelism |
| `sdd_implement` | Task execution and progress tracking |
| `sdd_checklist` | Requirement quality checklist generation |
| `sdd_analyze` | Cross-artifact consistency validation |
| `sdd_constitution` | Guided creation of project principles and governance |
| `sdd_taskstoissues` | Convert tasks to GitHub issues |

---

## The SDD Workflow

```
  init → specify → clarify → plan → tasks → checklist → analyze → implement → tasks_to_issues
```

1. **Init** — `speckit_init` — Scaffold the project with `.specify/` templates
2. **Specify** — `speckit_specify` — Define requirements as prioritized user stories with template loading
3. **Clarify** — `speckit_clarify` — Scan for and resolve ambiguities before committing to a plan
4. **Plan** — `speckit_plan` — Multi-phase planning gated on project constitution
5. **Tasks** — `speckit_tasks` — Generate user-story-organized task lists with prerequisites check
6. **Checklist** — `speckit_checklist` — Generate requirement quality checklists
7. **Analyze** — `speckit_analyze` — 6-pass validation of spec / plan / tasks alignment
8. **Implement** — `speckit_implement` — Track completion with checklist gate and regex-safe marking
9. **Tasks to Issues** — `speckit_tasks_to_issues` — Push tasks to GitHub as issues

---

## Project Structure

```
src/
├── index.ts                   # Entry point — stdio transport
├── server.ts                  # MCP server — handler registration
├── cli.ts                     # spec-kit CLI wrapper (child_process)
├── tools/
│   ├── index.ts               # Tool registry
│   ├── init.ts                # speckit_init
│   ├── check.ts               # speckit_check
│   ├── version.ts             # speckit_version
│   ├── status.ts              # speckit_status
│   ├── constitution.ts        # speckit_constitution
│   ├── specify.ts             # speckit_specify
│   ├── plan.ts                # speckit_plan
│   ├── tasks.ts               # speckit_tasks
│   ├── implement.ts           # speckit_implement
│   ├── clarify.ts             # speckit_clarify
│   ├── analyze.ts             # speckit_analyze
│   ├── checklist.ts           # speckit_checklist
│   └── tasks-to-issues.ts     # speckit_tasks_to_issues
├── resources/
│   └── index.ts               # MCP resource handlers
└── prompts/
    └── index.ts               # SDD workflow prompts
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
