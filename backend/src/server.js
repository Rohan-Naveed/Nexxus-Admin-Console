const app = require("./app");
const config = require("../config/config.json");
const pool = require("./db/pool");
const logger = require("./logger/logger");

const PORT = config.server.port;

const server = app.listen(PORT, "127.0.0.1", () => {
  logger.info(`Nexxus admin console API listening on port ${PORT}`);

  pool
    .query("SELECT 1")
    .then(() => {
      logger.info("Database connection established", {
        host: config.db.host,
        database: config.db.database,
      });
    })
    .catch((err) => {
      logger.error("Database connection failed during startup", {
        host: config.db.host,
        database: config.db.database,
        error: err.message,
      });
    });
});

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully.`);
  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", err);
  process.exit(1);
});
