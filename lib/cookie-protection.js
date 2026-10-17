const { spawnSync } = require("node:child_process");

const PROTECTION_MARKER = "dpapi-v1:";

function runPowerShell(script, input) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = spawnSync(
    process.env.SystemRoot
      ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
      : "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { input, encoding: "utf8", windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 }
  );
  if (result.error || result.status !== 0 || !result.stdout?.trim()) {
    throw new Error("Windows credential protection is unavailable. Check PowerShell/DPAPI and retry.");
  }
  return result.stdout.trim();
}

function protectCredentials(credentials) {
  const plain = JSON.stringify(credentials);
  if (process.platform !== "win32") return { protection: "file-permissions", value: plain };
  const script = [
    "[Reflection.Assembly]::LoadWithPartialName('System.Security') | Out-Null",
    "$plain = [Console]::In.ReadToEnd()",
    "$bytes = [Text.Encoding]::UTF8.GetBytes($plain)",
    "$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Convert]::ToBase64String($protected)",
  ].join("; ");
  return { protection: "dpapi-v1", value: runPowerShell(script, plain) };
}

function unprotectCredentials(protectedValue, protection) {
  if (protection === "file-permissions") return JSON.parse(protectedValue);
  if (protection !== "dpapi-v1") throw new Error("Unsupported credential protection format");
  const script = [
    "[Reflection.Assembly]::LoadWithPartialName('System.Security') | Out-Null",
    "$encrypted = [Console]::In.ReadToEnd()",
    "$bytes = [Convert]::FromBase64String($encrypted)",
    "$plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Text.Encoding]::UTF8.GetString($plain)",
  ].join("; ");
  return JSON.parse(runPowerShell(script, protectedValue));
}

function encodeCredentials(credentials) {
  const protectedData = protectCredentials(credentials);
  return `${PROTECTION_MARKER}${protectedData.protection}:${Buffer.from(protectedData.value, "utf8").toString("base64")}`;
}

function decodeCredentials(value) {
  if (!value.startsWith(PROTECTION_MARKER)) return null;
  const rest = value.slice(PROTECTION_MARKER.length);
  const separator = rest.indexOf(":");
  if (separator < 0) throw new Error("Invalid protected credential format");
  const protection = rest.slice(0, separator);
  const protectedValue = Buffer.from(rest.slice(separator + 1), "base64").toString("utf8");
  return unprotectCredentials(protectedValue, protection);
}

module.exports = { encodeCredentials, decodeCredentials };
