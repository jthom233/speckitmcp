import * as path from "path";
import * as fs from "fs/promises";

export interface ProjectStructure {
  initialized: boolean;
  specifyDir: string;
  specsDir: string;
  scriptsDir: string;
  templatesDir: string;
  memoryDir: string;
}

/**
 * Resolve the project root directory.
 * Priority: explicit argument > SPECKIT_PROJECT_PATH env var > process.cwd()
 */
export function resolveProjectRoot(explicitPath?: string): string {
  if (explicitPath !== undefined && explicitPath !== "") {
    return path.resolve(explicitPath);
  }
  const envPath = process.env["SPECKIT_PROJECT_PATH"];
  if (envPath !== undefined && envPath !== "") {
    return path.resolve(envPath);
  }
  return process.cwd();
}

/**
 * Check which spec-kit directories exist under the given project root.
 * `initialized` is true if the `.specify/` directory exists.
 */
export async function checkProjectInitialized(root: string): Promise<ProjectStructure> {
  const specifyDir = path.join(root, ".specify");
  const specsDir = path.join(root, "specs");
  const scriptsDir = path.join(root, ".specify", "scripts");
  const templatesDir = path.join(root, ".specify", "templates");
  const memoryDir = path.join(root, ".specify", "memory");

  let initialized = false;
  try {
    const stat = await fs.stat(specifyDir);
    initialized = stat.isDirectory();
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code !== "ENOENT") {
      throw err;
    }
    // ENOENT — not initialized
  }

  return {
    initialized,
    specifyDir,
    specsDir,
    scriptsDir,
    templatesDir,
    memoryDir,
  };
}
