import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  getJsonlPath,
  getBookmarksOutputPath,
  getRepoRoot,
} from "@/lib/native-config";
import {
  readCookieConfig,
  describeCookieMode,
} from "@/lib/cookie-config";
import {
  hasBrowserProfile,
  readKeyPrefix,
  resolveCookieProfile,
} from "./browser-profiles";
import {
  applyReviewedCategories,
  listClassificationRuns,
} from "./classify/workflow.mjs";
import {
  createLibraryBackup,
  listLibraryBackups,
  restoreLibraryBackup,
} from "./library-backup.js";

const APP_ROOT = getRepoRoot();
const FT_CLI = path.join(APP_ROOT, "node_modules", "fieldtheory", "bin", "ft.mjs");
const EXPORT_SCRIPT = path.join(APP_ROOT, "lib", "export-bookmarks.js");
const FOLDER_SYNC_SCRIPT = path.join(APP_ROOT, "lib", "sync-folders.js");
const MANUAL_SYNC_SCRIPT = path.join(APP_ROOT, "lib", "sync-manual.mjs");
const CLASSIFY_RUNS_DIR = path.join(path.dirname(getBookmarksOutputPath()), "classify-runs");
const LIBRARY_BACKUPS_DIR = path.join(path.dirname(getBookmarksOutputPath()), "backups");
const FOLDERS_OUTPUT_PATH = path.join(path.dirname(getBookmarksOutputPath()), "folders-data.json");
let activeClassificationRun: string | null = null;

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
    running: jobState.running || Boolean(activeClassificationRun),
    type: jobState.type || (activeClassificationRun ? "classify" : null),
    message: jobState.running
      ? jobState.message
      : activeClassificationRun
        ? "Classifying with Field Theory…"
        : jobState.message,
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
    classify: readClassifyAvailability(),
  };
}

function runNodeScript(
  args: string[],
  timeoutMs = 300000,
  stdinInput?: string,
  onStart?: (pid: number) => void,
  onStderr?: (chunk: string) => void
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const childEnv: Record<string, string | undefined> = {
      ...process.env,
    };
    delete childEnv.X_CT0;
    delete childEnv.X_AUTH_TOKEN;
    if (stdinInput !== undefined) childEnv.ZEGION_COOKIE_STDIN = "1";

    const child = spawn(process.execPath, args, {
      cwd: APP_ROOT,
      env: childEnv as NodeJS.ProcessEnv,
      stdio: [stdinInput === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (child.pid) onStart?.(child.pid);
    if (stdinInput !== undefined) child.stdin?.end(stdinInput);

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onStderr?.(text);
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
  if (jobState.running || activeClassificationRun) {
    const error = new Error(`${jobState.type || (activeClassificationRun ? "Classification" : "A job")} is already running`) as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    throw error;
  }

  jobState.running = true;
  jobState.type = type;
  jobState.message =
    type === "sync"
      ? "Syncing bookmarks…"
      : type === "classify"
        ? "Classifying with Field Theory…"
        : type === "backup"
          ? "Backing up library…"
          : type === "restore"
            ? "Restoring library…"
            : "Re-indexing cache…";
  jobState.lastError = null;

  try {
    const result = await job();
    jobState.message =
      type === "sync"
        ? "Sync complete"
        : type === "classify"
          ? "Field Theory classification complete"
          : type === "backup"
            ? "Backup complete"
            : type === "restore"
              ? "Library restored"
              : "Index refreshed";
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
  stdinInput?: string;
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
  if (/401|403|unauthorized|forbidden|authentication failed|cookies? rejected/i.test(rawMessage)) {
    return (
      `Sync failed: X rejected the saved ${name} session. Sign into x.com in ${name} again, ` +
      `or replace the Manual cookies with fresh ct0 and auth_token values.`
    );
  }
  return (
    `Sync failed: Could not read X cookies from ${browser || "the selected browser"}. ` +
    `Sign into x.com there and retry, or use Manual mode.`
  );
}

export function shouldPreflightBrowserProfile(source: string, browser?: string): boolean {
  // Firefox profile discovery belongs to Field Theory's existing sync path.
  return source === "auto" && Boolean(browser) && browser !== "firefox";
}

// Pure argument planning for `ft sync`. Manual cookie values are returned in
// stdinInput, never in ftArgs; cookieOverride is used only to prepare the
// separate folder-sync stdin payload.
export function buildSyncArgs(
  config: { source: string; browser?: string; ct0?: string; authToken?: string; chromeProfileDirectory?: string },
  ftCliPath: string,
  manualSyncScript = "lib/sync-manual.mjs"
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
        manualSyncScript, "sync",
        "--max-minutes", "30",
        "--yes", "--no-media",
      ],
      cookieOverride: { cookies: config.ct0, authToken: config.authToken },
      stdinInput: JSON.stringify({ ct0: config.ct0, authToken: config.authToken }),
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
    const { ftArgs, cookieOverride, stdinInput } = buildSyncArgs(
      { ...config, chromeProfileDirectory },
      FT_CLI,
      MANUAL_SYNC_SCRIPT
    );

    // Fail fast on a fresh clone: missing CLI install or no browser profile
    // for auto mode. Without this, `ft sync` runs for minutes before failing
    // with an unactionable error.
    if (!fs.existsSync(FT_CLI)) {
      throw new Error(
        "Sync failed: Field Theory CLI not found. Run npm install in the project directory, then try again."
      );
    }
    // Firefox's profile discovery is intentionally delegated to Field Theory,
    // matching the original working `ft sync --browser firefox` flow. A local
    // profiles.ini/cookies.sqlite check was stricter than Firefox's supported
    // profile resolution and caused valid installs to fail before sync began.
    if (
      shouldPreflightBrowserProfile(config.source, config.browser) &&
      config.browser &&
      !hasBrowserProfile(config.browser)
    ) {
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
      await runNodeScript(ftArgs, 300000, stdinInput);
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
      const folderCredentials = cookieOverride
        ? JSON.stringify({ ct0: cookieOverride.cookies, authToken: cookieOverride.authToken })
        : undefined;
      await runNodeScript([FOLDER_SYNC_SCRIPT], 300000, folderCredentials);
    } catch (error) {
      folderSyncWarning = "Folder refresh did not complete; bookmark sync succeeded.";
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
    await runNodeScript([FT_CLI, "index"]);
    await runNodeScript([EXPORT_SCRIPT]);

    return {
      ok: true,
      ...readStatusSnapshot(),
    };
  });
}

/** Snapshot the durable library stores into data/output/backups. */
export async function backupLibrary() {
  return withJobLock("backup", async () => {
    const backup = createLibraryBackup({
      outputDir: path.dirname(getBookmarksOutputPath()),
      jsonlPath: getJsonlPath(),
      backupsDir: LIBRARY_BACKUPS_DIR,
      now: new Date(),
    });
    return { ok: true, backup };
  });
}

export function listLibraryBackupsAction() {
  return listLibraryBackups(LIBRARY_BACKUPS_DIR);
}

/** Replace live stores with a dated backup snapshot (integrity-verified). */
export async function restoreLibraryBackupAction(backupId: string) {
  return withJobLock("restore", async () => {
    const restored = restoreLibraryBackup({
      backupsDir: LIBRARY_BACKUPS_DIR,
      backupId,
      outputDir: path.dirname(getBookmarksOutputPath()),
      jsonlPath: getJsonlPath(),
    });
    return { ok: true, restored, ...readStatusSnapshot() };
  });
}


/** Run Field Theory's native Codex/Claude classifier against its bookmark DB. */
export async function classifyBookmarks() {
  if (jobState.running) {
    const error = new Error(`${jobState.type || "A job"} is already running`) as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }
  if (activeClassificationRun) {
    const error = new Error("A classification run is already running.") as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }
  const requestedEngine = process.env.FT_CLASSIFY_ENGINE?.trim().toLowerCase();
  if (requestedEngine && !["codex", "claude"].includes(requestedEngine)) {
    const error = new Error("Classification unavailable: FT_CLASSIFY_ENGINE must be codex or claude.") as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  if (!fs.existsSync(FT_CLI)) {
    throw new Error("Classification unavailable: Field Theory CLI was not found. Run npm install, then restart the app.");
  }
  const engineAvailable = requestedEngine
    ? fieldTheoryEngineAvailable(requestedEngine)
    : fieldTheoryEngineAvailable("claude") || fieldTheoryEngineAvailable("codex");
  if (!engineAvailable) {
    const engineHint = requestedEngine ? ` ${requestedEngine}` : " Codex or Claude";
    throw new Error(`Classification unavailable: Field Theory${engineHint} CLI was not found. Install and authenticate it on this machine.`);
  }
  const chosen = requestedEngine || "fieldtheory-default";
  const runId = `run-${randomUUID()}`;
  const statusPath = path.join(CLASSIFY_RUNS_DIR, `${runId}.status.json`);
  const args = buildFieldTheoryClassifyArgs(FT_CLI, requestedEngine);
  fs.mkdirSync(CLASSIFY_RUNS_DIR, { recursive: true });
  writeJsonStatus(statusPath, {
    runId,
    state: "queued",
    provider: "fieldtheory",
    engine: chosen,
    phase: "starting",
    progress: { completed: 0, total: 0 },
    startedAt: new Date().toISOString(),
  });
  activeClassificationRun = runId;

  // Field Theory commits each completed batch to its SQLite database. Keep
  // the HTTP request short and persist only counts/progress, never prompts.
  void (async () => {
    try {
      const startedAt = new Date().toISOString();
      const totals = { categories: 0, domains: 0 };
      let phase: "starting" | "categories" | "domains" = "starting";
      let lineBuffer = "";
      let processId: number | null = null;
      const onProgress = (chunk: string) => {
        lineBuffer += chunk;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || "";
        for (const line of lines) {
          const match = line.match(/\b(Categories|Domains):\s*(\d+)\/(\d+)/i);
          if (!match) continue;
          phase = match[1].toLowerCase() as "categories" | "domains";
          const completed = Number(match[2]);
          totals[phase] = Number(match[3]);
          const total = totals.categories + totals.domains || totals[phase];
          const overallCompleted = phase === "categories" ? completed : totals.categories + completed;
          writeJsonStatus(statusPath, {
            runId,
            state: "running",
            provider: "fieldtheory",
            engine: chosen,
            phase,
            progress: { completed: overallCompleted, total },
            startedAt,
            pid: processId,
          });
        }
      };
      const { stdout, stderr } = await runNodeScript(args, 10800000, undefined, (pid) => {
        processId = pid;
        writeJsonStatus(statusPath, {
          runId,
          state: "running",
          provider: "fieldtheory",
          engine: chosen,
          pid,
          phase: "starting",
          progress: { completed: 0, total: 0 },
          startedAt,
        });
      }, onProgress);
      const telemetry = parseFieldTheoryClassificationSummary(`${stdout}\n${stderr}\n${lineBuffer}`);
      writeJsonStatus(statusPath, {
        runId,
        state: "complete",
        provider: "fieldtheory",
        engine: chosen,
        committed: true,
        phase: "complete",
        progress: {
          completed: telemetry.categoriesTotal + telemetry.domainsTotal,
          total: telemetry.categoriesTotal + telemetry.domainsTotal,
        },
        telemetry,
        completedAt: new Date().toISOString(),
      });
      writeJsonStatus(path.join(CLASSIFY_RUNS_DIR, `${runId}.json`), {
        runId,
        provider: "fieldtheory",
        engine: chosen,
        state: "complete",
        startedAt,
        completedAt: new Date().toISOString(),
        telemetry,
        results: [],
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Classify failed";
      const message = /timed out/i.test(raw)
        ? "Classify failed: Field Theory timed out. Completed batches remain committed; check the Field Theory engine and retry."
        : /No supported LLM CLI found|not on PATH|Install it and log in/i.test(raw)
          ? "Classify unavailable: authenticate a supported Field Theory engine (Codex or Claude) on this machine."
          : "Classify failed: Field Theory could not finish classification. Completed batches remain committed; check engine authentication and the server terminal, then retry.";
      writeJsonStatus(statusPath, {
        runId,
        state: "failed",
        provider: "fieldtheory",
        engine: chosen,
        committed: true,
        error: message,
        completedAt: new Date().toISOString(),
      });
      writeJsonStatus(path.join(CLASSIFY_RUNS_DIR, `${runId}.json`), {
        runId,
        provider: "fieldtheory",
        engine: chosen,
        state: "failed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        results: [],
      });
    } finally {
      activeClassificationRun = null;
    }
  })();

  return { ok: true, runId, state: "queued" };
}

function writeJsonStatus(filePath: string, value: Record<string, unknown>) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

export function getClassificationJobStatus(runId: string) {
  if (!/^run-[a-zA-Z0-9_-]{1,80}$/.test(runId)) return null;
  const filePath = path.join(CLASSIFY_RUNS_DIR, `${runId}.status.json`);
  try {
    const status = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (["queued", "running"].includes(status.state) && activeClassificationRun !== runId) {
      const pid = Number(status.pid);
      let stillRunning = false;
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          stillRunning = true;
        } catch (error) {
          stillRunning = (error as NodeJS.ErrnoException).code === "EPERM";
        }
      }
      if (!stillRunning) {
        status.state = "failed";
        status.error = "Classification was interrupted by a server restart. Completed Field Theory batches remain committed; retry to continue with unclassified bookmarks.";
        status.completedAt = new Date().toISOString();
        writeJsonStatus(filePath, status);
      }
    }
    return status;
  } catch {
    return null;
  }
}

export function getClassificationRuns(limit = 8) {
  return listClassificationRuns(CLASSIFY_RUNS_DIR, limit);
}

/** Classify availability for preflight-gating the UI button. */
export function readClassifyAvailability(): {
  available: boolean;
  hint: string | null;
} {
  const cliAvailable = fs.existsSync(FT_CLI);
  const engine = process.env.FT_CLASSIFY_ENGINE?.trim().toLowerCase();
  const engineAvailable = engine
    ? fieldTheoryEngineAvailable(engine)
    : fieldTheoryEngineAvailable("claude") || fieldTheoryEngineAvailable("codex");
  const available = cliAvailable && engineAvailable;
  return {
    available,
    hint: available
      ? null
      : !cliAvailable
        ? "Classification unavailable: Field Theory CLI was not found. Run npm install, then restart the app."
        : engine && engine !== "codex" && engine !== "claude"
          ? "Classification unavailable: FT_CLASSIFY_ENGINE must be codex or claude."
          : "Classification unavailable: authenticate Codex or Claude for Field Theory on this machine.",
  };
}

function fieldTheoryEngineAvailable(engine: string): boolean {
  if (engine !== "codex" && engine !== "claude") return false;
  if (engine === "codex" && process.platform === "win32" && process.env.APPDATA) {
    if (fs.existsSync(path.join(process.env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js"))) return true;
  }
  return findExecutable(engine);
}

export function parseFieldTheoryClassificationSummary(output: string) {
  const readTotal = (kind: "Categories" | "Domains") => {
    const matches = [...output.matchAll(new RegExp(`${kind}:\\s*(\\d+)\\/(\\d+)\\s+classified`, "gi"))];
    const last = matches[matches.length - 1];
    return last ? { classified: Number(last[1]), total: Number(last[2]) } : { classified: 0, total: 0 };
  };
  const categories = readTotal("Categories");
  const domains = readTotal("Domains");
  return {
    categoriesClassified: categories.classified,
    categoriesTotal: categories.total,
    domainsClassified: domains.classified,
    domainsTotal: domains.total,
  };
}

export function buildFieldTheoryClassifyArgs(ftCliPath: string, engine?: string) {
  return [ftCliPath, "classify", ...(engine ? ["--engine", engine] : [])];
}

function findExecutable(name: string): boolean {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      try {
        if (fs.statSync(path.join(directory, `${name}${extension}`)).isFile()) return true;
      } catch {
        // Continue searching PATH without running a child process.
      }
    }
  }
  if (process.platform === "win32" && process.env.ProgramData) {
    return fs.existsSync(path.join(process.env.ProgramData, "chocolatey", "bin", `${name}.exe`));
  }
  return false;
}

export function readBookmarksData(options: { applyReviewedCategories?: boolean } = {}) {
  const filePath = getBookmarksOutputPath();
  if (!fs.existsSync(filePath)) {
    return { bookmarks: [], folders: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const prepareBookmarks = (bookmarks: any[]) => options.applyReviewedCategories === false
    ? bookmarks
    : applyReviewedCategories(bookmarks, CLASSIFY_RUNS_DIR);
  if (Array.isArray(raw)) {
    return { bookmarks: prepareBookmarks(raw), folders: [] };
  }
  return {
    bookmarks: prepareBookmarks(raw.bookmarks || []),
    folders: raw.folders || [],
  };
}
