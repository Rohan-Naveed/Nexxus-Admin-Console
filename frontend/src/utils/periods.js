// Date/period helpers shared by the top-of-page date banner and the
// Payroll / Expenses / Fines / Reports breakdowns.
//
// WEEKS COME FROM THE WEEK CALENDAR. The admin sets how many weeks each
// month has and the start/end date of every week (Week Calendar tab; the
// backend table is calendar_weeks). AdminConsole loads them once and hands
// them to setCalendarWeeks(). A week belongs to the month it is LABELLED
// with in the calendar, which can differ from the calendar month of some
// of its days (e.g. Sep 28 - Oct 4 can be "Week 1 of October").
//
// If a month has no weeks set, these helpers fall back to the old fixed
// split (days 1-7, 8-14, 15-21, 22-end) so screens with older/mock data
// keep working, and the *notSet flags below let the UI warn the admin.
// Nothing is ever synced for a month that isn't set — that is enforced by
// the backend, not here.
//
// The previous implementation (fixed 4 chunks only) is kept, commented
// out, at the bottom of this file in case it needs to be restored.

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const WEEK_CHUNK_START_DAYS = [1, 8, 15, 22];

// ---- calendar store -------------------------------------------------------

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

let calendarWeeks = []; // sorted by start date

// rows: [{ periodYear, periodMonth, weekNumber, startDate, endDate }]
export function setCalendarWeeks(rows = []) {
  calendarWeeks = rows
    .map((r) => ({
      year: r.periodYear,
      monthIndex: r.periodMonth - 1,
      weekNumber: r.weekNumber,
      startDate: r.startDate,
      endDate: r.endDate,
      start: parseDate(r.startDate),
      end: parseDate(r.endDate),
      calendar: true,
    }))
    .sort((a, b) => a.start - b.start);
}

export function isMonthSet(year, monthIndex) {
  return calendarWeeks.some(
    (w) => w.year === year && w.monthIndex === monthIndex,
  );
}

// "YYYY-MM" keys of every month that has weeks set, newest first.
export function getSetMonthKeys() {
  const keys = new Set(
    calendarWeeks.map(
      (w) => `${w.year}-${String(w.monthIndex + 1).padStart(2, "0")}`,
    ),
  );
  return [...keys].sort().reverse();
}

export function getCalendarWeekForDate(date) {
  const d = dayStart(date);
  return calendarWeeks.find((w) => w.start <= d && d <= w.end) ?? null;
}

// Calendar weeks that have ended before `today` (end date < today), newest
// last. Weekly sync data only exists for these.
export function getEndedCalendarWeeks(today = new Date()) {
  const d = dayStart(today);
  return calendarWeeks.filter((w) => w.end < d);
}

// How many weeks a "YYYY-MM" month has: the admin-set count, or 4 (the
// legacy split) when the month isn't set.
export function getMonthWeekCountByKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const set = calendarWeeks.filter(
    (w) => w.year === year && w.monthIndex === month - 1,
  );
  return set.length || 4;
}

function weeksOfMonth(year, monthIndex) {
  return calendarWeeks.filter(
    (w) => w.year === year && w.monthIndex === monthIndex,
  );
}

// ---- legacy fixed split (fallback for months that aren't set) -----------

function legacyMonthWeekChunks(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return WEEK_CHUNK_START_DAYS.map((startDay, i) => {
    const endDay =
      i === WEEK_CHUNK_START_DAYS.length - 1
        ? daysInMonth
        : WEEK_CHUNK_START_DAYS[i + 1] - 1;
    return {
      weekNumber: i + 1,
      startDay,
      endDay,
      start: new Date(year, monthIndex, startDay),
      end: new Date(year, monthIndex, endDay),
      calendar: false,
    };
  });
}

// ---- public API -------------------------------------------------------------

// The weeks of a month (monthIndex is 0-based, matching Date): the
// admin-set weeks when the month is set, otherwise the legacy 4 chunks.
// Every chunk has real `start`/`end` Dates — compare those, not day
// numbers (a week can cross a month boundary).
export function getMonthWeekChunks(year, monthIndex) {
  const set = weeksOfMonth(year, monthIndex);
  if (set.length === 0) return legacyMonthWeekChunks(year, monthIndex);
  return set.map((w) => ({
    weekNumber: w.weekNumber,
    startDay: w.start.getDate(),
    endDay: w.end.getDate(),
    start: w.start,
    end: w.end,
    calendar: true,
  }));
}

export function isMonthInProgressKey(monthKey, today = new Date()) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey ?? "");
  if (!match) return false;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return false;
  const todayStart = dayStart(today);
  return getMonthWeekChunks(year, monthIndex).some(
    (chunk) => dayStart(chunk.end) >= todayStart,
  );
}

// Which week number a date falls into (of the month its week is labelled
// with — see getPeriodMonth).
export function getWeekOfMonth(date = new Date()) {
  const week = getCalendarWeekForDate(date);
  if (week) return week.weekNumber;
  const day = date.getDate();
  const chunk =
    legacyMonthWeekChunks(date.getFullYear(), date.getMonth()).find(
      (c) => day >= c.startDay && day <= c.endDay,
    ) ?? null;
  return chunk ? chunk.weekNumber : 1;
}

// The month a date counts towards: the month its calendar week is labelled
// with, or (no week set for that date) the plain calendar month.
export function getPeriodMonth(date = new Date()) {
  const week = getCalendarWeekForDate(date);
  if (week)
    return { year: week.year, monthIndex: week.monthIndex, calendar: true };
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    calendar: false,
  };
}

export function getPeriodMonthKey(date = new Date()) {
  const { year, monthIndex } = getPeriodMonth(date);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function chunkContains(chunk, date) {
  const d = dayStart(date);
  return chunk.start <= d && d <= chunk.end;
}

export function chunkReached(chunk, date) {
  return dayStart(date) >= chunk.start;
}

// Whole days of `chunk` that have elapsed as of `date` (0 if not started).
export function chunkElapsedDays(chunk, date) {
  const d = dayStart(date);
  if (d < chunk.start) return 0;
  const last = d > chunk.end ? chunk.end : d;
  return Math.round((last - chunk.start) / 86400000) + 1;
}

export function chunkLengthDays(chunk) {
  return Math.round((chunk.end - chunk.start) / 86400000) + 1;
}

export function formatRange(start, end) {
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endLabel = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startLabel} \u2013 ${endLabel}`;
}

// Info for the "Weekly" filter: the current week, its date range, and a
// day-by-day strip for marking today. `notSet` is true when no admin-set
// week covers today (the banner then asks the admin to set the weeks).
export function getWeekInfo(today = new Date()) {
  const week = getCalendarWeekForDate(today);
  const period = getPeriodMonth(today);
  const chunks = getMonthWeekChunks(period.year, period.monthIndex);
  const current =
    (week && chunks.find((c) => c.weekNumber === week.weekNumber)) ??
    chunks.find((c) => chunkContains(c, today)) ??
    chunks[chunks.length - 1];

  const days = [];
  const cursor = new Date(current.start);
  while (cursor <= current.end) {
    days.push({
      date: new Date(cursor),
      dayNum: cursor.getDate(),
      dayLabel: cursor.toLocaleDateString("en-US", { weekday: "short" }),
      isToday: cursor.toDateString() === today.toDateString(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    weekNumber: current.weekNumber,
    totalWeeks: chunks.length,
    year: period.year,
    monthIndex: period.monthIndex,
    monthLabel: MONTH_NAMES[period.monthIndex],
    start: current.start,
    end: current.end,
    rangeLabel: formatRange(current.start, current.end),
    days,
    today,
    notSet: !week,
  };
}

// Info for the "Monthly" filter: every week of the current period month
// with a reached/current flag so far-off weeks show as "not reached yet".
export function getMonthWeeksStatus(today = new Date()) {
  const period = getPeriodMonth(today);
  const chunks = getMonthWeekChunks(period.year, period.monthIndex);

  const weeks = chunks.map((c) => ({
    weekNumber: c.weekNumber,
    rangeLabel: formatRange(c.start, c.end),
    start: c.start,
    end: c.end,
    reached: chunkReached(c, today),
    current: chunkContains(c, today),
  }));

  return {
    year: period.year,
    monthIndex: period.monthIndex,
    monthLabel: MONTH_NAMES[period.monthIndex],
    weeks,
    today,
    notSet: !isMonthSet(period.year, period.monthIndex),
  };
}

// Date range of the period immediately BEFORE the current one, for a
// given period type ("Weekly" | "Monthly" | "Yearly"). Used to compute
// "gross last week/month/year" figures.
export function getPreviousPeriodRange(periodType, today = new Date()) {
  const year = today.getFullYear();
  const monthIndex = today.getMonth();

  if (periodType === "Weekly") {
    const current = getCalendarWeekForDate(today);
    if (current) {
      const i = calendarWeeks.indexOf(current);
      const prev = calendarWeeks[i - 1];
      if (prev) return { start: prev.start, end: prev.end };
    }
    // No calendar week before this one: fall back to the fixed split.
    const chunks = legacyMonthWeekChunks(year, monthIndex);
    const day = today.getDate();
    const currentIdx = chunks.findIndex(
      (c) => day >= c.startDay && day <= c.endDay,
    );
    const idx = currentIdx === -1 ? chunks.length - 1 : currentIdx;
    if (idx === 0) {
      const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
      const prevYear = monthIndex === 0 ? year - 1 : year;
      const prevChunks = legacyMonthWeekChunks(prevYear, prevMonthIndex);
      const last = prevChunks[prevChunks.length - 1];
      return { start: last.start, end: last.end };
    }
    const prev = chunks[idx - 1];
    return { start: prev.start, end: prev.end };
  }

  if (periodType === "Monthly") {
    const period = getPeriodMonth(today);
    const prevMonthIndex = period.monthIndex === 0 ? 11 : period.monthIndex - 1;
    const prevYear = period.monthIndex === 0 ? period.year - 1 : period.year;
    const prevWeeks = weeksOfMonth(prevYear, prevMonthIndex);
    if (prevWeeks.length > 0) {
      return {
        start: prevWeeks[0].start,
        end: prevWeeks[prevWeeks.length - 1].end,
      };
    }
    return {
      start: new Date(prevYear, prevMonthIndex, 1),
      end: new Date(prevYear, prevMonthIndex + 1, 0),
    };
  }

  // Yearly
  return {
    start: new Date(year - 1, 0, 1),
    end: new Date(year - 1, 11, 31),
  };
}

// Whether a dispatcher's active window (joinedDate through leftDate, or
// through today if still active) overlaps at all with [rangeStart,
// rangeEnd]. Used to tell "no data because they weren't dispatching yet
// / had already left" (→ show N/A) apart from "data exists".
export function activeWindowOverlaps(
  joinedDate,
  leftDate,
  rangeStart,
  rangeEnd,
) {
  if (!joinedDate) return true; // unknown join date — don't assume N/A
  const joined = new Date(joinedDate + "T00:00:00");
  if (Number.isNaN(joined.getTime())) return true;

  const left = leftDate ? new Date(leftDate + "T00:00:00") : null;
  const activeEnd = left && !Number.isNaN(left.getTime()) ? left : null;

  if (joined > rangeEnd) return false;
  if (activeEnd && activeEnd < rangeStart) return false;
  return true;
}

// Info for the "Yearly" filter: every month with a reached/current flag.
export function getYearMonthsStatus(today = new Date()) {
  const year = today.getFullYear();
  const currentMonthIndex = today.getMonth();

  const months = MONTH_NAMES.map((label, idx) => ({
    monthIndex: idx,
    label,
    shortLabel: label.slice(0, 3),
    reached: idx <= currentMonthIndex,
    current: idx === currentMonthIndex,
  }));

  return { year, months, today };
}

// =============================================================================
// LEGACY IMPLEMENTATION (fixed 4-chunk weeks) — kept for reference/revert.
// Replaced by the calendar-driven helpers above. To revert, delete
// everything above this banner and uncomment the block below.
// =============================================================================
//
// // Date/period helpers shared by the top-of-page date banner and the
// // Payroll weekly/monthly breakdowns.
// //
// // "Week of month" here means a fixed 4-chunk split of the calendar month —
// // days 1-7, 8-14, 15-21, and 22-through-end — NOT the ISO/Monday-Sunday
// // week. This matches how the admin already talks about weeks elsewhere in
// // the app (see src/data/expenses.js, which already stores a 4-week
// // "Week 1..4" breakdown per month) and how payroll/expenses get entered
// // in practice. All "reached"/"current" flags are computed from the real
// // current date, so they update automatically day to day.
//
// export const MONTH_NAMES = [
//   "January", "February", "March", "April", "May", "June",
//   "July", "August", "September", "October", "November", "December",
// ];
//
// export const WEEK_CHUNK_START_DAYS = [1, 8, 15, 22];
//
// // Returns the 4 week-of-month chunks for a given year/month (monthIndex is
// // 0-based, matching Date). The 4th chunk always runs to the end of month.
// export function getMonthWeekChunks(year, monthIndex) {
//   const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
//   return WEEK_CHUNK_START_DAYS.map((startDay, i) => {
//     const endDay =
//       i === WEEK_CHUNK_START_DAYS.length - 1
//         ? daysInMonth
//         : WEEK_CHUNK_START_DAYS[i + 1] - 1;
//     return {
//       weekNumber: i + 1,
//       startDay,
//       endDay,
//       start: new Date(year, monthIndex, startDay),
//       end: new Date(year, monthIndex, endDay),
//     };
//   });
// }
//
// // Which week-of-month (1-4) a given date falls into.
// export function getWeekOfMonth(date = new Date()) {
//   const day = date.getDate();
//   const chunk =
//     getMonthWeekChunks(date.getFullYear(), date.getMonth()).find(
//       (c) => day >= c.startDay && day <= c.endDay,
//     ) ?? null;
//   return chunk ? chunk.weekNumber : 1;
// }
//
// export function formatRange(start, end) {
//   const sameMonth = start.getMonth() === end.getMonth();
//   const startLabel = start.toLocaleDateString("en-US", {
//     month: "short",
//     day: "numeric",
//   });
//   const endLabel = sameMonth
//     ? String(end.getDate())
//     : end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
//   return `${startLabel} \u2013 ${endLabel}`;
// }
//
// // Info for the "Weekly" filter: which week-of-month today falls in, its
// // date range, and a day-by-day strip for marking today.
// export function getWeekInfo(today = new Date()) {
//   const year = today.getFullYear();
//   const monthIndex = today.getMonth();
//   const chunks = getMonthWeekChunks(year, monthIndex);
//   const current =
//     chunks.find((c) => today.getDate() >= c.startDay && today.getDate() <= c.endDay) ??
//     chunks[chunks.length - 1];
//
//   const days = [];
//   const cursor = new Date(current.start);
//   while (cursor <= current.end) {
//     days.push({
//       date: new Date(cursor),
//       dayNum: cursor.getDate(),
//       dayLabel: cursor.toLocaleDateString("en-US", { weekday: "short" }),
//       isToday: cursor.toDateString() === today.toDateString(),
//     });
//     cursor.setDate(cursor.getDate() + 1);
//   }
//
//   return {
//     weekNumber: current.weekNumber,
//     totalWeeks: chunks.length,
//     year,
//     monthIndex,
//     monthLabel: MONTH_NAMES[monthIndex],
//     start: current.start,
//     end: current.end,
//     rangeLabel: formatRange(current.start, current.end),
//     days,
//     today,
//   };
// }
//
// // Info for the "Monthly" filter: every week-of-month with a reached/
// // current flag so far-off weeks can be shown as "not reached yet".
// export function getMonthWeeksStatus(today = new Date()) {
//   const year = today.getFullYear();
//   const monthIndex = today.getMonth();
//   const day = today.getDate();
//   const chunks = getMonthWeekChunks(year, monthIndex);
//
//   const weeks = chunks.map((c) => ({
//     weekNumber: c.weekNumber,
//     rangeLabel: formatRange(c.start, c.end),
//     start: c.start,
//     end: c.end,
//     reached: day >= c.startDay,
//     current: day >= c.startDay && day <= c.endDay,
//   }));
//
//   return { year, monthIndex, monthLabel: MONTH_NAMES[monthIndex], weeks, today };
// }
//
// // Date range of the period immediately BEFORE the current one, for a
// // given period type ("Weekly" | "Monthly" | "Yearly"). Used to compute
// // "gross last week/month/year" figures.
// export function getPreviousPeriodRange(periodType, today = new Date()) {
//   const year = today.getFullYear();
//   const monthIndex = today.getMonth();
//
//   if (periodType === "Weekly") {
//     const chunks = getMonthWeekChunks(year, monthIndex);
//     const day = today.getDate();
//     const currentIdx = chunks.findIndex(
//       (c) => day >= c.startDay && day <= c.endDay,
//     );
//     const idx = currentIdx === -1 ? chunks.length - 1 : currentIdx;
//
//     if (idx === 0) {
//       // Previous week is the last week-of-month chunk of the prior month.
//       const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
//       const prevYear = monthIndex === 0 ? year - 1 : year;
//       const prevChunks = getMonthWeekChunks(prevYear, prevMonthIndex);
//       const last = prevChunks[prevChunks.length - 1];
//       return { start: last.start, end: last.end };
//     }
//     const prev = chunks[idx - 1];
//     return { start: prev.start, end: prev.end };
//   }
//
//   if (periodType === "Monthly") {
//     const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
//     const prevYear = monthIndex === 0 ? year - 1 : year;
//     return {
//       start: new Date(prevYear, prevMonthIndex, 1),
//       end: new Date(prevYear, prevMonthIndex + 1, 0),
//     };
//   }
//
//   // Yearly
//   return {
//     start: new Date(year - 1, 0, 1),
//     end: new Date(year - 1, 11, 31),
//   };
// }
//
// // Whether a dispatcher's active window (joinedDate through leftDate, or
// // through today if still active) overlaps at all with [rangeStart,
// // rangeEnd]. Used to tell "no data because they weren't dispatching yet
// // / had already left" (→ show N/A) apart from "data exists".
// export function activeWindowOverlaps(joinedDate, leftDate, rangeStart, rangeEnd) {
//   if (!joinedDate) return true; // unknown join date — don't assume N/A
//   const joined = new Date(joinedDate + "T00:00:00");
//   if (Number.isNaN(joined.getTime())) return true;
//
//   const left = leftDate ? new Date(leftDate + "T00:00:00") : null;
//   const activeEnd = left && !Number.isNaN(left.getTime()) ? left : null;
//
//   if (joined > rangeEnd) return false;
//   if (activeEnd && activeEnd < rangeStart) return false;
//   return true;
// }
//
// // Info for the "Yearly" filter: every month with a reached/current flag.
// export function getYearMonthsStatus(today = new Date()) {
//   const year = today.getFullYear();
//   const currentMonthIndex = today.getMonth();
//
//   const months = MONTH_NAMES.map((label, idx) => ({
//     monthIndex: idx,
//     label,
//     shortLabel: label.slice(0, 3),
//     reached: idx <= currentMonthIndex,
//     current: idx === currentMonthIndex,
//   }));
//
//   return { year, months, today };
// }
