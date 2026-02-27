import * as path from "path";
import * as fs from "fs/promises";
import { spawn } from "child_process";

export interface ScriptResult {
  success: boolean;
  json?: unknown;
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_TIMEOUT = 30_000;

/**
 * Return the script file extension for the current platform.
 */
export function getScriptExtension(): "sh" | "ps1" {
  return process.platform === "win32" ? "ps1" : "sh";
}

/**
 * Run a platform-aware helper script by name.
 * On Windows, executes `{scriptsDir}/powershell/{scriptName}.ps1` via powershell.exe.
 * On Unix, executes `{scriptsDir}/bash/{scriptName}.sh` via bash.
 *
 * If the script file does not exist, returns a failure result without throwing.
 * stdout is parsed as JSON if valid; the parsed value is set on the `json` field.
 */
export async function runHelperScript(
  scriptName: string,
  args: string[],
  options: { cwd: string; scriptsDir: string; timeout?: number }
): Promise<ScriptResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const isWindows = process.platform === "win32";

  const scriptPath = isWindows
    ? path.join(options.scriptsDir, "powershell", `${scriptName}.ps1`)
    : path.join(options.scriptsDir, "bash", `${scriptName}.sh`);

  try {
    await fs.access(scriptPath);
  } catch {
    return {
      success: false,
      json: undefined,
      stdout: "",
      stderr: `Script not found: ${scriptPath}`,
      exitCode: -1,
    };
  }

  const command = isWindows ? "powershell.exe" : "bash";
  const spawnArgs = isWindows
    ? ["-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args]
    : [scriptPath, ...args];

  return new Promise((resolve) => {
    const child = spawn(command, spawnArgs, {
      cwd: options.cwd,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, timeout);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.stdin.end();

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        success: false,
        json: undefined,
        stdout,
        stderr: stderr || err.message,
        exitCode: 1,
      });
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          success: false,
          json: undefined,
          stdout,
          stderr: `Script timed out after ${timeout}ms.`,
          exitCode: 124,
        });
        return;
      }

      const exitCode = code ?? 1;
      const success = exitCode === 0;

      let json: unknown = undefined;
      const trimmed = stdout.trim();
      if (trimmed.length > 0) {
        try {
          json = JSON.parse(trimmed);
        } catch {
          // stdout is not JSON — leave json undefined
        }
      }

      resolve({ success, json, stdout, stderr, exitCode });
    });
  });
}
