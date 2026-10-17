import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32") {
  throw new Error("The Zegion desktop host currently targets Windows only.");
}
if (Number(process.versions.node.split(".")[0]) < 22) {
  throw new Error("Use Node.js 22 or newer for desktop development.");
}

const desktopDir = path.join(root, ".desktop");
await fs.mkdir(desktopDir, { recursive: true });
await fs.copyFile(process.execPath, path.join(desktopDir, "node.exe"));
const electron = process.platform === "win32"
  ? path.join(root, "node_modules", ".bin", "electron.cmd")
  : path.join(root, "node_modules", ".bin", "electron");
const child = spawn(electron, ["electron/main.cjs"], { cwd: root, stdio: "inherit", windowsHide: false, shell: true });
child.once("error", (error) => {
  console.error("Could not start Electron:", error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
