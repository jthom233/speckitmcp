import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_TIMEOUT = 60_000;

/**
 * Execute the spec-kit CLI (`specify` command) with given arguments.
 */
export async function runSpecKitCli(
  args: string[],
  options?: {
    cwd?: string;
    timeout?: number;
    stdin?: string;
  }
): Promise<CliResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const cmd = `specify ${args.join(" ")}`;

  try {
    const result = await execAsync(cmd, {
      cwd: options?.cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
    };

    if (execError.killed) {
      return {
        stdout: execError.stdout ?? "",
        stderr: `Command timed out after ${timeout}ms. Try increasing the timeout.`,
        exitCode: 124,
      };
    }

    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? String(error),
      exitCode: typeof execError.code === "number" ? execError.code : 1,
    };
  }
}

/**
 * Check if the spec-kit CLI is available.
 */
export async function isSpecKitInstalled(): Promise<boolean> {
  try {
    const result = await runSpecKitCli(["version"], { timeout: 10_000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get spec-kit version info.
 */
export async function getSpecKitVersion(): Promise<string> {
  const result = await runSpecKitCli(["version"], { timeout: 10_000 });
  if (result.exitCode !== 0) {
    throw new Error(
      "spec-kit is not installed. Install with: uv tool install --from git+https://github.com/github/spec-kit.git specify-cli"
    );
  }
  return result.stdout;
}

export const INSTALL_INSTRUCTIONS = `spec-kit (specify CLI) is not installed.

Install with one of:
  uv tool install --from git+https://github.com/github/spec-kit.git specify-cli
  pip install git+https://github.com/github/spec-kit.git

Then verify: specify version`;
