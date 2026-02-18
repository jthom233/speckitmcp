import * as fs from "fs/promises";
import * as path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { assertPathWithinRoot } from "../validation.js";

function getProjectRoot(): string {
  return process.env.SPECKIT_PROJECT_PATH ?? process.cwd();
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function listResources() {
  const root = getProjectRoot();
  const resources: Array<{
    uri: string;
    name: string;
    description: string;
    mimeType: string;
  }> = [];

  // Constitution
  const constitutionPath = path.join(root, ".specify", "memory", "constitution.md");
  if (await fileExists(constitutionPath)) {
    resources.push({
      uri: "speckit://constitution",
      name: "Project Constitution",
      description: "Project governing principles and constraints",
      mimeType: "text/markdown",
    });
  }

  // Templates
  const templatesDir = path.join(root, ".specify", "templates");
  if (await dirExists(templatesDir)) {
    try {
      const templates = await fs.readdir(templatesDir);
      for (const tmpl of templates) {
        if (tmpl.endsWith(".md")) {
          const name = tmpl.replace(".md", "");
          resources.push({
            uri: `speckit://templates/${name}`,
            name: `Template: ${name}`,
            description: `Spec-kit template for ${name}`,
            mimeType: "text/markdown",
          });
        }
      }
    } catch (err) {
      console.error(`Failed to read templates directory: ${err}`);
    }
  }

  // Feature specs
  const specsDir = path.join(root, "specs");
  if (await dirExists(specsDir)) {
    try {
      const features = await fs.readdir(specsDir, { withFileTypes: true });
      for (const feature of features) {
        if (!feature.isDirectory()) continue;
        const featureDir = path.join(specsDir, feature.name);
        const artifacts = ["spec", "plan", "tasks", "checklist", "clarifications"];

        for (const artifact of artifacts) {
          const filePath = path.join(featureDir, `${artifact}.md`);
          if (await fileExists(filePath)) {
            resources.push({
              uri: `speckit://specs/${feature.name}/${artifact}`,
              name: `${feature.name}/${artifact}`,
              description: `${artifact} for feature "${feature.name}"`,
              mimeType: "text/markdown",
            });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to read specs directory: ${err}`);
    }
  }

  return { resources };
}

export async function readResource(uri: string) {
  const root = getProjectRoot();
  const parsed = uri.replace("speckit://", "");

  let filePath: string;

  if (parsed === "constitution") {
    filePath = path.join(root, ".specify", "memory", "constitution.md");
  } else if (parsed.startsWith("templates/")) {
    const templateName = parsed.replace("templates/", "");
    // Validate template name has no path traversal
    if (templateName.includes("..") || templateName.includes("/") || templateName.includes("\\")) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid template name: ${templateName}`);
    }
    filePath = path.join(root, ".specify", "templates", `${templateName}.md`);
  } else if (parsed.startsWith("specs/")) {
    const parts = parsed.replace("specs/", "").split("/");
    if (parts.length !== 2) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid spec URI format: ${uri}. Expected speckit://specs/{feature}/{artifact}`
      );
    }
    const [featureName, artifactName] = parts;
    // Validate no path traversal in either part
    if (featureName.includes("..") || artifactName.includes("..")) {
      throw new McpError(ErrorCode.InvalidParams, `Path traversal not allowed in URI: ${uri}`);
    }
    filePath = path.join(root, "specs", featureName, `${artifactName}.md`);
  } else {
    throw new McpError(ErrorCode.InvalidParams, `Unknown resource URI: ${uri}`);
  }

  // Final path traversal check
  assertPathWithinRoot(filePath, root);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  } catch {
    throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${filePath}`);
  }
}
