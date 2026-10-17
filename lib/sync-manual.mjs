import { readFileSync } from "node:fs";
import path from "node:path";
import { buildCli } from "fieldtheory/dist/cli.js";

const root = process.cwd();
const cliPath = path.join(root, "node_modules", "fieldtheory", "bin", "ft.mjs");
const input = JSON.parse(readFileSync(0, "utf8"));
if (
  typeof input.ct0 !== "string" ||
  typeof input.authToken !== "string" ||
  !input.ct0 ||
  !input.authToken
) {
  throw new Error("Manual sync credentials are incomplete.");
}

// Commander receives credentials only in memory. They are read over stdin,
// never placed in this wrapper's or the OS process command line.
const program = buildCli();
await program.parseAsync([
  process.execPath,
  cliPath,
  ...process.argv.slice(2),
  "--cookies",
  input.ct0,
  input.authToken,
]);
