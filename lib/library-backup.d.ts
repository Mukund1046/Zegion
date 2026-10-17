export interface LibraryBackupFile {
  name: string;
  bytes: number;
  sha256: string;
}

export interface LibraryBackupSummary {
  id: string;
  createdAt: string;
  files: LibraryBackupFile[];
  totalBytes: number;
}

export interface LibraryBackupOptions {
  outputDir: string;
  jsonlPath: string | null;
  backupsDir: string;
  now?: Date;
  keep?: number;
}

export declare function createLibraryBackup(options: LibraryBackupOptions): LibraryBackupSummary & { dir: string };

export declare function listLibraryBackups(backupsDir: string): LibraryBackupSummary[];

export interface RestoreLibraryBackupOptions {
  backupsDir: string;
  backupId: string;
  outputDir: string;
  jsonlPath: string | null;
}

export interface LibraryRestoreResult {
  id: string;
  createdAt: string;
  restored: string[];
}

export declare function restoreLibraryBackup(options: RestoreLibraryBackupOptions): LibraryRestoreResult;

export declare function pruneLibraryBackups(backupsDir: string, keep?: number): void;
