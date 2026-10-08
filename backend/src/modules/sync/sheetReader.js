// Reads a dispatcher's Google Sheet tab and turns it into per-month,
// per-week gross figures.
//
// SHEET LAYOUT (one tab holds every month, stacked top to bottom):
//   * A month banner row, e.g. "September 2026".
//   * Under it, one cyan block per week. The block's label ("WEEK 01") is a
//     MERGED cell in the week-label column spanning the block's rows, and
//     the week's total is a MERGED cell in the weekly-total column.
//   * Each load row has the 2.5% commission in the commission column.
//     "Gross" for a week is that weekly total (= sum of the commission
//     column for the block).
//   * Loads carry no date: the WEEK block is the only thing that says
//     which week a load belongs to.
//   * Saturday / Sunday bars between blocks are ignored.
//
// Blocks are found by scanning for the labels and merged ranges — no row
// numbers are hardcoded. Column letters come from config.sync.sheet.

const path = require("path");
const { google } = require("googleapis");
const config = require("../../../config/config.json");

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_BANNER_RE = new RegExp(
  `^\\s*(${MONTH_NAMES.join("|")})\\s+(\\d{4})\\s*$`,
  "i",
);
const WEEK_LABEL_RE = /^\s*WEEK\s*0*(\d+)\s*$/i;

function colToIndex(letters) {
  let n = 0;
  for (const ch of String(letters).toUpperCase())
    n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// Pure function: (values grid, merges) -> { months, warnings }.
// `values` is the 2D array from values.get (UNFORMATTED_VALUE, row-major);
// `merges` is the sheet's merge list (0-based, end-exclusive).
function parseSheet(
  values,
  merges = [],
  columns = config.sync.sheet,
  displayValues = values,
) {
  const labelCol = colToIndex(columns.weekLabelColumn);
  const commissionCol = colToIndex(columns.commissionColumn);
  const totalCol = colToIndex(columns.weeklyTotalColumn);
  const warnings = [];

  const cell = (r, c) => (values[r] ? values[r][c] : undefined);

  // 1. Events in row order: month banners and week labels.
  const events = [];
  for (let r = 0; r < values.length; r += 1) {
    const row = values[r] || [];
    const displayRow = displayValues[r] || [];
    // A merged month banner can be anchored in any column on the row.
    for (let c = 0; c < Math.max(row.length, displayRow.length); c += 1) {
      for (const value of [displayRow[c], row[c]]) {
        if (typeof value !== "string") continue;
        const m = value.match(MONTH_BANNER_RE);
        if (m) {
          events.push({
            row: r,
            type: "month",
            year: Number(m[2]),
            month: MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1,
          });
          break;
        }
      }
      if (
        events[events.length - 1]?.row === r &&
        events[events.length - 1]?.type === "month"
      )
        break;
    }
    const label = row[labelCol];
    if (typeof label === "string") {
      const m = label.match(WEEK_LABEL_RE);
      if (m) events.push({ row: r, type: "week", weekNumber: Number(m[1]) });
    }
  }

  const mergeEndRow = (row, col) => {
    const merge = merges.find(
      (mg) =>
        mg.startRowIndex === row &&
        mg.startColumnIndex <= col &&
        col < mg.endColumnIndex,
    );
    return merge ? merge.endRowIndex - 1 : null;
  };

  // 2. Build a block per week label under the most recent month banner.
  const months = {};
  let current = null;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.type === "month") {
      current = { year: ev.year, month: ev.month };
      continue;
    }
    if (!current) {
      warnings.push(
        `WEEK ${ev.weekNumber} at row ${ev.row + 1} is above any month banner; ignored.`,
      );
      continue;
    }

    // Block end: the label's merged range, else up to the next event.
    let endRow = mergeEndRow(ev.row, labelCol);
    if (endRow === null) {
      const next = events[i + 1];
      endRow = next ? next.row - 1 : values.length - 1;
    }
    // Never run past the next banner/label.
    const nextEvent = events[i + 1];
    if (nextEvent && endRow >= nextEvent.row) endRow = nextEvent.row - 1;

    let sum = 0;
    let loads = 0;
    let total = null;
    for (let r = ev.row; r <= endRow; r += 1) {
      const commission = cell(r, commissionCol);
      if (isNumber(commission)) {
        sum += commission;
        loads += 1;
      }
      const t = cell(r, totalCol);
      if (total === null && isNumber(t)) total = t;
    }

    const key = `${current.year}-${current.month}`;
    months[key] = months[key] || { weeks: {} };
    if (months[key].weeks[ev.weekNumber]) {
      warnings.push(
        `Duplicate WEEK ${ev.weekNumber} block for ${key} at row ${ev.row + 1}; using the first one.`,
      );
      continue;
    }
    months[key].weeks[ev.weekNumber] = {
      startRow: ev.row + 1,
      endRow: endRow + 1,
      loads,
      sum,
      total,
    };
  }

  return { months, warnings };
}

// Decide what a parsed block means for a given month/week.
// -> { status: "success", gross, note } | { status: "no_data", reason }
function resolveWeek(parsed, year, month, weekNumber) {
  const monthEntry = parsed.months[`${year}-${month}`];
  if (!monthEntry) {
    return {
      status: "no_data",
      reason: `No "${MONTH_NAMES[month - 1]} ${year}" banner found in the sheet.`,
    };
  }
  const block = monthEntry.weeks[weekNumber];
  if (!block) {
    return {
      status: "no_data",
      reason: `No WEEK ${String(weekNumber).padStart(2, "0")} block found under that month.`,
    };
  }
  const hasTotal = block.total !== null && block.total !== 0;
  if (block.loads === 0 && !hasTotal) {
    return {
      status: "no_data",
      reason: `WEEK ${String(weekNumber).padStart(2, "0")} block is empty.`,
    };
  }

  const round4 = (n) => Math.round(n * 10000) / 10000;
  if (block.total === null) {
    return {
      status: "success",
      gross: round4(block.sum),
      note: "Weekly total cell was empty; used the sum of the commission column.",
    };
  }
  const note =
    Math.abs(block.total - block.sum) > 0.01
      ? `Weekly total (${round4(block.total)}) differs from the row sum (${round4(block.sum)}); used the weekly total.`
      : null;
  return { status: "success", gross: round4(block.total), note };
}

// ---- Google API access -------------------------------------------------

let sheetsClient = null;
function getSheetsClient() {
  if (!sheetsClient) {
    const keyFile = path.join(
      __dirname,
      "..",
      "..",
      "..",
      config.sync.google.serviceAccountKeyFile,
    );
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    sheetsClient = google.sheets({ version: "v4", auth });
  }
  return sheetsClient;
}

function friendlyGoogleError(err, sheetId, tab) {
  const status = err?.code || err?.response?.status;
  if (status === 403) {
    return new Error(
      "Sheet not shared with the service account (needs Viewer access), or the Sheets API is disabled.",
    );
  }
  if (status === 404) {
    return new Error(
      `Spreadsheet ${sheetId} was not found. Check the sheet ID.`,
    );
  }
  if (err?.code === "ENOENT") {
    return new Error(
      `Google service account key file not found (${config.sync.google.serviceAccountKeyFile}).`,
    );
  }
  return new Error(err?.message || `Could not read tab "${tab}".`);
}

// Keep raw numbers for calculations and formatted cell text for banners,
// which may be dates displayed as "September 2026" in the sheet.
async function readDispatcherSheet(sheetId, tab) {
  const sheets = getSheetsClient();
  const range = `'${String(tab).replace(/'/g, "''")}'`;
  try {
    const [valuesRes, displayValuesRes, metaRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
        valueRenderOption: "UNFORMATTED_VALUE",
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
        valueRenderOption: "FORMATTED_VALUE",
      }),
      sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        ranges: [range],
        fields: "sheets(properties(title,sheetId),merges)",
      }),
    ]);

    const sheet = (metaRes.data.sheets || []).find(
      (s) => s.properties?.title === tab,
    );
    if (!sheet)
      throw new Error(`Tab "${tab}" was not found in the spreadsheet.`);

    return parseSheet(
      valuesRes.data.values || [],
      sheet.merges || [],
      config.sync.sheet,
      displayValuesRes.data.values || [],
    );
  } catch (err) {
    if (err.message?.startsWith("Tab ")) throw err;
    throw friendlyGoogleError(err, sheetId, tab);
  }
}

module.exports = { parseSheet, resolveWeek, readDispatcherSheet };
