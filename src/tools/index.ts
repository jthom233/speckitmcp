import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { initTool } from "./init.js";
import { checkTool } from "./check.js";
import { statusTool } from "./status.js";
import { versionTool } from "./version.js";
import { specifyTool } from "./specify.js";
import { planTool } from "./plan.js";
import { tasksTool } from "./tasks.js";
import { implementTool } from "./implement.js";
import { clarifyTool } from "./clarify.js";
import { analyzeTool } from "./analyze.js";
import { checklistTool } from "./checklist.js";
import { constitutionTool } from "./constitution.js";

export interface ToolDef {
  definition: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
  execute(args: Record<string, unknown>): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

const tools: ToolDef[] = [
  initTool,
  checkTool,
  versionTool,
  statusTool,
  constitutionTool,
  specifyTool,
  planTool,
  tasksTool,
  implementTool,
  clarifyTool,
  analyzeTool,
  checklistTool,
];

const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

export function getAllTools() {
  return tools.map((t) => t.definition);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new McpError(ErrorCode.MethodNotFound, `Tool "${name}" not found`);
  }
  return tool.execute(args);
}
