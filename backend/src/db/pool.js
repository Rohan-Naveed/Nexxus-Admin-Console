const { Pool, types } = require("pg");
const config = require("../../config/config.json");
const logger = require("../logger/logger");

types.setTypeParser(types.builtins.DATE, (value) => value);

const dbConfig = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
};

const pool = new Pool(dbConfig);

pool.on("error", (err) => {
  // Errors on idle clients (e.g. a dropped connection) — never let these
  // crash the process silently.
  logger.error("Unexpected error on idle PostgreSQL client", err);
});

pool.on("connect", () => {
  logger.debug("New PostgreSQL client connected", {
    host: dbConfig.host,
    database: dbConfig.database,
  });
});

module.exports = pool;
