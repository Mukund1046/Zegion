import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  getJsonlPath,
  getBookmarksOutputPath,
  getRepoRoot,
} from "@/lib/native-config";
import {
  readCookieConfig,
  describeCookieMode,
} from "@/lib/cookie-config";
import { hasBrowserProfile, readKeyPrefix, resolveCookieProfile } from "./browser-profiles";

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

  const cookieConfig = readCookieConfig();
  const runtimeMode = describeCookieMode(cookieConfig);
  const fallbackMode =
    process.env.X_CT0 && process.env.X_AUTH_TOKEN ? "manual-firefox" : "missing";
  const cookieMode = runtimeMode !== "missing" ? runtimeMode : fallbackMode;

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
    cookieMode,
    cookieConfig: {
      source: cookieConfig.source,
      browser: cookieConfig.browser || null,
      hasCookies: Boolean(cookieConfig.ct0 && cookieConfig.authToken),
    },
  };
}

function runNodeScript(args: string[], cookieOverrides?: { cookies?: string; authToken?: string }, timeoutMs = 300000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const childEnv: Record<string, string | undefined> = {
      ...process.env,
    };
    if (cookieOverrides?.cookies) childEnv.X_CT0 = cookieOverrides.cookies;
    if (cookieOverrides?.authToken) childEnv.X_AUTH_TOKEN = cookieOverrides.authToken;

    const child = spawn(process.execPath, args, {
      cwd: APP_ROOT,
      env: childEnv as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Script timed out after ${timeoutMs / 1000}s`));
        return;
      }
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

export interface SyncPlan {
  ftArgs: string[];
  cookieOverride?: { cookies: string; authToken: string };
}

// Map a raw sync-child failure (FT stderr: paths, sqlite details) to a
// precise, actionable client message. The raw text is only pattern-matched
// here — never forwarded — so no session material or paths can leak.
// Every output starts with "Sync failed: " and passes sanitizeError.
export function mapSyncFailure(
  rawMessage: string,
  browser?: string,
  profile?: string
): string {
  const name = browser ? browser[0].toUpperCase() + browser.slice(1) : "the selected browser";
  if (/EBUSY|locked|Could not read .* Cookies database/i.test(rawMessage)) {
    return (
      `Sync failed: ${name}'s cookie file is locked while it is running. ` +
      `Close all ${name} windows and retry, or use Manual mode.`
    );
  }
  if (/No ct0 CSRF cookie/i.test(rawMessage)) {
    const where = profile ? ` (profile "${profile}")` : "";
    return (
      `Sync failed: no X login found in ${name}${where}. ` +
      `Sign into x.com there and retry, or use Manual mode.`
    );
  }
  return (
    `Sync failed: Could not read X cookies from ${browser || "the selected browser"}. ` +
    `Sign into x.com there and retry, or use Manual mode.`
  );
}

// Pure argument planning for `ft sync`. Extracted so the credential
// precedence (file config wins; env is only injected into folder/export
// children via cookieOverride) is locked by regression tests. Behavior is
// identical to the previous inline version.
export function buildSyncArgs(
  config: { source: string; browser?: string; ct0?: string; authToken?: string; chromeProfileDirectory?: string },
  ftCliPath: string
): SyncPlan {
  if (config.source === "auto" && config.browser) {
    return {
      ftArgs: [
        ftCliPath, "sync",
        "--browser", config.browser,
        // Chromium-family installs often have no `Default` profile (only
        // `Profile N`). Without this flag FT looks only at `Default` and
        // reports a missing Cookies database.
        ...(config.chromeProfileDirectory && config.chromeProfileDirectory !== "Default"
          ? ["--chrome-profile-directory", config.chromeProfileDirectory]
          : []),
        "--max-minutes", "30",
        "--yes", "--no-media",
      ],
      ...(config.ct0
        ? { cookieOverride: { cookies: config.ct0, authToken: config.authToken || "" } }
        : {}),
    };
  }
  if (config.source === "manual" && config.ct0 && config.authToken) {
    return {
      ftArgs: [
        ftCliPath, "sync",
        // Field Theory accepts manual credentials through its CLI option, not
        // environment variables. The child environment is still populated for
        // the folder sync that follows.
        "--cookies", config.ct0, config.authToken,
        "--max-minutes", "30",
        "--yes", "--no-media",
      ],
      cookieOverride: { cookies: config.ct0, authToken: config.authToken },
    };
  }
  if (config.source === "manual") {
    const error = new Error(
      "Sync failed: Manual mode requires both ct0 and auth_token."
    ) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return {
    ftArgs: [
      ftCliPath, "sync",
      "--max-minutes", "30",
      "--yes", "--no-media",
    ],
    ...(config.ct0
      ? { cookieOverride: { cookies: config.ct0, authToken: config.authToken || "" } }
      : {}),
  };
}

export async function syncBookmarks() {
  return withJobLock("sync", async () => {
    const config = readCookieConfig();
    // Chromium-family installs often have no `Default` profile (only
    // `Profile N`). Point FT at the profile that actually holds a Cookies
    // database instead of letting it fail on `Default`.
    let chromeProfileDirectory: string | undefined;
    if (
      config.source === "auto" &&
      config.browser &&
      ["chrome", "edge", "brave"].includes(config.browser)
    ) {
      try {
        chromeProfileDirectory =
          resolveCookieProfile(config.browser)?.profile;
      } catch {
        chromeProfileDirectory = undefined;
      }
    }
    const { ftArgs, cookieOverride } = buildSyncArgs(
      { ...config, chromeProfileDirectory },
      FT_CLI
    );

    // Fail fast on a fresh clone: missing CLI install or no browser profile
    // for auto mode. Without this, `ft sync` runs for minutes before failing
    // with an unactionable error.
    if (!fs.existsSync(FT_CLI)) {
      throw new Error(
        "Sync failed: Field Theory CLI not found. Run npm install in the project directory, then try again."
      );
    }
    if (config.source === "auto" && config.browser && !hasBrowserProfile(config.browser)) {
      throw new Error(
        `Sync failed: Could not find a ${config.browser} profile on this machine. Sign into x.com in ${config.browser} and retry, or use Manual mode with pasted cookies.`
      );
    }
    // Chromium-family browsers (Chrome 127+, Edge 127+, Brave equivalents)
    // wrap the os_crypt key with App-Bound Encryption, which only the
    // browser's own elevation service can unwrap — automatic extraction
    // cannot work there. Fail fast with a precise message instead of
    // running the sync CLI for minutes and then failing on auth.
    // Firefox has no os_crypt key concept and is unaffected.
    if (config.source === "auto" && config.browser && ["chrome", "edge", "brave"].includes(config.browser)) {
      let prefix = "missing";
      try {
        prefix = readKeyPrefix(config.browser);
      } catch {
        prefix = "missing";
      }
      if (prefix === "app-bound") {
        const name = config.browser[0].toUpperCase() + config.browser.slice(1);
        throw new Error(
          `Sync failed: ${name} on this machine uses App-Bound Encryption, ` +
            `which automatic extraction cannot read. ` +
            `Use Manual mode with pasted ct0/auth_token.`
        );
      }
    }

    try {
      await runNodeScript(ftArgs, cookieOverride);
    } catch (error) {
      // Do not return or log child stderr: it can include sensitive session
      // information. Classify it internally into a precise, actionable
      // message instead (mapSyncFailure never forwards the raw text).
      const raw = error instanceof Error ? error.message : "";
      const message =
        config.source === "manual"
          ? "Sync failed: Manual X cookies could not be used. Paste fresh ct0 and auth_token values from x.com, save, then try again."
          : mapSyncFailure(raw, config.browser, chromeProfileDirectory);
      console.error("[sync] Field Theory bookmark sync failed", {
        source: config.source,
        browser: config.browser || null,
      });
      throw new Error(message);
    }

    let folderSyncWarning: string | null = null;
    try {
      await runNodeScript([FOLDER_SYNC_SCRIPT], cookieOverride);
    } catch (error) {
      folderSyncWarning = error instanceof Error ? error.message : "Folder sync failed";
    }

    await runNodeScript([EXPORT_SCRIPT], cookieOverride);

    return {
      ok: true,
      warning: folderSyncWarning,
      ...readStatusSnapshot(),
    };
  });
}

export async function reindexBookmarks() {
  return withJobLock("reindex", async () => {
    await runNodeScript([FT_CLI, "index"]);
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
