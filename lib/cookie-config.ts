import fs from "fs";
import path from "path";
import { getJsonlPath } from "@/lib/native-config";

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

function getConfigPath(): string {
  return path.join(path.dirname(getJsonlPath()), CONFIG_FILE);
}

export function readCookieConfig(): CookieConfig {
  const filePath = getConfigPath();
  try {
    if (!fs.existsSync(filePath)) return { ...DEFAULT_CONFIG };
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeCookieConfig(config: CookieConfig): CookieConfig {
  const filePath = getConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const next = { ...DEFAULT_CONFIG, ...config };
  if (next.source === "manual") {
    next.ct0 = config.ct0?.trim() || "";
    next.authToken = config.authToken?.trim() || "";
  } else {
    delete next.ct0;
    delete next.authToken;
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf8");
  return next;
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
