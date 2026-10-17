const path = require("node:path");
const os = require("node:os");

function resolveCookieConfigPath({ env = process.env, home = os.homedir(), repoRoot } = {}) {
  const explicit = typeof env.X_COOKIE_CONFIG === "string" ? env.X_COOKIE_CONFIG.trim() : "";
  if (explicit) {
    if (!repoRoot) throw new Error("Repository root is required to resolve X_COOKIE_CONFIG.");
    const resolved = path.resolve(repoRoot, explicit);
    const relative = path.relative(path.resolve(repoRoot), resolved);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
      throw new Error("X_COOKIE_CONFIG must point outside the repository so credentials cannot be committed.");
    }
    return resolved;
  }
  const stableDataDir = typeof env.FT_DATA_DIR === "string" && env.FT_DATA_DIR.trim()
    ? env.FT_DATA_DIR.trim()
    : path.join(home, ".ft-bookmarks");
  return path.join(path.resolve(stableDataDir), "cookies-config.json");
}

module.exports = { resolveCookieConfigPath };
