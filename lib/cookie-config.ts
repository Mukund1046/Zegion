import fs from "fs";
import path from "path";
import os from "os";
import { normalizeCookieInput, normalizeManualCookies } from "@/lib/cookie-input";
import { resolveCookieConfigPath } from "./cookie-config-path.js";
import { encodeCredentials, decodeCredentials } from "./cookie-protection.js";

export interface CookieConfig {
  source: "auto" | "manual";
  browser?: "chrome" | "firefox" | "edge" | "brave";
  ct0?: string;
  authToken?: string;
}

const DEFAULT_CONFIG: CookieConfig = {
  source: "auto",
  browser: "firefox",
};

const CONFIG_FILE = "cookies-config.json";
// The app root is needed only to resolve legacy repository-relative paths.
// The cookie file itself remains per-user and outside the app bundle.
const APP_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd());

export function getCookieConfigPath(): string {
  return resolveCookieConfigPath({ env: process.env, repoRoot: APP_ROOT });
}

function readConfigFile(filePath: string): CookieConfig | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    let credentials: { ct0: string; authToken: string } | null = null;
    if (typeof raw.credentials === "string") {
      try {
        credentials = decodeCredentials(raw.credentials);
        if (!credentials) throw new Error("Invalid protected credentials");
      } catch (error) {
        // Auto mode does not consume saved manual cookies. In particular,
        // Windows DPAPI blobs are bound to the account/machine that created
        // them, so a cloned settings file must not prevent Firefox Auto from
        // working on this machine. Manual mode still fails closed below.
        if (raw.source !== "auto") throw error;
        credentials = null;
      }
    } else if (typeof raw.ct0 === "string" || typeof raw.authToken === "string") {
      // Legacy plaintext format, retained here only long enough to migrate.
      credentials = {
        ct0: typeof raw.ct0 === "string" ? raw.ct0 : "",
        authToken: typeof raw.authToken === "string" ? raw.authToken : "",
      };
    }
    const source = raw.source === "auto" || raw.source === "manual"
      ? raw.source
      : raw.source === undefined
        ? (credentials && (credentials.ct0 || credentials.authToken) ? "manual" : "auto")
        : null;
    if (!source) {
      throw new Error("Invalid cookie authentication source");
    }
    if (raw.browser !== undefined && !["chrome", "firefox", "edge", "brave"].includes(String(raw.browser))) {
      throw new Error("Invalid configured browser");
    }
    if (credentials && (typeof credentials.ct0 !== "string" || typeof credentials.authToken !== "string")) {
      throw new Error("Invalid credential payload");
    }
    return {
      source,
      browser: ["chrome", "firefox", "edge", "brave"].includes(String(raw.browser))
        ? (raw.browser as CookieConfig["browser"])
        : "firefox",
      ...(credentials ? credentials : {}),
    };
  } catch {
    throw new Error("Cookie settings could not be read or decrypted. Restore this user's backup or re-enter credentials.");
  }
}

function legacyConfigPaths(): string[] {
  const explicitJsonl = process.env.X_BOOKMARKS_JSONL?.trim();
  const dataRoot = process.env.FT_DATA_DIR?.trim() || path.join(os.homedir(), ".ft-bookmarks");
  const ftJsonl = path.resolve(dataRoot, "bookmarks.jsonl");
  const legacyJsonl = explicitJsonl
    ? path.resolve(APP_ROOT, explicitJsonl)
    : fs.existsSync(ftJsonl)
      ? ftJsonl
      : path.resolve(APP_ROOT, "data", "bookmarks", "bookmarks.jsonl");
  const candidates = [
    path.join(path.dirname(legacyJsonl), CONFIG_FILE),
    path.join(APP_ROOT, "data", "bookmarks", CONFIG_FILE),
  ];
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function persistConfig(filePath: string, config: CookieConfig): CookieConfig {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const next = { ...DEFAULT_CONFIG, ...config };
  const output: Record<string, unknown> = { source: next.source, browser: next.browser };
  if (next.source === "manual") {
    if (config.ct0 || config.authToken) {
      const credentials = {
        ct0: config.ct0 ? normalizeCookieInput(config.ct0, "ct0") : "",
        authToken: config.authToken ? normalizeCookieInput(config.authToken, "auth_token") : "",
      };
      output.credentials = encodeCredentials(credentials);
      next.ct0 = credentials.ct0;
      next.authToken = credentials.authToken;
    } else {
      delete next.ct0;
      delete next.authToken;
    }
  } else if (config.ct0 || config.authToken) {
    const credentials = {
      ct0: config.ct0 ? normalizeCookieInput(config.ct0, "ct0") : "",
      authToken: config.authToken ? normalizeCookieInput(config.authToken, "auth_token") : "",
    };
    output.credentials = encodeCredentials(credentials);
    next.ct0 = credentials.ct0;
    next.authToken = credentials.authToken;
  } else {
    delete next.ct0;
    delete next.authToken;
  }
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(output, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tempPath, filePath);
  return next;
}

export function readCookieConfig(): CookieConfig {
  const filePath = getCookieConfigPath();
  const current = readConfigFile(filePath);
  if (current) {
    // Move old plaintext files to stable, protected storage without deleting
    // the original; a failed DPAPI operation leaves the previous file intact.
    if (current.ct0 || current.authToken) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
        if (typeof raw.credentials !== "string") persistConfig(filePath, current);
      } catch {
        throw new Error("Legacy cookie settings could not be protected. The original file is retained; fix Windows DPAPI/permissions, then retry.");
      }
    }
    return current;
  }

  for (const legacyPath of legacyConfigPaths()) {
    if (legacyPath === path.resolve(filePath)) continue;
    let legacy: CookieConfig | null = null;
    try {
      legacy = readConfigFile(legacyPath);
    } catch {
      continue;
    }
    if (!legacy) continue;
    try {
      persistConfig(filePath, legacy);
      return legacy;
    } catch {
      throw new Error("Legacy cookie settings could not be migrated safely. The original file is retained; fix DPAPI/permissions, then retry.");
    }
  }

  // Older setups documented credentials in .env. Keep that setup usable,
  // but new settings are written to the stable protected config location.
  if (process.env.X_CT0 && process.env.X_AUTH_TOKEN) {
    const legacyEnv = { source: "manual" as const, ...normalizeManualCookies(process.env.X_CT0, process.env.X_AUTH_TOKEN) };
    persistConfig(filePath, legacyEnv);
    return legacyEnv;
  }
  return { ...DEFAULT_CONFIG };
}

export function writeCookieConfig(config: CookieConfig): CookieConfig {
  const filePath = getCookieConfigPath();
  return persistConfig(filePath, config);
}

export function describeCookieMode(config: CookieConfig): string {
  if (config.source === "auto" && config.browser) {
    return `auto:${config.browser}`;
  }
  if (config.source === "manual") {
    const hasBoth = Boolean(config.ct0 && config.authToken);
    return hasBoth ? "manual-runtime" : "manual-incomplete";
  }
  return "missing";
}
