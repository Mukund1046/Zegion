/**
 * CLI transport for the OpenCode provider: shells out to `opencode run`.
 *
 * This is the ONLY transport that can use Zen's keyless free tier — the
 * free models are gated server-side to in-OpenCode clients, so direct HTTP
 * from Node would be rejected. Keyed/paid access uses http.mjs instead.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function resolveBinary() {
  if (process.env.OPENCODE_BIN && existsSync(process.env.OPENCODE_BIN)) {
    return process.env.OPENCODE_BIN;
  }
  // Chocolatey install location (Windows), mirroring FT's Codex approach.
  const choco = process.env.ProgramData
    ? join(process.env.ProgramData, "chocolatey", "bin", "opencode.exe")
    : null;
  if (choco && existsSync(choco)) return choco;
  return "opencode"; // PATH fallback (exec will fail loudly if absent)
}

/** Narrow secret redaction for child stderr (mirrors FT's defense-in-depth). */
export function redactSecrets(s) {
  return String(s ?? "")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "sk-***REDACTED***")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, "Bearer ***REDACTED***");
}

/**
 * Run one classification prompt through `opencode run`.
 * @returns stdout text (caller parses). Throws with redacted, prompt-free errors.
 */export function runOpencode({ model, prompt, timeoutMs = 180000, workdir = process.cwd() }) {
  const bin = resolveBinary();
  const args = ["run", "-m", model, "--format", "default", prompt];
  const outPath = join(tmpdir(), `zegion-classify-${process.pid}-${Date.now()}.out`);
  const errPath = `${outPath}.err`;
  const outFd = openSync(outPath, "w");
  const errFd = openSync(errPath, "w");
  let result;
  try {
    result = spawnSync(bin, args, {
      cwd: workdir,
      env: process.env,
      encoding: "utf8",
      // EOF on stdin immediately: `opencode run` awaits piped stdin to EOF
      // before proceeding, so an unwritten pipe deadlocks parent and child.
      input: "",
      // Stdio to temp FILES, not pipes: `opencode run` boots helpers that
      // inherit stdio, and a pipe held by a surviving grandchild blocks
      // spawnSync forever even after the direct child is timeout-killed.
      stdio: ["ignore", outFd, errFd],
      timeout: timeoutMs,
    });
  } catch (err) {
    closeSync(outFd);
    closeSync(errFd);
    throw new Error(`opencode failed to start (${err.code || err.message}). Is opencode installed and on PATH?`);
  }
  closeSync(outFd);
  closeSync(errFd);
  const readQuiet = (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return "";
    } finally {
      try {
        unlinkSync(p);
      } catch {
        /* best effort */
      }
    }
  };
  const stdout = readQuiet(outPath);
  const stderr = readQuiet(errPath);
  if (result.error) {
    const code = /** @type {any} */ (result.error).code;
    if (code === "ETIMEDOUT") {
      throw new Error(
        `opencode timed out after ${timeoutMs / 1000}s${stdout.trim() ? ` (partial output: ${stdout.trim().slice(-300)})` : ""}`
      );
    }
    throw new Error(`opencode failed to start (${code || "spawn error"})`);
  }
  if (result.status !== 0) {
    const tail = redactSecrets(stderr).trim().slice(-500);
    throw new Error(`opencode exited ${result.status}${tail ? ` — ${tail}` : ""}`);
  }
  return stdout.trim();
}

/** Fast preflight: binary present and some auth configured. Never prints secrets. */
export function probeCliAuth() {
  const version = spawnSync(resolveBinary(), ["--version"], { encoding: "utf8", timeout: 15000 });
  if (version.status !== 0 || !String(version.stdout || "").trim()) {
    return { ok: false, reason: "opencode CLI not found. Install it, then run `opencode auth login`." };
  }
  return { ok: true, version: String(version.stdout).trim() };
}
