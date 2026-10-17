/** Shared read-only access to the FT bookmark store for eval scripts. */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FT_CLI = join(ROOT, "node_modules", "fieldtheory", "bin", "ft.mjs");

/** Full entry list via `ft list` (same source as export-bookmarks.js). */
export function loadEntries(limit = 2000) {
  const result = spawnSync(
    process.execPath,
    [FT_CLI, "list", "--json", "--limit", String(limit)],
    {
      cwd: ROOT,
      env: process.env,
      encoding: "utf8",
      timeout: 300000,
      maxBuffer: 50 * 1024 * 1024,
    }
  );
  if (result.status !== 0) {
    throw new Error(`ft list failed: ${(result.stderr || "").slice(0, 300)}`);
  }
  const clean = result.stdout.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").trim();
  return JSON.parse(clean.slice(clean.indexOf("[")));
}
