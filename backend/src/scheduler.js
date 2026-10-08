const pool = require("./db/pool");
const logger = require("./logger/logger");
const { startScheduler } = require("./modules/sync/sync.scheduler");

const scheduler = startScheduler();
let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, stopping the auto-sync scheduler.`);
  scheduler?.stop();

  try {
    await pool.end();
  } catch (err) {
    logger.error("Could not close the scheduler database pool", {
      error: err.message,
    });
    exitCode = 1;
  }

  process.exitCode = exitCode;
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled scheduler promise rejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught scheduler exception", err);
  shutdown("uncaughtException", 1);
});

if (!scheduler) {
  pool.end().catch((err) => {
    logger.error("Could not close the disabled scheduler database pool", {
      error: err.message,
    });
    process.exitCode = 1;
  });
}
