import * as path from "path";
import * as fs from "fs/promises";

/**
 * Load a template by name from the templates directory.
 * Falls back to `embeddedDefault` if the template file does not exist (ENOENT).
 * Any other filesystem error is re-thrown.
 */
export async function loadTemplate(
  templateName: string,
  templatesDir: string,
  embeddedDefault: string
): Promise<string> {
  const templatePath = path.join(templatesDir, `${templateName}.md`);
  try {
    return await fs.readFile(templatePath, "utf-8");
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return embeddedDefault;
    }
    throw err;
  }
}
