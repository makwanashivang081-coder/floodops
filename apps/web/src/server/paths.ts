import { existsSync } from "node:fs";
import path from "node:path";

/** Resolve monorepo root whether cwd is repo root or apps/web (Vercel). */
export function repoRoot(): string {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), ".."),
    path.join(process.cwd(), "..", ".."),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "data", "cities.json"))) {
      return candidate;
    }
  }
  return path.join(process.cwd(), "..", "..");
}

export function dataDir(): string {
  return path.join(repoRoot(), "data");
}

/** Local disk in dev; ephemeral /tmp on Vercel (demo uploads). */
export function uploadsDir(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "floodops-uploads");
  }
  return path.join(repoRoot(), "uploads");
}
