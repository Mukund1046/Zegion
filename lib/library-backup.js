/**
 * Library backup, restore, and pruning.
 *
 * Copies the viewer's durable stores (bookmarks-data.json, folders-data.json,
 * bookmarks.jsonl) into a manifest-recorded snapshot directory under the
 * library's data area. Each manifest records byte size and SHA-256 per file;
 * restore verifies a copy's integrity before it replaces any live store, so a
 * partial or corrupted backup can never be written over good data.
 *
 * Snapshots are user data (real bookmark content) — never commit them.
 */
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const BACKUP_ID_PATTERN = /^library-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const MANIFEST_NAME = "manifest.json";
const DEFAULT_KEEP = 10;

// Only these store files may appear in a backup or be restored. Anything else
// in the snapshot directory is ignored on restore.
const BACKUP_FILES = ["bookmarks-data.json", "folders-data.json", "bookmarks.jsonl"];
const REQUIRED_FILES = ["bookmarks-data.json"];

function backupIdFromDate(date) {
  return `library-backup-${date.toISOString().replace(/[:.]/g, "-")}`;
}

function writeAtomic(filePath, buffer) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, filePath);
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function createLibraryBackup({ outputDir, jsonlPath, backupsDir, now = new Date(), keep = DEFAULT_KEEP }) {
  const sources = [
    { name: "bookmarks-data.json", src: path.join(outputDir, "bookmarks-data.json"), required: true },
    { name: "folders-data.json", src: path.join(outputDir, "folders-data.json"), required: false },
    { name: "bookmarks.jsonl", src: jsonlPath, required: false },
  ];

  const dir = path.join(backupsDir, backupIdFromDate(now));
  fs.mkdirSync(dir, { recursive: true });

  const files = [];
  for (const source of sources) {
    if (!source.src || !fs.existsSync(source.src) || !fs.statSync(source.src).isFile()) {
      if (source.required) {
        throw new Error("No local library found. Sync or export bookmarks first.");
      }
      continue;
    }
    fs.copyFileSync(source.src, path.join(dir, source.name));
    const buffer = fs.readFileSync(path.join(dir, source.name));
    files.push({ name: source.name, bytes: buffer.length, sha256: sha256Buffer(buffer) });
  }

  const createdAt = now.toISOString();
  fs.writeFileSync(
    path.join(dir, MANIFEST_NAME),
    `${JSON.stringify({ version: 1, id: path.basename(dir), createdAt, files }, null, 2)}\n`
  );

  pruneLibraryBackups(backupsDir, keep);

  return {
    id: path.basename(dir),
    createdAt,
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    dir,
  };
}

function listLibraryBackups(backupsDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(backupsDir);
  } catch {
    return [];
  }
  const backups = [];
  for (const name of entries) {
    if (!BACKUP_ID_PATTERN.test(name)) continue;
    const dir = path.join(backupsDir, name);
    const manifestPath = path.join(dir, MANIFEST_NAME);
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest && manifest.version === 1 && manifest.createdAt && Array.isArray(manifest.files)) {
        backups.push({
          id: manifest.id || name,
          createdAt: manifest.createdAt,
          files: manifest.files,
          totalBytes: manifest.files.reduce((sum, file) => sum + (file.bytes || 0), 0),
        });
      }
    } catch {
      // Unreadable manifest: skip the entry rather than poisoning the list.
    }
  }
  return backups.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function readBackupSnapshot(backupsDir, backupId) {
  if (typeof backupId !== "string" || !BACKUP_ID_PATTERN.test(backupId)) {
    throw new Error("Invalid backup id.");
  }
  const dir = path.join(backupsDir, backupId);
  const manifestPath = path.join(dir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) throw new Error("Backup not found.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest || manifest.version !== 1 || !manifest.createdAt || !Array.isArray(manifest.files)) {
    throw new Error("Backup manifest is invalid.");
  }
  return { dir, manifest, manifestPath };
}

function restoreLibraryBackup({ backupsDir, backupId, outputDir, jsonlPath }) {
  const { dir, manifest } = readBackupSnapshot(backupsDir, backupId);
  if (!Array.isArray(manifest.files)) throw new Error("Backup manifest is invalid.");

  // Verify every recorded file before touching any live store.
  for (const file of manifest.files) {
    if (!BACKUP_FILES.includes(file.name)) {
      throw new Error(`Backup contains an unexpected file: ${file.name}`);
    }
    const backupCopy = path.join(dir, file.name);
    if (!fs.existsSync(backupCopy)) {
      throw new Error(`Backup file is missing: ${file.name}`);
    }
    const buffer = fs.readFileSync(backupCopy);
    if (buffer.length !== file.bytes || sha256Buffer(buffer) !== file.sha256) {
      throw new Error(`Backup file is corrupt: ${file.name}`);
    }
  }

  const targets = [
    { name: "bookmarks-data.json", dest: path.join(outputDir, "bookmarks-data.json") },
    { name: "folders-data.json", dest: path.join(outputDir, "folders-data.json") },
    { name: "bookmarks.jsonl", dest: jsonlPath },
  ];
  const restored = [];
  for (const target of targets) {
    if (!manifest.files.some((file) => file.name === target.name)) continue;
    if (!target.dest) continue;
    fs.mkdirSync(path.dirname(target.dest), { recursive: true });
    writeAtomic(target.dest, fs.readFileSync(path.join(dir, target.name)));
    restored.push(target.name);
  }

  return { id: backupId, createdAt: manifest.createdAt, restored };
}

function pruneLibraryBackups(backupsDir, keep = DEFAULT_KEEP) {
  const backups = listLibraryBackups(backupsDir);
  for (const backup of backups.slice(keep)) {
    fs.rmSync(path.join(backupsDir, backup.id), { recursive: true, force: true });
  }
}

module.exports = {
  BACKUP_ID_PATTERN,
  createLibraryBackup,
  listLibraryBackups,
  restoreLibraryBackup,
  pruneLibraryBackups,
};
