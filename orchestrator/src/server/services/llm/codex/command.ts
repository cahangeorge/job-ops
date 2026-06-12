import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

let cachedCommand: string | null = null;

function findWorkspaceCodexBin(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, "node_modules", ".bin", "codex");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

export function resolveCodexCommand(): string {
  if (cachedCommand) {
    return cachedCommand;
  }

  const override = process.env.CODEX_APP_SERVER_BIN?.trim();
  if (override) {
    cachedCommand = override;
    return cachedCommand;
  }

  const localBin = findWorkspaceCodexBin(process.cwd());
  cachedCommand = localBin || "codex";
  return cachedCommand;
}

export function __resetResolvedCodexCommandForTests(): void {
  cachedCommand = null;
}
