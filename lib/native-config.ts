import fs from "fs";
import path from "path";
import os from "os";

const APP_ROOT = process.cwd();
const ENV_PATH = path.join(APP_ROOT, ".env");

if (fs.existsSync(ENV_PATH)) {
  const contents = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function firstDefined(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => typeof v === "string" && v.trim() !== "");
}

function getDataDir(): string {
  return firstDefined(
    process.env.FT_DATA_DIR,
    path.join(os.homedir(), ".ft-bookmarks")
  )!;
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Set it in your environment or .env file before running this script.`
    );
  }
  return value.trim();
}

export function getJsonlPath(): string {
  const explicitPath = firstDefined(process.env.X_BOOKMARKS_JSONL);
  if (explicitPath) return path.resolve(APP_ROOT, explicitPath);

  const ftPath = path.resolve(getDataDir(), "bookmarks.jsonl");
  if (fs.existsSync(ftPath)) return ftPath;

  return path.resolve(APP_ROOT, "data", "bookmarks", "bookmarks.jsonl");
}

function resolvePath(value?: string, fallback?: string): string {
  return path.resolve(APP_ROOT, firstDefined(value, fallback)!);
}

function getOutputDir(): string {
  return resolvePath(
    process.env.X_OUTPUT_DIR,
    path.join(APP_ROOT, "data", "output")
  );
}

export function getBookmarksOutputPath(): string {
  return resolvePath(
    process.env.X_BOOKMARKS_OUTPUT,
    path.join(getOutputDir(), "bookmarks-data.json")
  );
}

export function getRepoRoot(): string {
  return APP_ROOT;
}
