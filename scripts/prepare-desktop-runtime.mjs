import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");
const stageDir = path.join(root, ".desktop");
const runtimeDir = path.join(stageDir, "app-runtime");

await fs.rm(stageDir, { recursive: true, force: true });
await fs.mkdir(runtimeDir, { recursive: true });
if (!(await exists(path.join(standaloneDir, "server.js")))) {
  throw new Error("Next standalone output is missing. Run the desktop build first.");
}
await fs.cp(standaloneDir, runtimeDir, {
  recursive: true,
  filter(source) {
    const relative = path.relative(standaloneDir, source).split(path.sep).join("/");
    // Next's Windows file tracer can emit paths rooted at C:/Users/... when
    // an API imports code that probes local browser/bookmark state. Never
    // stage those paths, credentials, env files, or trace manifests.
    if (/^[A-Za-z]:\//.test(relative)) return false;
    if (relative.split("/").some((part) => part === ".ft-bookmarks")) return false;
    if (relative === ".env" || relative.startsWith(".env.")) return false;
    if (relative.endsWith(".nft.json")) return false;
    return true;
  },
});

// If Next's tracer aborts a route trace after encountering a Windows absolute
// path, it can omit that route's shared server chunks. The compiled server
// output is safe to copy wholesale; omit trace manifests so no local file
// paths or bookmark filenames are shipped.
const compiledServerDir = path.join(root, ".next", "server");
await fs.cp(compiledServerDir, path.join(runtimeDir, ".next", "server"), {
  recursive: true,
  filter(source) {
    return !source.endsWith(".nft.json");
  },
});
await fs.cp(path.join(root, ".next", "static"), path.join(runtimeDir, ".next", "static"), { recursive: true });

const publicDir = path.join(root, "public");
if (await exists(publicDir)) {
  await fs.cp(publicDir, path.join(runtimeDir, "public"), { recursive: true });
}

// Classification workflow loads this immutable taxonomy from the runtime
// root so it works in both Next's bundled server and Electron standalone mode.
await fs.mkdir(path.join(runtimeDir, "lib", "classify"), { recursive: true });
await fs.copyFile(
  path.join(root, "lib", "classify", "taxonomy.json"),
  path.join(runtimeDir, "lib", "classify", "taxonomy.json")
);

// These files are executed by server-jobs as child processes and therefore
// are not guaranteed to be included in Next's server dependency trace.
for (const file of ["config.js", "atomic-write.js", "export-bookmarks.js", "sync-folders.js", "sync-manual.mjs"]) {
  await fs.mkdir(path.join(runtimeDir, "lib"), { recursive: true });
  await fs.copyFile(path.join(root, "lib", file), path.join(runtimeDir, "lib", file));
}

await copyRuntimePackage("fieldtheory");
await copyRuntimePackage("commander");
await copyRuntimePackage("dotenv");
await copyRuntimePackage("sql.js");
await copyRuntimePackage("sql.js-fts5");
await copyRuntimePackage("undici");

if (process.platform !== "win32" || Number(process.versions.node.split(".")[0]) < 22) {
  throw new Error("Build the Windows desktop package on Windows with Node.js 22 or newer.");
}
await fs.copyFile(process.execPath, path.join(stageDir, "node.exe"));
await fs.writeFile(
  path.join(stageDir, "node-runtime.json"),
  `${JSON.stringify({ version: process.versions.node, sha256: await sha256(path.join(stageDir, "node.exe")) }, null, 2)}\n`
);

async function copyRuntimePackage(packageName, visited = new Set()) {
  if (visited.has(packageName)) return;
  visited.add(packageName);
  const source = path.join(root, "node_modules", ...packageName.split("/"));
  const packageJsonPath = path.join(source, "package.json");
  if (!(await exists(packageJsonPath))) {
    throw new Error(`Required desktop runtime package is missing: ${packageName}`);
  }

  const target = path.join(runtimeDir, "node_modules", ...packageName.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });

  const metadata = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const dependencies = Object.keys({ ...metadata.dependencies, ...metadata.optionalDependencies });
  for (const dependency of dependencies) {
    try {
      await copyRuntimePackage(dependency, visited);
    } catch (error) {
      if (!metadata.optionalDependencies?.[dependency]) throw error;
    }
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const { createHash } = await import("node:crypto");
  const contents = await fs.readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}
