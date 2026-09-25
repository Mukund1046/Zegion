const fs = require("fs");
const os = require("os");
const path = require("path");

// Well-known default profile roots per browser and platform. Used only as a
// fail-fast preflight for auto mode: if none of these exist, Field Theory's
// browser-cookie extraction would fail after minutes of work, so we surface
// an actionable error immediately instead. Custom/non-standard profile
// locations are the documented reason to use Manual mode.
function candidateProfileDirs(browser, homedir = os.homedir(), platform = process.platform) {
  const join = (...parts) => path.join(homedir, ...parts);
  switch (browser) {
    case "firefox":
      if (platform === "win32") return [join("AppData", "Roaming", "Mozilla", "Firefox")];
      if (platform === "darwin") return [join("Library", "Application Support", "Firefox")];
      return [
        join(".mozilla", "firefox"),
        join("snap", "firefox", "common", ".mozilla", "firefox"),
      ];
    case "chrome":
      if (platform === "win32") return [join("AppData", "Local", "Google", "Chrome", "User Data")];
      if (platform === "darwin") return [join("Library", "Application Support", "Google", "Chrome")];
      return [
        join(".config", "google-chrome"),
        join(".config", "chromium"),
      ];
    case "edge":
      if (platform === "win32") return [join("AppData", "Local", "Microsoft", "Edge", "User Data")];
      if (platform === "darwin") return [join("Library", "Application Support", "Microsoft Edge")];
      return [join(".config", "microsoft-edge")];
    case "brave":
      if (platform === "win32")
        return [join("AppData", "Local", "BraveSoftware", "Brave-Browser", "User Data")];
      if (platform === "darwin")
        return [join("Library", "Application Support", "BraveSoftware", "Brave-Browser")];
      return [join(".config", "BraveSoftware", "Brave-Browser")];
    default:
      return [];
  }
}

function hasBrowserProfile(browser, homedir = os.homedir(), platform = process.platform) {
  return candidateProfileDirs(browser, homedir, platform).some((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  });
}

// Inspect a Chromium-family browser's `Local State` file and report how its
// os_crypt key is wrapped, WITHOUT decrypting anything:
//   "dpapi"     — key starts with the DPAPI prefix; external unwrapping works
//   "app-bound" — key starts with the APPB prefix (Chrome 127+, Edge 127+,
//                 Brave equivalents); only the browser's own elevation service
//                 can unwrap it, so automatic extraction cannot work
//   "missing"   — no Local State file, no key, or unreadable file
// Only the 5-byte prefix and the presence of the key are ever read — no key
// material, cookie values, or secrets leave this function.
function readKeyPrefix(browser, homedir = os.homedir(), platform = process.platform) {
  const dirs = candidateProfileDirs(browser, homedir, platform);
  let sawDir = false;
  for (const dir of dirs) {
    let localStatePath;
    try {
      localStatePath = path.join(dir, "Local State");
      if (!fs.existsSync(localStatePath)) continue;
      sawDir = true;
      const raw = fs.readFileSync(localStatePath, "utf8");
      const localState = JSON.parse(raw);
      const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
      if (typeof encryptedKeyB64 !== "string" || encryptedKeyB64.length === 0) continue;
      const prefix = Buffer.from(encryptedKeyB64, "base64").subarray(0, 5).toString("ascii");
      if (prefix === "DPAPI") return "dpapi";
      if (prefix === "APPB") return "app-bound";
      // Present but unrecognized wrapping — treat like app-bound: automatic
      // extraction cannot be relied upon.
      return "app-bound";
    } catch {
      // Corrupt/unreadable file — try the next candidate directory.
      if (sawDir) continue;
    }
  }
  return "missing";
}

// Find the profile directory that actually holds a Cookies database.
// Chromium-family browsers default to `Default`, but real installations
// often only have `Profile 1` (or N) — e.g. Edge setups without a Default
// profile. Newer versions keep the DB at <profile>/Network/Cookies,
// older ones at <profile>/Cookies; both are checked.
// Returns { userDataDir, profile } or null when no profile has a Cookies DB.
// Preference: Default first, otherwise the most recently modified Cookies
// file (heuristic for "the profile actually in use").
function resolveCookieProfile(browser, homedir = os.homedir(), platform = process.platform) {
  for (const userDataDir of candidateProfileDirs(browser, homedir, platform)) {
    let subdirs;
    try {
      if (!fs.existsSync(userDataDir)) continue;
      subdirs = fs.readdirSync(userDataDir, { withFileTypes: true });
    } catch {
      continue;
    }
    const withCookies = [];
    for (const entry of subdirs) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name !== "Default" && !/^Profile \d+$/.test(name)) continue;
      for (const dbRel of ["Cookies", "Network/Cookies", "Network\\Cookies"]) {
        let dbPath;
        try {
          dbPath = path.join(userDataDir, name, ...dbRel.split(/[\\/]/));
          if (fs.existsSync(dbPath)) {
            withCookies.push({ profile: name, mtime: fs.statSync(dbPath).mtimeMs });
            break;
          }
        } catch {
          // Unreadable entry — try the next location.
        }
      }
    }
    if (withCookies.length === 0) continue;
    const def = withCookies.find((c) => c.profile === "Default");
    if (def) return { userDataDir, profile: def.profile };
    withCookies.sort((a, b) => b.mtime - a.mtime);
    return { userDataDir, profile: withCookies[0].profile };
  }
  return null;
}

module.exports = { candidateProfileDirs, hasBrowserProfile, readKeyPrefix, resolveCookieProfile };
