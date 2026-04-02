import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const widgetDirPath = path.join(current, "apps", "widget");
    const parent = path.dirname(current);

    if (existsSync(packageJsonPath) && existsSync(widgetDirPath)) {
      return current;
    }

    if (parent === current) {
      return startDir;
    }

    current = parent;
  }
}

export function resolveRepoRoot(moduleUrl: string): string {
  return findRepoRoot(path.dirname(fileURLToPath(moduleUrl)));
}

export function resolveWidgetDistDir(moduleUrl: string): string {
  return path.join(resolveRepoRoot(moduleUrl), "apps", "widget", "dist");
}
