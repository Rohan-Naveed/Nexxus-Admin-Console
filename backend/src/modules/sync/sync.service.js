// The sync core. ONE code path is used by both manual runs (Sync Center
// buttons) and the weekly scheduler: read the dispatcher's sheet, resolve
// the week, upsert payroll_weeks, and write a sync_history row.
//
// Weeks are defined by the admin in the Week Calendar (calendar_weeks,
// see modules/calendar). A month with no weeks set is never synced. A
// week can be synced once it has ENDED: from the day after the end date
// the admin set (in config.sync.timezone).

const crypto = require("crypto");
const { dbQuery } = require("../../db/helpers");
const queries = require("../../../config/db.json").syncHistory;
const config = require("../../../config/config.json");
const logger = require("../../logger/logger");
const { ApiError } = require("../../middleware/errorHandler");
const dispatchersService = require("../dispatchers/dispatchers.service");
const ratesService = require("../rates/rates.service");
const payrollWeeksService = require("../payrollWeeks/payrollWeeks.service");
const { readDispatcherSheet, resolveWeek } = require("./sheetReader");
const weekCalendar = require("../../utils/weekCalendar");
const calendarService = require("../calendar/calendar.service");

const MAX_RUNS_KEPT = 50;

// ---- in-memory state (single server instance) --------------------------
const runs = new Map(); // runId -> run progress object
const inFlight = new Set(); // "dispatcherId:year-month-week" locks
let schedulerRunning = false;
let lastSchedulerCheckAt = null;

// ---- small helpers -----------------------------------------------------

function displayName(d) {
  return d.alias || d.name;
}

function hasSheet(d) {
  return Boolean(d.googleSheetId?.trim() && d.googleSheetTab?.trim());
}

// pg returns DATE columns as JS Dates at local midnight.
function dateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// Was the dispatcher on the roster at any point during this week?
function activeDuring(dispatcher, week) {
  const joined = dateOnly(dispatcher.profile?.joinedDate);
  const left = dateOnly(dispatcher.profile?.leftDate);
  if (joined && joined > week.end) return false;
  if (left && left < week.start) return false;
  return true;
}

function lockKey(dispatcherId, year, month, week) {
  return `${dispatcherId}:${year}-${month}-${week}`;
}

function toHistoryShape(row) {
  return {
    id: row.id,
    runId: row.run_id,
    dispatcherId: row.dispatcher_id,
    dispatcherName: row.dispatcher_name,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    weekNumber: row.week_number,
    triggerType: row.trigger_type,
    triggeredBy: row.triggered_by,
    status: row.status,
    grossAmount: row.gross_amount === null ? null : Number(row.gross_amount),
    errorMessage: row.error_message,
    note: row.note,
    reRate: row.re_rate === true,
    syncedAt: row.synced_at,
  };
}

// ---- one dispatcher + one week ----------------------------------------

async function recordHistory({
  runId,
  dispatcher,
  year,
  month,
  week,
  triggerType,
  triggeredBy,
  status,
  gross,
  error,
  note,
  reRate = false,
}) {
  await dbQuery(
    queries.insert,
    [
      runId,
      dispatcher.id,
      displayName(dispatcher),
      year,
      month,
      week,
      triggerType,
      triggeredBy,
      status,
      gross ?? null,
      error ?? null,
      note ?? null,
      reRate,
    ],
    "syncHistory.insert",
  );
}

async function syncOneWeek(
  ctx,
  dispatcher,
  year,
  month,
  weekNumber,
  calendarWeekNumbers = [],
) {
  const { runId, triggerType, triggeredBy, sheetCache, reRate } = ctx;
  const key = lockKey(dispatcher.id, year, month, weekNumber);

  // Guard against overlapping syncs of the same dispatcher + week.
  if (inFlight.has(key)) {
    return { status: "skipped", message: "Already syncing this week." };
  }
  inFlight.add(key);

  const base = {
    runId,
    dispatcher,
    year,
    month,
    week: weekNumber,
    triggerType,
    triggeredBy,
    reRate,
  };
  try {
    // One sheet read per dispatcher per run, shared by all its weeks.
    if (!sheetCache.has(dispatcher.id)) {
      sheetCache.set(
        dispatcher.id,
        readDispatcherSheet(
          dispatcher.googleSheetId.trim(),
          dispatcher.googleSheetTab.trim(),
        ),
      );
    }
    const parsed = await sheetCache.get(dispatcher.id);
    const outcome = resolveWeek(parsed, year, month, weekNumber);

    // The sheet may have WEEK blocks the calendar doesn't have (or the
    // other way round). Say so instead of silently ignoring it.
    const sheetWeeks = Object.keys(
      parsed.months[`${year}-${month}`]?.weeks || {},
    ).map(Number);
    const unknown = sheetWeeks.filter((n) => !calendarWeekNumbers.includes(n));
    if (unknown.length > 0) {
      const warning = `The sheet has ${unknown.map((n) => `WEEK ${String(n).padStart(2, "0")}`).join(", ")} for this month, but the Week Calendar doesn't. Check the calendar.`;
      outcome.note = outcome.note ? `${outcome.note} ${warning}` : warning;
      if (outcome.status === "no_data")
        outcome.reason = `${outcome.reason} ${warning}`;
    }

    if (outcome.status === "success") {
      ctx.trackingPropertiesPromise ??= ratesService.fetchTrackingProperties();
      const trackingProperties = await ctx.trackingPropertiesPromise;
      await payrollWeeksService.syncWeek({
        dispatcherId: dispatcher.id,
        periodYear: year,
        periodMonth: month,
        weekNumber,
        grossAmount: outcome.gross,
        syncSource: "google_sheets",
        grossPercentage: trackingProperties.grossPercentage,
        trackingPercentage: trackingProperties.trackingPercentage,
        recalculateTrackingRates: reRate,
      });
      await recordHistory({
        ...base,
        status: "success",
        gross: outcome.gross,
        note: outcome.note,
      });
      return {
        status: "success",
        gross: outcome.gross,
        message: outcome.note || null,
      };
    }

    // no_data: nothing is written to payroll_weeks, but the attempt is logged.
    await recordHistory({ ...base, status: "no_data", note: outcome.reason });
    return { status: "no_data", message: outcome.reason };
  } catch (err) {
    logger.error(
      `Sync failed for dispatcher ${dispatcher.id} ${year}-${month} W${weekNumber}`,
      {
        error: err.message,
      },
    );
    try {
      await recordHistory({ ...base, status: "failed", error: err.message });
    } catch (logErr) {
      logger.error("Could not write sync_history row for a failed sync", {
        error: logErr.message,
      });
    }
    return { status: "failed", message: err.message };
  } finally {
    inFlight.delete(key);
  }
}

// ---- a run: many dispatchers x many weeks ------------------------------

function pruneRuns() {
  if (runs.size <= MAX_RUNS_KEPT) return;
  const oldest = [...runs.keys()].slice(0, runs.size - MAX_RUNS_KEPT);
  oldest.forEach((id) => runs.delete(id));
}

// tasks: [{ dispatcher, year, month, weekNumber }]
async function executeRun(run, tasks) {
  const ctx = {
    runId: run.runId,
    triggerType: run.triggerType,
    triggeredBy: run.triggeredBy,
    reRate: run.reRate,
    sheetCache: new Map(),
  };

  // Group by dispatcher: weeks of one dispatcher run sequentially (they
  // share one sheet read); dispatchers run with limited concurrency to
  // stay well inside the Sheets API quota.
  const byDispatcher = new Map();
  tasks.forEach((t) => {
    if (!byDispatcher.has(t.dispatcher.id))
      byDispatcher.set(t.dispatcher.id, []);
    byDispatcher.get(t.dispatcher.id).push(t);
  });
  const queue = [...byDispatcher.values()];
  const concurrency = Math.max(1, config.sync.concurrency || 2);

  async function worker() {
    while (queue.length) {
      const group = queue.shift();
      for (const task of group) {
        const result = await syncOneWeek(
          ctx,
          task.dispatcher,
          task.year,
          task.month,
          task.weekNumber,
          task.calendarWeekNumbers,
        );
        run.items.push({
          dispatcherId: task.dispatcher.id,
          dispatcherName: displayName(task.dispatcher),
          year: task.year,
          month: task.month,
          weekNumber: task.weekNumber,
          status: result.status,
          grossAmount: result.gross ?? null,
          message: result.message || null,
        });
        run.counts[result.status] = (run.counts[result.status] || 0) + 1;
        run.done += 1;
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, worker),
    );
  } catch (err) {
    logger.error("Sync run crashed", { runId: run.runId, error: err.message });
    run.error = err.message;
  } finally {
    run.status = "done";
    run.finishedAt = new Date().toISOString();
    logger.info(`Sync run ${run.runId} finished`, run.counts);
  }
}

function createRun({
  triggerType,
  triggeredBy,
  total,
  skipped = [],
  reRate = false,
}) {
  const run = {
    runId: crypto.randomUUID(),
    status: "running",
    triggerType,
    triggeredBy,
    reRate,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    total,
    done: 0,
    counts: { success: 0, failed: 0, no_data: 0, skipped: 0 },
    items: [],
    // Dispatchers left out of a bulk run (e.g. no sheet linked).
    notRun: skipped,
    error: null,
  };
  runs.set(run.runId, run);
  pruneRuns();
  return run;
}

// ---- manual runs -------------------------------------------------------

function parseIntStrict(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n))
    throw new ApiError(400, `${label} must be a whole number.`);
  return n;
}

// body: { dispatcherIds: number[] | "all", year, month, weeks: number[] | "all", reRate?: boolean }
async function startManualRun(body, user) {
  const reRate = body.reRate ?? false;
  if (typeof reRate !== "boolean") {
    throw new ApiError(400, "reRate must be a boolean.");
  }
  const year = parseIntStrict(body.year, "year");
  const month = parseIntStrict(body.month, "month");
  if (month < 1 || month > 12)
    throw new ApiError(400, "month must be between 1 and 12.");

  const monthWeeks = await calendarService.getWeeksOfMonth(year, month);
  if (monthWeeks.length === 0) {
    throw new ApiError(
      400,
      `Weeks are not set for ${calendarService.monthLabel(year, month)}. Set them in the Week Calendar first.`,
    );
  }
  const ended = monthWeeks.filter((w) => weekCalendar.isWeekEnded(w));
  const calendarWeekNumbers = monthWeeks.map((w) => w.weekNumber);

  // Weeks: only ended weeks may be synced manually — enforced here, not
  // just in the UI.
  let weeks;
  if (body.weeks === "all") {
    if (ended.length === 0) {
      throw new ApiError(400, "No weeks have ended yet for that month.");
    }
    weeks = ended;
  } else if (Array.isArray(body.weeks) && body.weeks.length > 0) {
    weeks = [];
    for (const raw of body.weeks) {
      const n = parseIntStrict(raw, "week");
      const week = monthWeeks.find((w) => w.weekNumber === n);
      if (!week)
        throw new ApiError(400, `Week ${n} does not exist in that month.`);
      if (!weekCalendar.isWeekEnded(week)) {
        throw new ApiError(
          400,
          `Week ${n} hasn't ended yet. It can be synced from ${weekCalendar.eligibleFrom(week)}.`,
        );
      }
      weeks.push(week);
    }
  } else {
    throw new ApiError(400, 'weeks must be a list of week numbers or "all".');
  }

  const everyone = await dispatchersService.fetchAll();
  const dispatchers = everyone.filter(
    (person) => person.employeeType === "dispatcher",
  );
  const bulk = body.dispatcherIds === "all";
  let selected;
  if (bulk) {
    selected = dispatchers;
  } else if (
    Array.isArray(body.dispatcherIds) &&
    body.dispatcherIds.length > 0
  ) {
    const ids = new Set(body.dispatcherIds.map(Number));
    selected = dispatchers.filter((d) => ids.has(d.id));
    if (selected.length === 0) throw new ApiError(404, "Dispatcher not found.");
  } else {
    throw new ApiError(400, 'dispatcherIds must be a list of ids or "all".');
  }

  const skipped = [];
  const tasks = [];
  for (const dispatcher of selected) {
    if (!hasSheet(dispatcher)) {
      if (!bulk) {
        throw new ApiError(
          400,
          `${displayName(dispatcher)} has no Google Sheet linked. Add the sheet ID and tab in the dispatcher's edit form.`,
        );
      }
      skipped.push({
        dispatcherId: dispatcher.id,
        dispatcherName: displayName(dispatcher),
        reason: "No Google Sheet linked",
      });
      continue;
    }
    for (const week of weeks) {
      // In bulk runs, don't log noise for weeks the person wasn't on the
      // roster. An explicitly chosen dispatcher is always synced.
      if (bulk && !activeDuring(dispatcher, week)) continue;
      tasks.push({
        dispatcher,
        year,
        month,
        weekNumber: week.weekNumber,
        calendarWeekNumbers,
      });
    }
  }

  if (tasks.length === 0) {
    throw new ApiError(400, "Nothing to sync for that selection.", {
      notRun: skipped,
    });
  }

  const run = createRun({
    triggerType: "manual",
    triggeredBy: user?.email || "unknown",
    total: tasks.length,
    skipped,
    reRate,
  });
  // Fire and forget: the caller polls GET /api/sync/runs/:runId.
  executeRun(run, tasks).catch((err) =>
    logger.error("executeRun rejected", { error: err.message }),
  );
  return { runId: run.runId, total: run.total, notRun: skipped };
}

function getRun(runId) {
  const run = runs.get(runId);
  if (!run)
    throw new ApiError(
      404,
      "Sync run not found (it may have been cleared after a server restart).",
    );
  return run;
}

// ---- scheduler ---------------------------------------------------------

// Finds every ended week that hasn't synced successfully yet (and isn't
// stale no_data) and syncs it. Because it looks for anything MISSING —
// not just "last week" — a day when the server was down is caught up on
// the next run, and failed weeks are retried.
async function runSchedulerOnce(now = new Date()) {
  if (schedulerRunning) {
    logger.warn("Scheduler run skipped: a previous run is still in progress.");
    return null;
  }
  schedulerRunning = true;
  lastSchedulerCheckAt = new Date().toISOString();
  try {
    // Only weeks the admin has SET in the Week Calendar, and only once
    // they have ended (day after the admin-set end date). Months with no
    // weeks set never appear here, so they are never synced.
    const endedWeeks = await calendarService.getEndedWeeks(now);
    if (endedWeeks.length === 0) {
      logger.info("Scheduler: no ended weeks in the calendar.");
      return { total: 0 };
    }
    const fromInt = Math.min(...endedWeeks.map((w) => w.year * 100 + w.month));
    const monthWeekNumbers = new Map();
    (await calendarService.getAllWeeks()).forEach((w) => {
      const k = `${w.year}-${w.month}`;
      if (!monthWeekNumbers.has(k)) monthWeekNumbers.set(k, []);
      monthWeekNumbers.get(k).push(w.weekNumber);
    });

    const [allEmployees, latestAttempts, syncedRows] = await Promise.all([
      dispatchersService.fetchAll(),
      dbQuery(
        queries.latestPerWeekSince,
        [fromInt],
        "syncHistory.latestPerWeekSince",
      ),
      payrollWeeksService.fetchSyncedSince(fromInt),
    ]);
    const dispatchers = allEmployees.filter(
      (employee) => employee.employeeType === "dispatcher",
    );

    const wk = (r) =>
      `${r.dispatcher_id}:${r.period_year}-${r.period_month}-${r.week_number}`;
    const attempts = new Map(latestAttempts.map((r) => [wk(r), r]));
    const synced = new Set(syncedRows.map(wk));

    const tasks = [];
    for (const week of endedWeeks) {
      const { year, month } = week;
      const retryWindowOpen =
        weekCalendar.daysSinceEligible(week, now) <=
        (config.sync.noDataRetryDays ?? 3);
      for (const dispatcher of dispatchers) {
        if (!hasSheet(dispatcher) || !activeDuring(dispatcher, week)) continue;
        const key = lockKey(dispatcher.id, year, month, week.weekNumber);
        if (synced.has(key)) continue;
        const last = attempts.get(key);
        if (last?.status === "success") continue;
        // A week that came back empty is retried for a few days (data may
        // still be being entered), then left alone.
        if (last?.status === "no_data" && !retryWindowOpen) continue;
        if (inFlight.has(key)) continue;
        tasks.push({
          dispatcher,
          year,
          month,
          weekNumber: week.weekNumber,
          calendarWeekNumbers: monthWeekNumbers.get(`${year}-${month}`) || [],
        });
      }
    }

    if (tasks.length === 0) {
      logger.info("Scheduler: nothing to sync.");
      return { total: 0 };
    }

    const run = createRun({
      triggerType: "scheduler",
      triggeredBy: "scheduler",
      total: tasks.length,
    });
    logger.info(`Scheduler: syncing ${tasks.length} dispatcher-week(s)`, {
      runId: run.runId,
    });
    await executeRun(run, tasks);
    return { runId: run.runId, total: tasks.length, counts: run.counts };
  } finally {
    schedulerRunning = false;
  }
}

// ---- read models for the Sync Center ----------------------------------

async function getStatus(year, month) {
  const weeks = await calendarService.getWeeksOfMonth(year, month);
  const [allEmployees, attemptRows, payrollRows] = await Promise.all([
    dispatchersService.fetchAll(),
    dbQuery(
      queries.latestPerWeekForMonth,
      [year, month],
      "syncHistory.latestPerWeekForMonth",
    ),
    payrollWeeksService.fetchForMonth(year, month),
  ]);
  const dispatchers = allEmployees.filter(
    (employee) => employee.employeeType === "dispatcher",
  );

  const attempts = new Map(
    attemptRows.map((r) => [`${r.dispatcher_id}:${r.week_number}`, r]),
  );
  const payroll = new Map(
    payrollRows.map((r) => [`${r.dispatcherId}:${r.weekNumber}`, r]),
  );

  const rows = dispatchers.map((d) => {
    const cells = weeks.map((week) => {
      const ended = weekCalendar.isWeekEnded(week);
      const attempt = attempts.get(`${d.id}:${week.weekNumber}`);
      const pay = payroll.get(`${d.id}:${week.weekNumber}`);
      const hasGross = pay && pay.grossAmount !== null;

      let state;
      if (!activeDuring(d, week)) state = "not_active";
      else if (!ended) state = "not_ended";
      else if (attempt?.status === "failed") state = "failed";
      else if (attempt?.status === "no_data" && !hasGross) state = "no_data";
      else if (attempt?.status === "success" || hasGross) state = "synced";
      else state = "pending";

      return {
        weekNumber: week.weekNumber,
        state,
        canSync: ended && hasSheet(d),
        grossAmount: hasGross ? pay.grossAmount : null,
        grossPercentage: hasGross ? pay.grossPercentage : null,
        trackingPercentage: hasGross ? pay.trackingPercentage : null,
        trackingFeeAmount: hasGross ? pay.trackingFeeAmount : null,
        lastAttemptAt: attempt?.synced_at ?? null,
        lastTrigger: attempt?.trigger_type ?? null,
        lastTriggeredBy: attempt?.triggered_by ?? null,
        lastStatus: attempt?.status ?? null,
        lastMessage: attempt?.error_message || attempt?.note || null,
        syncedAt: hasGross ? pay.syncedAt : null,
      };
    });
    return {
      dispatcherId: d.id,
      name: displayName(d),
      realName: d.name,
      active: d.profile?.status !== "left",
      sheetLinked: hasSheet(d),
      weeks: cells,
    };
  });

  return {
    year,
    month,
    // false = the admin hasn't set this month's weeks; nothing can sync.
    weeksSet: weeks.length > 0,
    weeks: weeks.map((w) => ({
      weekNumber: w.weekNumber,
      start: w.start,
      end: w.end,
      ended: weekCalendar.isWeekEnded(w),
      eligibleFrom: weekCalendar.eligibleFrom(w),
    })),
    dispatchers: rows,
  };
}

async function getSummary() {
  const [lastRunRows, failedRows] = await Promise.all([
    dbQuery(queries.lastSchedulerRun, [], "syncHistory.lastSchedulerRun"),
    dbQuery(queries.failedCount, [], "syncHistory.failedCount"),
  ]);
  const next = config.sync.schedulerEnabled
    ? weekCalendar.nextMondayRun(config.sync.schedulerTime)
    : null;
  return {
    schedulerEnabled: Boolean(config.sync.schedulerEnabled),
    timezone: config.sync.timezone,
    schedulerTime: config.sync.schedulerTime,
    lastSchedulerSyncAt: lastRunRows[0]?.last_run ?? null,
    lastSchedulerCheckAt,
    nextScheduledRunAt: next ? next.toISOString() : null,
    failedCount: Number(failedRows[0]?.failed ?? 0),
  };
}

async function getHistory(filters) {
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 25, 1), 100);
  const page = Math.max(Number(filters.page) || 1, 1);
  const num = (v) =>
    v === undefined || v === "" || v === null ? null : Number(v);
  const str = (v) =>
    v === undefined || v === "" || v === null ? null : String(v);

  const trigger = str(filters.source);
  if (trigger && !["manual", "scheduler"].includes(trigger)) {
    throw new ApiError(400, "source must be 'manual' or 'scheduler'.");
  }
  const status = str(filters.status);
  if (status && !["success", "failed", "no_data"].includes(status)) {
    throw new ApiError(400, "status must be 'success', 'failed' or 'no_data'.");
  }

  const params = [
    num(filters.dispatcherId),
    num(filters.year),
    num(filters.month),
    trigger,
    status,
  ];
  const [rows, countRows] = await Promise.all([
    dbQuery(
      queries.list,
      [...params, pageSize, (page - 1) * pageSize],
      "syncHistory.list",
    ),
    dbQuery(queries.count, params, "syncHistory.count"),
  ]);
  return {
    page,
    pageSize,
    total: Number(countRows[0]?.total ?? 0),
    rows: rows.map(toHistoryShape),
  };
}

module.exports = {
  startManualRun,
  getRun,
  runSchedulerOnce,
  getStatus,
  getSummary,
  getHistory,
};
