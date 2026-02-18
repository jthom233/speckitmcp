import { spawn } from "child_process";

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_TIMEOUT = 60_000;

/**
 * Execute the spec-kit CLI (`specify` command) with given arguments.
 * Uses spawn() to support stdin for interactive prompts.
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

  return new Promise((resolve) => {
    const child = spawn("specify", args, {
      cwd: options?.cwd,
      shell: true,
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

    // Send stdin if provided (e.g. "y\n" for interactive prompts)
    if (options?.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: stderr || err.message,
        exitCode: 1,
      });
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          stdout,
          stderr: `Command timed out after ${timeout}ms. Try increasing the timeout.`,
          exitCode: 124,
        });
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
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
