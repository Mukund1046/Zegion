const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Write JSON atomically: fully write + fsync a temp file in the same
// directory, then rename over the target. A crash mid-write can never leave
// a half-written JSON file behind (rename is atomic on the same filesystem).
function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}.json`
  );
  const fd = fs.openSync(tmpPath, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2), "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}

module.exports = { writeJsonAtomic };
