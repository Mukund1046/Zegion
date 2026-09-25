import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = path.resolve(import.meta.dirname, "..", "..");

// ---------------------------------------------------------------------------
// Helpers: load pure functions out of TS sources without executing module
// imports (next/server, @/ aliases). The functions are transpiled from the
// real source files, so these tests break if the real code changes shape.
// ---------------------------------------------------------------------------

function scanBalanced(js, start) {
  const pairs = { "{": "}", "[": "]", "(": ")" };
  const open = js[start];
  const stack = [pairs[open]];
  const interpStack = [];
  let i = start + 1;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  while (i < js.length) {
    const ch = js[i];
    const next = js[i + 1];
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      i += 1;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
        i += 1;
        continue;
      }
      if (quote === "`" && ch === "$" && next === "{") {
        interpStack.push(stack.length);
        stack.push("}");
        quote = null; // inside ${...} is code, not string text
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      lineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") {
      stack.push(pairs[ch]);
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      const expected = stack.pop();
      assert.equal(ch, expected, `balanced scan mismatch at ${i}`);
      if (interpStack.length > 0 && stack.length === interpStack[interpStack.length - 1]) {
        interpStack.pop();
        quote = "`";
      }
      if (stack.length === 0) return i;
      i += 1;
      continue;
    }
    i += 1;
  }
  throw new Error("unbalanced brackets while extracting symbol");
}

function extractTopLevel(js, name) {
  const pattern = new RegExp(
    `(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=)`
  );
  const m = pattern.exec(js);
  assert.ok(m, `symbol ${name} found in transpiled source`);
  let i = m.index + m[0].length;
  while (i < js.length && js[i] !== "{" && js[i] !== "[") i += 1;
  const end = scanBalanced(js, i);
  return js.slice(m.index, end + 1);
}

function loadTsHelpers(relativePath, names) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const snippets = names.map((n) => extractTopLevel(outputText, n));
  const factory = new Function(
    "fs",
    "path",
    // eslint-disable-next-line no-new-func
    // TS CommonJS transpile rewrites `import fs from "fs"` to `fs_1.default`,
    // so provide the esModuleInterop aliases the extracted bodies expect.
    `const fs_1 = { default: fs };\nconst path_1 = { default: path };\n${snippets.join("\n")}\nreturn { ${names.join(", ")} };`
  );
  return factory(fs, path);
}

// ---------------------------------------------------------------------------
// JS modules under test (direct require; main() is guarded by require.main)
// ---------------------------------------------------------------------------

const syncFolders = require("../sync-folders.js");
const atomicWrite = require("../atomic-write.js");
const browserProfiles = require("../browser-profiles.js");
const config = require("../config.js");

// ---------------------------------------------------------------------------
// 1. Folder pagination (the missing-await regression)
// ---------------------------------------------------------------------------

function tweetEntry(id, text = `tweet ${id}`) {
  return {
    content: {
      itemContent: {
        tweet_results: {
          result: {
            legacy: {
              id_str: id,
              full_text: text,
              created_at: "Mon Jan 01 00:00:00 +0000 2024",
              favorite_count: 1,
              retweet_count: 0,
              bookmark_count: 0,
            },
            rest_id: id,
            core: {
              user_results: {
                result: { legacy: { screen_name: "alice", name: "Alice" } },
              },
            },
          },
        },
      },
    },
  };
}

function cursorEntry(value) {
  return {
    entryId: `cursor-bottom-${value}`,
    content: { cursorType: "Bottom", value },
  };
}

function timelineJson(entries) {
  return {
    data: {
      bookmark_collection_timeline: {
        timeline: { instructions: [{ entries }] },
      },
    },
  };
}

describe("sync-folders pagination (missing-await regression)", () => {
  it("parseTimeline extracts tweets and the bottom cursor", () => {
    const json = timelineJson([
      tweetEntry("1"),
      tweetEntry("2"),
      cursorEntry("CURSOR-1"),
    ]);
    const { tweets, cursor } = syncFolders.parseTimeline(
      json,
      (j) => j?.data?.bookmark_collection_timeline?.timeline?.instructions
    );
    assert.equal(tweets.length, 2);
    assert.equal(tweets[0].tweetId, "1");
    assert.equal(cursor, "CURSOR-1");
  });

  it("fetchFolderBookmarks awaits each page and follows the cursor", async () => {
    const calls = [];
    const pages = [
      timelineJson([tweetEntry("1"), tweetEntry("2"), cursorEntry("CURSOR-1")]),
      timelineJson([tweetEntry("3")]),
    ];
    let n = 0;
    const fetchFn = async (queryId, operation, variables) => {
      calls.push({ ...variables });
      const page = pages[n++];
      assert.ok(page, "no extra page fetched");
      return page;
    };
    const tweets = await syncFolders.fetchFolderBookmarks("folder-1", "Test", fetchFn);
    assert.equal(tweets.length, 3);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].cursor, "CURSOR-1");
  });

  it("fetchFolderBookmarks stops at the pagination guard on a stuck cursor", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return timelineJson([tweetEntry(`t${calls}`), cursorEntry("SAME")]);
    };
    const tweets = await syncFolders.fetchFolderBookmarks("folder-1", "Stuck", fetchFn);
    assert.equal(calls, syncFolders.MAX_FOLDER_PAGES);
    assert.equal(tweets.length, syncFolders.MAX_FOLDER_PAGES);
  });
});

// ---------------------------------------------------------------------------
// 2. Retry (429 only) + bounded concurrency
// ---------------------------------------------------------------------------

describe("folder fetch resilience", () => {
  it("retries X 429s and then succeeds", async () => {
    let calls = 0;
    const impl = async () => {
      calls += 1;
      if (calls < 3) throw new Error("X returned 429 Too Many Requests for op: body");
      return { ok: true };
    };
    const result = await syncFolders.fetchGraphQLWithRetry("q", "op", {}, 4, impl);
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  });

  it("does not retry auth failures (401 fails fast)", async () => {
    let calls = 0;
    const impl = async () => {
      calls += 1;
      throw new Error("X returned 401 Unauthorized for op: body");
    };
    await assert.rejects(
      () => syncFolders.fetchGraphQLWithRetry("q", "op", {}, 4, impl),
      /401/
    );
    assert.equal(calls, 1);
  });

  it("gives up after maxAttempts on persistent 429s", async () => {
    let calls = 0;
    const impl = async () => {
      calls += 1;
      throw new Error("X returned 429 Too Many Requests");
    };
    await assert.rejects(
      () => syncFolders.fetchGraphQLWithRetry("q", "op", {}, 2, impl),
      /429/
    );
    assert.equal(calls, 2);
  });

  it("mapWithConcurrency respects the limit and preserves order", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await syncFolders.mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (n) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return n * 10;
      }
    );
    assert.deepEqual(results, [10, 20, 30, 40, 50, 60]);
    assert.ok(maxActive <= 2, `max in-flight ${maxActive} exceeds limit 2`);
  });
});

// ---------------------------------------------------------------------------
// 3. Atomic JSON writes
// ---------------------------------------------------------------------------

describe("atomic JSON writes", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "kairos-atomic-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips JSON and leaves no temp files behind", () => {
    const target = path.join(dir, "out.json");
    atomicWrite.writeJsonAtomic(target, { a: 1 });
    assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), { a: 1 });
    const leftovers = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".tmp") || f.startsWith(".tmp-"));
    assert.deepEqual(leftovers, []);
  });

  it("overwrite is all-or-nothing (final content wins, stays valid JSON)", () => {
    const target = path.join(dir, "out.json");
    atomicWrite.writeJsonAtomic(target, { v: 1 });
    atomicWrite.writeJsonAtomic(target, { v: 2, nested: [1, 2, 3] });
    assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), {
      v: 2,
      nested: [1, 2, 3],
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Fresh-clone paths (config.js) with isolated env
// ---------------------------------------------------------------------------

describe("fresh-clone path resolution (config.js)", () => {
  const ENV_KEYS = [
    "X_BOOKMARKS_JSONL",
    "FT_DATA_DIR",
    "X_OUTPUT_DIR",
    "X_BOOKMARKS_OUTPUT",
    "X_FOLDERS_OUTPUT",
  ];
  let saved;
  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("falls back to data/bookmarks/bookmarks.jsonl on a fresh clone (no ft file)", () => {
    // Point FT_DATA_DIR at an empty temp dir so the ~/.ft-bookmarks-style
    // ftPath does not exist — this simulates a fresh laptop.
    const emptyFt = fs.mkdtempSync(path.join(os.tmpdir(), "kairos-ft-empty-"));
    try {
      process.env.FT_DATA_DIR = emptyFt;
      const p = config.getJsonlPath();
      assert.ok(
        p.endsWith(path.join("data", "bookmarks", "bookmarks.jsonl")),
        `unexpected fallback ${p}`
      );
    } finally {
      fs.rmSync(emptyFt, { recursive: true, force: true });
    }
  });

  it("prefers FT_DATA_DIR/bookmarks.jsonl when that file exists", () => {
    const ftDir = fs.mkdtempSync(path.join(os.tmpdir(), "kairos-ft-"));
    try {
      fs.writeFileSync(path.join(ftDir, "bookmarks.jsonl"), "{}\n");
      process.env.FT_DATA_DIR = ftDir;
      assert.equal(config.getJsonlPath(), path.join(ftDir, "bookmarks.jsonl"));
    } finally {
      fs.rmSync(ftDir, { recursive: true, force: true });
    }
  });

  it("honors an explicit X_BOOKMARKS_JSONL path", () => {
    process.env.X_BOOKMARKS_JSONL = path.join("data", "custom", "mine.jsonl");
    const p = config.getJsonlPath();
    assert.ok(p.endsWith(path.join("data", "custom", "mine.jsonl")), p);
  });
});

// ---------------------------------------------------------------------------
// 5. Browser-profile preflight (pure helper)
// ---------------------------------------------------------------------------

describe("browser-profile preflight", () => {
  let home;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "kairos-home-"));
  });
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("reports missing profiles on an empty home dir", () => {
    assert.equal(browserProfiles.hasBrowserProfile("firefox", home, "linux"), false);
    assert.equal(browserProfiles.hasBrowserProfile("chrome", home, "win32"), false);
  });

  it("detects a firefox profile dir", () => {
    fs.mkdirSync(path.join(home, ".mozilla", "firefox"), { recursive: true });
    assert.equal(browserProfiles.hasBrowserProfile("firefox", home, "linux"), true);
  });

  it("detects a windows chrome profile dir", () => {
    fs.mkdirSync(path.join(home, "AppData", "Local", "Google", "Chrome", "User Data"), {
      recursive: true,
    });
    assert.equal(browserProfiles.hasBrowserProfile("chrome", home, "win32"), true);
  });

  it("returns no candidates for an unknown browser", () => {
    assert.deepEqual(browserProfiles.candidateProfileDirs("netscape", home, "linux"), []);
    assert.equal(browserProfiles.hasBrowserProfile("netscape", home, "linux"), false);
  });

  it("reports a DPAPI-wrapped key as dpapi", () => {
    const dir = path.join(home, ".config", "google-chrome");
    fs.mkdirSync(dir, { recursive: true });
    const key = Buffer.concat([Buffer.from("DPAPI"), Buffer.alloc(32, 7)]).toString("base64");
    fs.writeFileSync(
      path.join(dir, "Local State"),
      JSON.stringify({ os_crypt: { encrypted_key: key } })
    );
    assert.equal(browserProfiles.readKeyPrefix("chrome", home, "linux"), "dpapi");
  });

  it("reports an APPB-wrapped key as app-bound", () => {
    const dir = path.join(home, "AppData", "Local", "Microsoft", "Edge", "User Data");
    fs.mkdirSync(dir, { recursive: true });
    const key = Buffer.concat([Buffer.from("APPB"), Buffer.alloc(32, 9)]).toString("base64");
    fs.writeFileSync(
      path.join(dir, "Local State"),
      JSON.stringify({ os_crypt: { encrypted_key: key } })
    );
    assert.equal(browserProfiles.readKeyPrefix("edge", home, "win32"), "app-bound");
  });

  it("reports missing when there is no Local State file", () => {
    fs.mkdirSync(path.join(home, ".config", "google-chrome"), { recursive: true });
    assert.equal(browserProfiles.readKeyPrefix("chrome", home, "linux"), "missing");
  });

  it("reports missing for corrupt or keyless Local State files", () => {
    const dir = path.join(home, ".mozilla", "firefox");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "Local State"), "{ not json {{{");
    assert.equal(browserProfiles.readKeyPrefix("firefox", home, "linux"), "missing");
    fs.writeFileSync(path.join(dir, "Local State"), JSON.stringify({ os_crypt: {} }));
    assert.equal(browserProfiles.readKeyPrefix("firefox", home, "linux"), "missing");
  });

  it("resolves a non-Default profile holding the Cookies DB", () => {
    const userData = path.join(home, "AppData", "Local", "Microsoft", "Edge", "User Data");
    fs.mkdirSync(path.join(userData, "Profile 1", "Network"), { recursive: true });
    fs.writeFileSync(path.join(userData, "Profile 1", "Network", "Cookies"), "db");
    const resolved = browserProfiles.resolveCookieProfile("edge", home, "win32");
    assert.deepEqual(resolved, { userDataDir: userData, profile: "Profile 1" });
  });

  it("prefers Default when it holds a Cookies DB", () => {
    const userData = path.join(home, ".config", "google-chrome");
    fs.mkdirSync(path.join(userData, "Default"), { recursive: true });
    fs.mkdirSync(path.join(userData, "Profile 2", "Network"), { recursive: true });
    fs.writeFileSync(path.join(userData, "Default", "Cookies"), "db");
    fs.writeFileSync(path.join(userData, "Profile 2", "Network", "Cookies"), "db");
    const resolved = browserProfiles.resolveCookieProfile("chrome", home, "linux");
    assert.deepEqual(resolved, { userDataDir: userData, profile: "Default" });
  });

  it("returns null when no profile holds a Cookies DB", () => {
    const userData = path.join(home, "AppData", "Local", "Microsoft", "Edge", "User Data");
    fs.mkdirSync(path.join(userData, "Profile 1"), { recursive: true });
    assert.equal(browserProfiles.resolveCookieProfile("edge", home, "win32"), null);
  });

  it("treats an unrecognized key wrapping as app-bound (fail closed)", () => {
    const dir = path.join(home, ".config", "BraveSoftware", "Brave-Browser");
    fs.mkdirSync(dir, { recursive: true });
    const key = Buffer.concat([Buffer.from("XXXXX"), Buffer.alloc(32, 1)]).toString("base64");
    fs.writeFileSync(
      path.join(dir, "Local State"),
      JSON.stringify({ os_crypt: { encrypted_key: key } })
    );
    assert.equal(browserProfiles.readKeyPrefix("brave", home, "linux"), "app-bound");
  });
});

// ---------------------------------------------------------------------------
// 6. TS pure functions, loaded from real source (transpiled, no imports run)
// ---------------------------------------------------------------------------

const { sanitizeError, SAFE_PREFIXES } = loadTsHelpers("lib/api-auth.ts", [
  "sanitizeError",
  "SAFE_PREFIXES",
]);
const { describeCookieMode } = loadTsHelpers("lib/cookie-config.ts", [
  "describeCookieMode",
]);
const { buildSyncArgs, readJsonFile, mapSyncFailure } = loadTsHelpers("lib/server-jobs.ts", [
  "buildSyncArgs",
  "readJsonFile",
  "mapSyncFailure",
]);

describe("sanitizeError (actionable, no secret leaks)", () => {
  it("keeps the pre-existing safe prefixes", () => {
    assert.ok(SAFE_PREFIXES.includes("Sync failed: "));
    assert.equal(sanitizeError(new Error("Sync failed: boom")), "Sync failed: boom");
    assert.equal(sanitizeError(new Error("Please wait 5s")), "Please wait 5s");
  });

  it("surfaces fresh-clone causes instead of collapsing them", () => {
    assert.equal(
      sanitizeError(new Error("Manual mode requires both ct0 and auth_token.")),
      "Manual mode requires both ct0 and auth_token."
    );
    assert.equal(
      sanitizeError(new Error("Missing X_CT0. Set it in your environment.")),
      "Missing X_CT0. Set it in your environment."
    );
    assert.equal(
      sanitizeError(new Error("Bookmarks JSONL not found at /x. Set X_BOOKMARKS_JSONL.")),
      "Bookmarks JSONL not found at /x. Set X_BOOKMARKS_JSONL."
    );
    assert.equal(sanitizeError(new Error("Invalid request")), "Invalid request");
    assert.equal(
      sanitizeError(new Error("Script timed out after 300s")),
      "Script timed out after 300s"
    );
  });

  it("surfaces the app-bound preflight message (browser name only, no secrets)", () => {
    const message =
      "Sync failed: Edge on this machine uses App-Bound Encryption, " +
      "which automatic extraction cannot read. Use Manual mode with pasted ct0/auth_token.";
    assert.equal(sanitizeError(new Error(message)), message);
  });

  it("surfaces every mapSyncFailure output (all start with a safe prefix)", () => {
    const outputs = [
      mapSyncFailure("EBUSY: resource busy or locked, copyfile '...Cookies'", "edge", "Profile 1"),
      mapSyncFailure("Could not read Microsoft Edge Cookies database.\nPath: C:\\x", "edge", "Profile 1"),
      mapSyncFailure("No ct0 CSRF cookie found for x.com in Microsoft Edge.", "edge", "Profile 1"),
      mapSyncFailure("something unexpected", "edge", "Profile 1"),
      mapSyncFailure("", undefined, undefined),
    ];
    for (const out of outputs) {
      assert.ok(out.startsWith("Sync failed: "), `unsafe output: ${out}`);
      assert.equal(sanitizeError(new Error(out)), out);
      assert.ok(!out.includes("C:\\"), "raw child paths must never surface");
    }
  });

  it("still collapses unknown errors (no session leakage)", () => {
    assert.equal(sanitizeError(new Error("weird ENOENT /tmp/x")), "Unexpected server error");
    assert.equal(
      sanitizeError(new Error("oops ct0=abc123 authtoken=xyz")),
      "Unexpected server error"
    );
  });
});

describe("describeCookieMode labels (credential precedence labels locked)", () => {
  it("auto modes keep their browser label", () => {
    assert.equal(describeCookieMode({ source: "auto", browser: "firefox" }), "auto:firefox");
    assert.equal(describeCookieMode({ source: "auto", browser: "chrome" }), "auto:chrome");
  });

  it("manual with both tokens is manual-runtime, otherwise manual-incomplete", () => {
    assert.equal(
      describeCookieMode({ source: "manual", ct0: "a", authToken: "b" }),
      "manual-runtime"
    );
    assert.equal(
      describeCookieMode({ source: "manual", ct0: "a" }),
      "manual-incomplete"
    );
    assert.equal(describeCookieMode({ source: "manual" }), "manual-incomplete");
  });
});

describe("buildSyncArgs credential precedence (locked, not changed)", () => {
  const CLI = "/fake/ft.mjs";

  it("auto uses --browser and no --cookies when no file tokens exist", () => {
    const plan = buildSyncArgs({ source: "auto", browser: "firefox" }, CLI);
    assert.deepEqual(plan.ftArgs.slice(0, 4), [CLI, "sync", "--browser", "firefox"]);
    assert.ok(!plan.ftArgs.includes("--cookies"));
    assert.equal(plan.cookieOverride, undefined);
  });

  it("file ct0 still flows to folder/export children even in auto (current behavior)", () => {
    const plan = buildSyncArgs(
      { source: "auto", browser: "firefox", ct0: "c", authToken: "a" },
      CLI
    );
    assert.ok(plan.ftArgs.includes("--browser"));
    assert.deepEqual(plan.cookieOverride, { cookies: "c", authToken: "a" });
  });

  it("manual with both tokens uses --cookies", () => {
    const plan = buildSyncArgs(
      { source: "manual", browser: undefined, ct0: "c", authToken: "a" },
      CLI
    );
    const i = plan.ftArgs.indexOf("--cookies");
    assert.ok(i !== -1);
    assert.deepEqual(plan.ftArgs.slice(i + 1, i + 3), ["c", "a"]);
    assert.deepEqual(plan.cookieOverride, { cookies: "c", authToken: "a" });
  });

  it("manual without both tokens throws 400 (not a silent fallback)", () => {
    assert.throws(() => buildSyncArgs({ source: "manual", ct0: "c" }, CLI), (err) => {
      assert.ok(err.message.startsWith("Sync failed: Manual mode requires"));
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it("auto without a browser falls back to plain sync args", () => {
    const plan = buildSyncArgs({ source: "auto" }, CLI);
    assert.ok(!plan.ftArgs.includes("--browser"));
    assert.ok(!plan.ftArgs.includes("--cookies"));
  });

  it("auto passes --chrome-profile-directory for non-Default profiles", () => {
    const plan = buildSyncArgs(
      { source: "auto", browser: "edge", chromeProfileDirectory: "Profile 1" },
      CLI
    );
    const i = plan.ftArgs.indexOf("--chrome-profile-directory");
    assert.ok(i !== -1);
    assert.equal(plan.ftArgs[i + 1], "Profile 1");
  });

  it("mapSyncFailure tells the user to close the browser on a locked cookie file", () => {
    const message = mapSyncFailure(
      "Could not read Microsoft Edge Cookies database.\nError: EBUSY: resource busy or locked",
      "edge",
      "Profile 1"
    );
    assert.ok(message.includes("locked while it is running"));
    assert.ok(message.includes("Close all Edge windows"));
  });

  it("mapSyncFailure names the profile when no X login is found", () => {
    const message = mapSyncFailure(
      "No ct0 CSRF cookie found for x.com in Microsoft Edge.",
      "edge",
      "Profile 1"
    );
    assert.ok(message.includes('profile "Profile 1"'));
    assert.ok(message.includes("Sign into x.com"));
  });

  it("auto omits the profile flag for Default or unresolved profiles", () => {
    for (const cfg of [
      { source: "auto", browser: "edge", chromeProfileDirectory: "Default" },
      { source: "auto", browser: "edge", chromeProfileDirectory: undefined },
      { source: "auto", browser: "firefox" },
    ]) {
      const plan = buildSyncArgs(cfg, CLI);
      assert.ok(!plan.ftArgs.includes("--chrome-profile-directory"));
    }
  });
});

describe("readJsonFile empty-cache contract (fresh clone)", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "kairos-json-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("missing file returns the fallback (empty cache, not a crash)", () => {
    assert.deepEqual(readJsonFile(path.join(dir, "nope.json"), { bookmarks: [] }), {
      bookmarks: [],
    });
  });

  it("corrupt JSON returns the fallback (half-written file, not a crash)", () => {
    const p = path.join(dir, "corrupt.json");
    fs.writeFileSync(p, "{ not json {{{");
    assert.deepEqual(readJsonFile(p, []), []);
  });

  it("valid JSON parses normally", () => {
    const p = path.join(dir, "ok.json");
    fs.writeFileSync(p, JSON.stringify({ a: 1 }));
    assert.deepEqual(readJsonFile(p, {}), { a: 1 });
  });
});

describe("bookmarks API empty-cache contract (must stay 200 [])", () => {
  it("route never introduces a 202/204 contract and returns data directly", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "api", "bookmarks", "route.ts"), "utf8");
    assert.ok(!/status:\s*20[24]/.test(src), "no 202/204 status in bookmarks route");
    assert.ok(
      src.includes("return NextResponse.json(data"),
      "bookmarks route returns data directly"
    );
  });
});
