/** Library backup/restore/prune unit tests. Offline, temp-dir driven. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createLibraryBackup,
  listLibraryBackups,
  restoreLibraryBackup,
  pruneLibraryBackups,
} from "../library-backup.js";

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), "zegion-backup-"));

function seedLibrary(outputDir, jsonlPath) {
  fs.writeFileSync(
    path.join(outputDir, "bookmarks-data.json"),
    JSON.stringify({ bookmarks: [{ id: "1" }, { id: "2" }], folders: [] })
  );
  fs.writeFileSync(path.join(outputDir, "folders-data.json"), JSON.stringify({ folders: ["x"] }));
  if (jsonlPath) {
    fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
    fs.writeFileSync(jsonlPath, '{"id":"1"}\n');
  }
}

describe("createLibraryBackup", () => {
  it("copies the optional stores that exist and records a manifest", () => {
    const outputDir = mk();
    const backupsDir = mk();
    seedLibrary(outputDir, null);

    const backup = createLibraryBackup({ outputDir, jsonlPath: null, backupsDir });
    assert.equal(backup.id.startsWith("library-backup-"), true);
    assert.deepEqual(backup.files.map((f) => f.name), [
      "bookmarks-data.json",
      "folders-data.json",
    ]);
    assert.equal(fs.existsSync(path.join(backupsDir, backup.id, "manifest.json")), true);
  });

  it("includes bookmarks.jsonl when its path is provided", () => {
    const outputDir = mk();
    const backupsDir = mk();
    const jsonlPath = path.join(mk(), "bookmarks.jsonl");
    seedLibrary(outputDir, jsonlPath);

    const backup = createLibraryBackup({ outputDir, jsonlPath, backupsDir });
    assert.deepEqual(backup.files.map((f) => f.name), [
      "bookmarks-data.json",
      "folders-data.json",
      "bookmarks.jsonl",
    ]);
  });

  it("fails clearly when the library is missing", () => {
    const outputDir = mk();
    const backupsDir = mk();
    assert.throws(
      () => createLibraryBackup({ outputDir, jsonlPath: null, backupsDir }),
      /No local library found/
    );
  });
});

describe("listLibraryBackups", () => {
  it("returns snapshots sorted newest-first and skips junk", () => {
    const outputDir = mk();
    const backupsDir = mk();
    seedLibrary(outputDir, null);

    const first = createLibraryBackup({ outputDir, jsonlPath: null, backupsDir, now: new Date(1000) });
    const second = createLibraryBackup({ outputDir, jsonlPath: null, backupsDir, now: new Date(2000) });
    fs.mkdirSync(path.join(backupsDir, "library-backup-broken"), { recursive: true });

    const list = listLibraryBackups(backupsDir);
    assert.deepEqual(list.map((b) => b.id), [second.id, first.id]);
  });

  it("returns an empty list for a missing directory", () => {
    assert.deepEqual(listLibraryBackups(path.join(os.tmpdir(), " nonexistent-dir-xyz")), []);
  });
});

describe("restoreLibraryBackup", () => {
  it("roundtrips store content and refuses invalid ids", () => {
    const outputDir = mk();
    const backupsDir = mk();
    const jsonlPath = path.join(mk(), "bookmarks.jsonl");
    seedLibrary(outputDir, jsonlPath);

    const backup = createLibraryBackup({ outputDir, jsonlPath, backupsDir });
    fs.writeFileSync(path.join(outputDir, "bookmarks-data.json"), '{"bookmarks":[],"folders":[]}');
    fs.writeFileSync(jsonlPath, "changed\n");

    restoreLibraryBackup({ backupsDir, backupId: backup.id, outputDir, jsonlPath });
    const restored = JSON.parse(fs.readFileSync(path.join(outputDir, "bookmarks-data.json"), "utf8"));
    assert.deepEqual(restored.bookmarks.map((b) => b.id), ["1", "2"]);
    assert.equal(fs.readFileSync(jsonlPath, "utf8"), '{"id":"1"}\n');

    assert.throws(
      () => restoreLibraryBackup({ backupsDir, backupId: "../escape", outputDir, jsonlPath }),
      /Invalid backup id/
    );
    assert.throws(
      () => restoreLibraryBackup({ backupsDir, backupId: "library-backup-1999-01-01T00-00-00-000Z", outputDir, jsonlPath }),
      /Backup not found/
    );
  });

  it("rejects a corrupt snapshot without touching live stores", () => {
    const outputDir = mk();
    const backupsDir = mk();
    seedLibrary(outputDir, null);
    const backup = createLibraryBackup({ outputDir, jsonlPath: null, backupsDir });

    fs.writeFileSync(path.join(backupsDir, backup.id, "bookmarks-data.json"), '{"tampered":true}');
    fs.writeFileSync(path.join(outputDir, "bookmarks-data.json"), '{"live":true}');

    assert.throws(
      () => restoreLibraryBackup({ backupsDir, backupId: backup.id, outputDir, jsonlPath: null }),
      /corrupt|invalid/
    );
    assert.equal(fs.readFileSync(path.join(outputDir, "bookmarks-data.json"), "utf8"), '{"live":true}');
  });
});

describe("pruneLibraryBackups", () => {
  it("keeps only the newest snapshots", () => {
    const outputDir = mk();
    const backupsDir = mk();
    seedLibrary(outputDir, null);

    const keep = 3;
    for (let index = 0; index < 5; index++) {
      createLibraryBackup({ outputDir, jsonlPath: null, backupsDir, now: new Date(Date.UTC(2026, 0, 1, 0, 0, index * 2)) });
    }
    pruneLibraryBackups(backupsDir, keep);
    assert.equal(listLibraryBackups(backupsDir).length, keep);
  });
});
