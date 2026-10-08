const crypto = require("crypto");
const pool = require("../../db/pool");
const dispatchersService = require("../dispatchers/dispatchers.service");
const { readDispatcherSheet, resolveWeek } = require("./sheetReader");

const TEST_DISPATCHER_ID = 1;
const TEST_PERIOD_YEAR = new Date().getFullYear();
const TEST_PERIOD_MONTH = 9;
const TEST_WEEK_NUMBER = 4;

function displayName(dispatcher) {
  return dispatcher.alias || dispatcher.name;
}

function printRecord(title, record) {
  console.log(`\n${title}`);
  Object.entries(record).forEach(([column, value]) => {
    console.log(`  ${column}: ${JSON.stringify(value)}`);
  });
}

async function simulate() {
  const { dispatcherId, periodYear, periodMonth, weekNumber } = {
    dispatcherId: TEST_DISPATCHER_ID,
    periodYear: TEST_PERIOD_YEAR,
    periodMonth: TEST_PERIOD_MONTH,
    weekNumber: TEST_WEEK_NUMBER,
  };

  if (!Number.isInteger(dispatcherId) || dispatcherId < 1) {
    throw new Error("TEST_DISPATCHER_ID must be a positive integer.");
  }
  if (!Number.isInteger(periodYear) || periodYear < 1) {
    throw new Error("TEST_PERIOD_YEAR must be a positive integer.");
  }
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    throw new Error("TEST_PERIOD_MONTH must be between 1 and 12.");
  }
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 6) {
    throw new Error("TEST_WEEK_NUMBER must be between 1 and 6.");
  }

  const dispatcher = await dispatchersService.fetchById(dispatcherId);
  if (!dispatcher) throw new Error(`Dispatcher ${dispatcherId} was not found.`);
  if (dispatcher.employeeType !== "dispatcher") {
    throw new Error(
      `${displayName(dispatcher)} is not a truck dispatcher and cannot be synced.`,
    );
  }
  if (!dispatcher.googleSheetId?.trim() || !dispatcher.googleSheetTab?.trim()) {
    throw new Error(
      `${displayName(dispatcher)} does not have both a Google Sheet ID and tab configured.`,
    );
  }

  const runId = crypto.randomUUID();
  let parsed = null;
  let outcome;
  let readError = null;
  try {
    parsed = await readDispatcherSheet(
      dispatcher.googleSheetId.trim(),
      dispatcher.googleSheetTab.trim(),
    );
    outcome = resolveWeek(parsed, periodYear, periodMonth, weekNumber);
  } catch (err) {
    readError = err;
    outcome = { status: "failed" };
  }
  const weekBlock =
    parsed?.months[`${periodYear}-${periodMonth}`]?.weeks[weekNumber];

  console.log("GOOGLE SHEETS SYNC SIMULATION (READ-ONLY)");
  console.log("No payroll_weeks or sync_history rows will be written.");
  console.log(`Dispatcher: ${displayName(dispatcher)} (id ${dispatcher.id})`);
  console.log(`Sheet tab: ${dispatcher.googleSheetTab}`);
  console.log(
    `Period: ${periodYear}-${String(periodMonth).padStart(2, "0")}, week ${weekNumber}`,
  );
  console.log(`Resolved result: ${outcome.status}`);
  if (readError) console.log(`Read error: ${readError.message}`);

  if (weekBlock) {
    console.log(`Sheet rows: ${weekBlock.startRow}-${weekBlock.endRow}`);
    console.log(`Numeric commission cells: ${weekBlock.loads}`);
    console.log(`Commission column sum: ${weekBlock.sum}`);
    console.log(`Weekly total cell: ${weekBlock.total}`);
  }
  if (outcome.note || outcome.reason) {
    console.log(`Resolution note: ${outcome.note || outcome.reason}`);
  }
  if (parsed?.warnings.length > 0) {
    console.log("Sheet parser warnings:");
    parsed.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }

  if (outcome.status === "success") {
    printRecord("WOULD UPSERT payroll_weeks", {
      dispatcher_id: dispatcher.id,
      period_year: periodYear,
      period_month: periodMonth,
      week_number: weekNumber,
      gross_amount: outcome.gross,
      sync_source: "google_sheets",
      synced_at: "database-generated timestamp",
      updated_at: "database-generated on conflict",
    });
  } else {
    console.log(
      "\npayroll_weeks: no upsert; the real sync leaves it unchanged unless the result is success.",
    );
  }

  printRecord("WOULD INSERT sync_history", {
    run_id: runId,
    dispatcher_id: dispatcher.id,
    dispatcher_name: displayName(dispatcher),
    period_year: periodYear,
    period_month: periodMonth,
    week_number: weekNumber,
    trigger_type: "manual",
    triggered_by: "sync-simulator (simulation only)",
    status: outcome.status,
    gross_amount: outcome.status === "success" ? outcome.gross : null,
    error_message: readError?.message || null,
    note:
      outcome.status === "success"
        ? outcome.note || null
        : outcome.reason || null,
  });
}

simulate()
  .catch((err) => {
    console.error("Simulation failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error("Could not close the database pool:", err.message);
      process.exitCode = 1;
    }
  });
