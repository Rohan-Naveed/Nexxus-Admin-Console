const fs = require("fs");
const path = require("path");
const config = require("../../config/config.json");

const LOG_DIR = path.join(
  __dirname,
  "..",
  "..",
  config.logging?.directory || "logs",
);

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = ["error", "warn", "info", "debug"];
const configuredLevel = config.logging?.level || "info";
const configuredLevelIndex = LEVELS.indexOf(configuredLevel);

function todayFileName() {
  // YYYY-MM-DD, local date — one file per calendar day
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}.log`;
}

function currentFilePath() {
  return path.join(LOG_DIR, todayFileName());
}

function serializeMeta(meta) {
  if (meta === undefined) return "";
  if (meta instanceof Error) {
    return ` ${meta.stack || meta.message}`;
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

function write(level, message, meta) {
  const levelIndex = LEVELS.indexOf(level);
  if (levelIndex === -1 || levelIndex > configuredLevelIndex) return;

  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${serializeMeta(meta)}\n`;

  // Append to today's file. Re-resolved on every call so the logger
  // automatically rolls over to a new file after midnight without
  // needing a restart.
  fs.appendFile(currentFilePath(), line, (err) => {
    if (err) {
      // Last resort — if we can't write to disk, at least surface it.
      // eslint-disable-next-line no-console
      console.error("Failed to write log line:", err);
    }
  });

  if (config.logging?.console !== false) {
    // eslint-disable-next-line no-console
    console[level === "debug" ? "log" : level === "error" ? "error" : "log"](
      line.trim(),
    );
  }
}

const logger = {
  error: (message, meta) => write("error", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  info: (message, meta) => write("info", message, meta),
  debug: (message, meta) => write("debug", message, meta),
};

module.exports = logger;
