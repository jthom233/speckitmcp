import * as fs from "fs/promises";
import * as path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { assertPathWithinRoot } from "../validation.js";
import { resolveProjectRoot } from "../project.js";

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
  const root = resolveProjectRoot();
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

        // Flat artifacts
        const artifacts = ["spec", "plan", "tasks", "checklist", "research", "data-model", "quickstart"];
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

        // Subdirectory artifacts: checklists/* and contracts/*
        for (const subdir of ["checklists", "contracts"]) {
          const subdirPath = path.join(featureDir, subdir);
          if (await dirExists(subdirPath)) {
            try {
              const files = await fs.readdir(subdirPath);
              for (const file of files) {
                if (file.endsWith(".md")) {
                  const name = file.replace(".md", "");
                  resources.push({
                    uri: `speckit://specs/${feature.name}/${subdir}/${name}`,
                    name: `${feature.name}/${subdir}/${name}`,
                    description: `${subdir.slice(0, -1)} "${name}" for feature "${feature.name}"`,
                    mimeType: "text/markdown",
                  });
                }
              }
            } catch (err) {
              console.error(`Failed to read ${subdir} directory for ${feature.name}: ${err}`);
            }
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
  const root = resolveProjectRoot();
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
    if (parts.length < 2) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid spec URI format: ${uri}. Expected speckit://specs/{feature}/{artifact}`
      );
    }
    const [featureName, artifactOrSubdir, ...rest] = parts;
    // Validate no path traversal in any part
    for (const part of [featureName, artifactOrSubdir, ...rest]) {
      if (part.includes("..")) {
        throw new McpError(ErrorCode.InvalidParams, `Path traversal not allowed in URI: ${uri}`);
      }
    }
    if ((artifactOrSubdir === "checklists" || artifactOrSubdir === "contracts") && rest.length === 1) {
      // speckit://specs/{feature}/checklists/{name} or specs/{feature}/contracts/{name}
      const name = rest[0];
      filePath = path.join(root, "specs", featureName, artifactOrSubdir, `${name}.md`);
    } else if (rest.length === 0) {
      // speckit://specs/{feature}/{artifact}
      filePath = path.join(root, "specs", featureName, `${artifactOrSubdir}.md`);
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid spec URI format: ${uri}. Expected speckit://specs/{feature}/{artifact} or speckit://specs/{feature}/{checklists|contracts}/{name}`
      );
    }
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
