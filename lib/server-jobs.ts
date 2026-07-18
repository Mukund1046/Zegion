import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  getRequiredEnv,
  getJsonlPath,
  getBookmarksOutputPath,
  getRepoRoot,
} from "@/lib/native-config";

const APP_ROOT = getRepoRoot();
const FT_CLI = path.join(APP_ROOT, "node_modules", "fieldtheory", "bin", "ft.mjs");
const EXPORT_SCRIPT = path.join(APP_ROOT, "lib", "export-bookmarks.js");
const FOLDER_SYNC_SCRIPT = path.join(APP_ROOT, "lib", "sync-folders.js");

const jobState = {
  running: false,
  type: null as string | null,
  message: "Local cache ready",
  lastError: null as string | null,
};

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function getDataDir(): string {
  return path.dirname(getJsonlPath());
}

export function readStatusSnapshot() {
  const bookmarksPayload = readJsonFile<
    { bookmarks?: unknown[]; folders?: unknown[] } | unknown[]
  >(getBookmarksOutputPath(), { bookmarks: [], folders: [] });

  const bookmarks = Array.isArray(bookmarksPayload)
    ? bookmarksPayload
    : bookmarksPayload.bookmarks || [];
  const folders = Array.isArray((bookmarksPayload as { folders?: unknown[] })?.folders)
    ? (bookmarksPayload as { folders: unknown[] }).folders
    : [];
  const meta = readJsonFile<Record<string, string>>(
    path.join(getDataDir(), "bookmarks-meta.json"),
    {}
  );

  return {
    running: jobState.running,
    type: jobState.type,
    message: jobState.message,
    lastError: jobState.lastError,
    bookmarkCount: bookmarks.length,
    folderCount: folders.length,
    dataDir: getDataDir(),
    lastSyncedAt:
      meta.lastRunAt || meta.lastIncrementalSyncAt || meta.lastFullSyncAt || null,
    cookieMode:
      process.env.X_CT0 && process.env.X_AUTH_TOKEN ? "manual-firefox" : "missing",
  };
}

function runNodeScript(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: APP_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          stderr.trim() || stdout.trim() || `Command failed with exit code ${code}`
        )
      );
    });
  });
}

async function withJobLock<T>(type: string, job: () => Promise<T>): Promise<T> {
  if (jobState.running) {
    const error = new Error(`${jobState.type || "A job"} is already running`) as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    throw error;
  }

  jobState.running = true;
  jobState.type = type;
  jobState.message = type === "sync" ? "Syncing bookmarks…" : "Re-indexing cache…";
  jobState.lastError = null;

  try {
    const result = await job();
    jobState.message = type === "sync" ? "Sync complete" : "Index refreshed";
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    jobState.message = message;
    jobState.lastError = message;
    throw error;
  } finally {
    jobState.running = false;
    jobState.type = null;
  }
}

export async function syncBookmarks() {
  return withJobLock("sync", async () => {
    const ct0 = getRequiredEnv("X_CT0");
    const authToken = getRequiredEnv("X_AUTH_TOKEN");

    await runNodeScript([
      FT_CLI,
      "sync",
      "--cookies",
      ct0,
      authToken,
      "--max-minutes",
      "30",
      "--yes",
    ]);

    let folderSyncWarning: string | null = null;
    try {
      await runNodeScript([FOLDER_SYNC_SCRIPT]);
    } catch (error) {
      folderSyncWarning = error instanceof Error ? error.message : "Folder sync failed";
    }

    await runNodeScript([EXPORT_SCRIPT]);

    return {
      ok: true,
      warning: folderSyncWarning,
      ...readStatusSnapshot(),
    };
  });
}

export async function reindexBookmarks() {
  return withJobLock("reindex", async () => {
    await runNodeScript([FT_CLI, "index", "--force"]);
    await runNodeScript([FT_CLI, "classify", "--regex"]);
    await runNodeScript([EXPORT_SCRIPT]);

    return {
      ok: true,
      ...readStatusSnapshot(),
    };
  });
}

export function readBookmarksData() {
  const filePath = getBookmarksOutputPath();
  if (!fs.existsSync(filePath)) {
    return { bookmarks: [], folders: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(raw)) {
    return { bookmarks: raw, folders: [] };
  }
  return {
    bookmarks: raw.bookmarks || [],
    folders: raw.folders || [],
  };
}
