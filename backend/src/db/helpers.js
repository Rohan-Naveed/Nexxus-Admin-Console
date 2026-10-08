const pool = require("./pool");
const logger = require("../logger/logger");

/**
 * For read-style calls where you want data back: SELECT, and any
 * INSERT/UPDATE/DELETE that uses RETURNING.
 *
 * Logs the query text, its params, and the row count returned, then
 * resolves with the rows array.
 *
 * @param {string} sql - parameterized SQL, e.g. "SELECT * FROM x WHERE id = $1"
 * @param {Array} params - values for $1, $2, ...
 * @param {string} [label] - short name for the query, for readable logs (e.g. "dispatchers.selectAll")
 * @returns {Promise<Array<object>>} the result rows
 */
async function dbQuery(sql, params = [], label = "query") {
  const startedAt = Date.now();
  logger.info(`[DB SELECT] ${label}`, { sql, params });

  try {
    const result = await pool.query(sql, params);
    const durationMs = Date.now() - startedAt;
    logger.info(`[DB SELECT OK] ${label} — ${result.rows.length} row(s) in ${durationMs}ms`);
    return result.rows;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error(`[DB SELECT FAILED] ${label} after ${durationMs}ms`, {
      sql,
      params,
      error: err.message,
    });
    throw err;
  }
}

/**
 * For write-style calls where you just need to know how many rows were
 * touched: UPDATE, and any INSERT/DELETE without RETURNING.
 *
 * Logs the query text, its params, and the affected row count, then
 * resolves with that row count.
 *
 * @param {string} sql - parameterized SQL, e.g. "UPDATE x SET y = $2 WHERE id = $1"
 * @param {Array} params - values for $1, $2, ...
 * @param {string} [label] - short name for the query, for readable logs (e.g. "dispatchers.update")
 * @returns {Promise<number>} number of rows affected
 */
async function dbExecute(sql, params = [], label = "execute") {
  const startedAt = Date.now();
  logger.info(`[DB WRITE] ${label}`, { sql, params });

  try {
    const result = await pool.query(sql, params);
    const durationMs = Date.now() - startedAt;
    logger.info(`[DB WRITE OK] ${label} — ${result.rowCount} row(s) affected in ${durationMs}ms`);
    return result.rowCount;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error(`[DB WRITE FAILED] ${label} after ${durationMs}ms`, {
      sql,
      params,
      error: err.message,
    });
    throw err;
  }
}

module.exports = { dbQuery, dbExecute };
