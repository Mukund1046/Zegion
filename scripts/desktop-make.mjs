import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32") {
  throw new Error("The Windows desktop release must be built on Windows.");
}
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  throw new Error("The Windows release build requires Node.js 22.5 or newer.");
}

// Turbopack's worker process can exit before connecting in restricted
// Windows build environments. Use Next's supported webpack build mode for
// desktop packaging; the regular web build remains on its existing default.
await run(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
  ...process.env,
  // Keep build-time tracing away from a developer's real per-user bookmark
  // directory. The packaged app sets its own user-data paths at launch.
  FT_DATA_DIR: path.join(root, ".desktop", "build-data"),
  X_OUTPUT_DIR: path.join(root, ".desktop", "build-output"),
  ZEGION_DESKTOP_BUILD: "1",
});
await run(process.execPath, ["scripts/prepare-desktop-runtime.mjs"]);
await run(process.execPath, ["node_modules/@electron-forge/cli/dist/electron-forge-make.js", "--platform", "win32", "--arch", "x64"]);

function run(executable, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} ${args.join(" ")} exited with code ${code}`));
    });
  });
}
