const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  getBookmarksOutputPath,
  getFoldersOutputPath,
  getJsonlPath,
} = require("./config");

const JSONL_PATH = getJsonlPath();
const OUTPUT_PATH = getBookmarksOutputPath();
const ROOT = path.resolve(__dirname, "..");
const FT_CLI = path.join(ROOT, "node_modules", "fieldtheory", "bin", "ft.mjs");

const EXCLUDED_IDS = new Set([
  "2039806744646566240",
  "2040147478096289824",
]);

function fetchFTCategories() {
  const result = spawnSync(process.execPath, [FT_CLI, "list", "--json", "--limit", "2000"], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    timeout: 300000,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout || result.stdout.trim().length === 0) {
    console.warn("ft list failed — categories/domains will be empty", result.stderr?.slice(0, 200));
    return new Map();
  }
  let list;
  try {
    // Strip ANSI escape codes
    const clean = result.stdout.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "").trim();
    const idx = clean.indexOf("[");
    if (idx === -1) {
      console.warn("Could not find JSON array in ft list output");
      return new Map();
    }
    list = JSON.parse(clean.slice(idx));
  } catch (e) {
    console.warn("Could not parse ft list output:", e.message);
    return new Map();
  }
  const map = new Map();
  for (const entry of list) {
    const id = entry.tweetId || entry.id;
    if (!id) continue;
    map.set(id, {
      category: entry.primaryCategory || "unclassified",
      categories: entry.categories || [],
      domain: entry.primaryDomain || null,
      domains: entry.domains || [],
      ftLinks: entry.links || [],
    });
  }
  console.log(`Enriched ${map.size} bookmarks with category/domain data`);
  return map;
}

function extractLinkedDomains(links) {
  const hosts = new Set();
  for (const link of links) {
    try {
      const host = new URL(link).hostname.replace(/^www\./, "");
      if (host && host !== "x.com" && host !== "twitter.com") {
        hosts.add(host);
      }
    } catch (e) {
      console.warn("Skipping invalid URL:", link, e.message);
    }
  }
  return [...hosts];
}

function main() {
  if (!fs.existsSync(JSONL_PATH)) {
    throw new Error(
      `Bookmarks JSONL not found at ${JSONL_PATH}. Set X_BOOKMARKS_JSONL or FT_DATA_DIR if your bookmarks live somewhere else.`
    );
  }

  const categoryMap = fetchFTCategories();

  const rawJsonl = fs.readFileSync(JSONL_PATH, "utf8");
  const lines = rawJsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bookmarks = [];

  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      const id = raw.tweetId || raw.id;
      if (EXCLUDED_IDS.has(id)) continue;

      const mediaObjects = (raw.mediaObjects || []).filter(
        (m) => (m.type === "photo" || m.type === "video" || m.type === "animated_gif") && m.url
      );

      const images = mediaObjects.map((m) => {
        const entry = {
          url: m.url,
          width: m.width || 1,
          height: m.height || 1,
          type: m.type || "photo",
        };
        if ((m.type === "video" || m.type === "animated_gif") && m.videoVariants) {
          const mp4s = m.videoVariants
            .filter((v) => v.url && v.url.includes(".mp4"))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          if (mp4s.length > 0) {
            entry.videoUrl = mp4s[0].url;
          }
        }
        return entry;
      });

      const enriched = categoryMap.get(id) || {};
      const linkedDomains = extractLinkedDomains(raw.links || []);

      bookmarks.push({
        id: raw.tweetId || raw.id,
        text: raw.text || "",
        url: raw.url || `https://x.com/${raw.authorHandle}/status/${raw.tweetId}`,
        authorHandle: raw.authorHandle || "",
        authorName: raw.authorName || "",
        authorAvatar: raw.authorProfileImageUrl || "",
        postedAt: raw.postedAt || "",
        bookmarkedAt: raw.bookmarkedAt || "",
        syncedAt: raw.syncedAt || "",
        images,
        mediaCount: (raw.media || []).length,
        likeCount: raw.engagement?.likeCount ?? 0,
        repostCount: raw.engagement?.repostCount ?? 0,
        bookmarkCount: raw.engagement?.bookmarkCount ?? 0,
        category: enriched.category || "unclassified",
        categories: enriched.categories || [],
        domain: enriched.domain || null,
        domains: enriched.domains || [],
        linkedDomains,
      });
    } catch (e) {
      console.warn("Skipping malformed JSONL line:", e.message);
    }
  }

  // Merge folder data if available
  const FOLDERS_PATH = getFoldersOutputPath();
  let folders = [];
  let folderMap = {};
  if (fs.existsSync(FOLDERS_PATH)) {
    const foldersData = JSON.parse(fs.readFileSync(FOLDERS_PATH, "utf8"));
    folders = foldersData.folders || [];
    folderMap = foldersData.folderMap || {};
    let tagged = 0;
    for (const bm of bookmarks) {
      bm.folders = folderMap[bm.id] || [];
      if (bm.folders.length > 0) tagged++;
    }
    console.log(`Tagged ${tagged} bookmarks with folder data (${folders.length} folders)`);
  } else {
    for (const bm of bookmarks) bm.folders = [];
  }

  bookmarks.sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
  );

  const output = { folders, bookmarks };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(
    `Exported ${bookmarks.length} bookmarks (${bookmarks.filter((b) => b.images.length > 0).length} with images)`
  );
  console.log(`Wrote ${OUTPUT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}