const cron = require("node-cron");
const config = require("../../../config/config.json");
const logger = require("../../logger/logger");
const service = require("./sync.service");

// Weekly scheduler. Runs Mondays at config.sync.schedulerTime (HH:MM) in the
// business timezone and syncs every ended week that hasn't synced yet
// (see runSchedulerOnce).
function startScheduler() {
  if (!config.sync.schedulerEnabled) {
    logger.info(
      "Sync scheduler is disabled (config.sync.schedulerEnabled = false).",
    );
    return null;
  }

  const [hh, mm] = config.sync.schedulerTime.split(":").map(Number);
  const expression = `${mm} ${hh} * * 1`;

  const task = cron.schedule(
    expression,
    () => {
      service
        .runSchedulerOnce()
        .catch((err) =>
          logger.error("Scheduler run failed", { error: err.message }),
        );
    },
    { timezone: config.sync.timezone },
  );

  logger.info(
    `Sync scheduler started: Mondays at ${config.sync.schedulerTime} (${config.sync.timezone}).`,
  );

  // Catch-up on boot: if the server was down at the scheduled time, this
  // picks up anything missed instead of waiting for tomorrow.
  const catchUpTimer = setTimeout(() => {
    service
      .runSchedulerOnce()
      .catch((err) =>
        logger.error("Startup catch-up sync failed", { error: err.message }),
      );
  }, 15000);

  return {
    stop() {
      clearTimeout(catchUpTimer);
      task.stop();
    },
  };
}

module.exports = { startScheduler };
