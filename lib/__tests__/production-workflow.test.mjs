import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyClassificationReview,
  applyReviewedCategories,
  dismissClassificationReview,
  getExcludedClassificationIds,
  recordStagedSuggestions,
} from "../classify/workflow.mjs";

const require = createRequire(import.meta.url);
const { normalizeManualCookies } = require("../cookie-input.js");
const { resolveCookieConfigPath } = require("../cookie-config-path.js");
const { resolveFirefoxProfile } = require("../browser-profiles.js");
const ROOT = path.resolve(import.meta.dirname, "..", "..");

function withWorkspaceTemp(run) {
  const directory = fs.mkdtempSync(path.join(ROOT, ".tmp-production-test-"));
  try { run(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

describe("manual cookie parsing", () => {
  it("accepts raw values and explicit matching cookie names without duplicating them", () => {
    assert.deepEqual(normalizeManualCookies("raw-ct0", "raw-auth"), {
      ct0: "raw-ct0",
      authToken: "raw-auth",
    });
    assert.deepEqual(normalizeManualCookies("ct0=raw-ct0", "auth_token=raw-auth"), {
      ct0: "raw-ct0",
      authToken: "raw-auth",
    });
  });

  it("rejects a cookie pasted into the wrong field and header injection characters", () => {
    assert.throws(() => normalizeManualCookies("auth_token=wrong", "auth"), /ct0 field/);
    assert.throws(() => normalizeManualCookies("abc; auth_token=secret", "auth"), /invalid characters/);
    assert.throws(() => normalizeManualCookies("ct0=", "auth"), /empty/);
  });
});

describe("stable protected settings location", () => {
  it("does not change when Field Theory creates its database", () => {
    const home = path.join(os.tmpdir(), "zegion-user");
    const firstLaunch = resolveCookieConfigPath({ env: {}, home, repoRoot: ROOT });
    const afterFirstSync = resolveCookieConfigPath({ env: {}, home, repoRoot: ROOT });
    assert.equal(firstLaunch, afterFirstSync);
    assert.equal(firstLaunch, path.join(home, ".ft-bookmarks", "cookies-config.json"));
  });

  it("honors explicit data and config locations", () => {
    assert.equal(
      resolveCookieConfigPath({ env: { FT_DATA_DIR: "D:/app-data" }, home: "C:/home", repoRoot: ROOT }),
      path.join("D:/app-data", "cookies-config.json")
    );
    assert.equal(
      resolveCookieConfigPath({ env: { X_COOKIE_CONFIG: path.join(os.homedir(), ".zegion-test-cookies.json") }, home: "C:/home", repoRoot: ROOT }),
      path.join(os.homedir(), ".zegion-test-cookies.json")
    );
    assert.throws(
      () => resolveCookieConfigPath({ env: { X_COOKIE_CONFIG: "secrets/cookies.json" }, home: "C:/home", repoRoot: ROOT }),
      /outside the repository/
    );
  });
});

describe("Firefox profile prerequisites", () => {
  it("requires a profile entry with an actual cookies.sqlite database", () => {
    withWorkspaceTemp((home) => {
      const base = path.join(home, "AppData", "Roaming", "Mozilla", "Firefox");
      const profile = path.join(base, "Profiles", "default-release");
      fs.mkdirSync(profile, { recursive: true });
      fs.writeFileSync(path.join(base, "profiles.ini"), "[Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/default-release\n");
      assert.equal(resolveFirefoxProfile(home, "win32"), null);
      fs.writeFileSync(path.join(profile, "cookies.sqlite"), "fixture");
      assert.equal(resolveFirefoxProfile(home, "win32").profile, "default-release");
    });
  });
});

describe("classification review/apply ledger", () => {
  it("keeps suggestions separate until explicit apply and preserves existing categories", () => {
    withWorkspaceTemp((dir) => {
      const runsDir = path.join(dir, "classify-runs");
      fs.mkdirSync(runsDir, { recursive: true });
      const bookmarksPath = path.join(dir, "bookmarks.json");
      fs.writeFileSync(bookmarksPath, JSON.stringify({ bookmarks: [
        { id: "101", category: "unclassified", text: "pending" },
        { id: "102", category: "tool", text: "manually classified" },
      ] }));
      const runId = "run-review-test";
      const results = [
        { id: "101", label: "design", outcome: "suggestion", status: "success" },
        { id: "102", label: "launch", outcome: "suggestion", status: "success" },
        { id: "103", label: null, outcome: "failed", status: "failed", errorCode: "timeout" },
      ];
      fs.writeFileSync(path.join(runsDir, `${runId}.json`), JSON.stringify({ runId, state: "complete", results }));
      recordStagedSuggestions(runsDir, runId, "local-ml", results);
      assert.deepEqual(getExcludedClassificationIds(runsDir), ["101", "102"]);
      const beforeApply = applyReviewedCategories([{ id: "101", category: "unclassified" }], runsDir);
      assert.equal(beforeApply[0].category, "unclassified");

      const applied = applyClassificationReview({
        runsDir,
        runId,
        items: [{ id: "101", label: "design" }, { id: "102", label: "launch" }],
        bookmarksPath,
      });
      assert.deepEqual(applied.applied, [{ id: "101", label: "design" }]);
      assert.equal(applied.conflicts[0].reason, "bookmark-already-classified-or-missing");
      assert.equal(applyReviewedCategories([{ id: "101", category: "unclassified" }], runsDir)[0].category, "design");
      assert.equal(applyReviewedCategories([{ id: "101", category: "career" }], runsDir)[0].category, "career");
      assert.equal(getExcludedClassificationIds(runsDir).includes("101"), true);
    });
  });

  it("keeps abstained and failed outcomes distinct and supports explicit dismissal", () => {
    withWorkspaceTemp((dir) => {
      const runsDir = path.join(dir, "classify-runs");
      fs.mkdirSync(runsDir, { recursive: true });
      const results = [
        { id: "201", label: "uncertain", outcome: "suggestion", status: "success" },
        { id: "202", label: null, outcome: "abstained", status: "abstained" },
        { id: "203", label: null, outcome: "failed", status: "failed" },
      ];
      recordStagedSuggestions(runsDir, "run-dismiss", "local-ml", results);
      assert.deepEqual(dismissClassificationReview({ runsDir, runId: "run-dismiss", ids: ["201"] }).dismissed, ["201"]);
      assert.deepEqual(getExcludedClassificationIds(runsDir), ["201"]);
    });
  });
});
