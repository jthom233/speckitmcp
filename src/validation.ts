import * as path from "path";
import * as fs from "fs/promises";
import { z } from "zod";

/**
 * Zod schema for feature names — alphanumeric, dash, underscore only.
 * Prevents path traversal and invalid filesystem characters.
 */
export const featureNameSchema = z
  .string()
  .min(1, "Feature name cannot be empty")
  .max(255, "Feature name too long")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    "Feature name must start with alphanumeric and contain only alphanumeric, dash, or underscore characters"
  );

/**
 * Validate that a resolved file path stays within the project root.
 * Prevents path traversal attacks.
 */
export function assertPathWithinRoot(filePath: string, root: string): void {
  const normalizedFile = path.resolve(filePath);
  const normalizedRoot = path.resolve(root);
  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw new Error(`Path traversal detected: ${filePath} escapes project root ${root}`);
  }
}

/**
 * Validate that a directory exists, return a clear error if not.
 */
export async function assertDirExists(dirPath: string, label: string): Promise<void> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`${label} exists but is not a directory: ${dirPath}`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${label} does not exist: ${dirPath}`);
    }
    throw err;
  }
}
