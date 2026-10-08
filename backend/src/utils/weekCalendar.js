// Date helpers for the week calendar and the sync scheduler.
//
// The weeks THEMSELVES are no longer computed here: the admin defines
// them (start/end date per week) in the Week Calendar, stored in the
// calendar_weeks table (see modules/calendar). This file only holds the
// pure date maths around those weeks:
//
//   * A week is { weekNumber, start: "YYYY-MM-DD", end: "YYYY-MM-DD" }.
//   * A week has ENDED once "today" (in the business timezone,
//     config.sync.timezone) is after its end date, i.e. from 00:00 the
//     day after the end date the admin set.
//
// Dates are plain calendar dates ("YYYY-MM-DD" strings / UTC math), so
// nothing here depends on the server's own timezone.

const config = require("../../config/config.json");

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

function toKey(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d));
}

function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return { y, m, d };
}

function fromUtcDate(date) {
  return toKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function addDays(dateKey, days) {
  const { y, m, d } = parseDateKey(dateKey);
  return fromUtcDate(new Date(utcDate(y, m, d).getTime() + days * DAY_MS));
}

// Whole days from a to b (b - a), both "YYYY-MM-DD".
function diffDays(a, b) {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round(
    (utcDate(pb.y, pb.m, pb.d) - utcDate(pa.y, pa.m, pa.d)) / DAY_MS,
  );
}

function isValidDateKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { y, m, d } = parseDateKey(key);
  const date = utcDate(y, m, d);
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

// Today's calendar date ("YYYY-MM-DD") in the business timezone.
function todayInTimezone(now = new Date(), timeZone = config.sync.timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Has this week ended? True from 00:00 the day after its end date.
function isWeekEnded(week, now = new Date(), timeZone = config.sync.timezone) {
  return todayInTimezone(now, timeZone) > week.end;
}

// The first date a week can be synced: the day after it ends.
function eligibleFrom(week) {
  return addDays(week.end, 1);
}

// Whole days since a week became eligible (0 on the first eligible day).
function daysSinceEligible(
  week,
  now = new Date(),
  timeZone = config.sync.timezone,
) {
  return diffDays(eligibleFrom(week), todayInTimezone(now, timeZone));
}

// { year, month } for a "YYYY-MM" string.
function parseMonthKey(key) {
  const [y, m] = String(key).split("-").map(Number);
  return { year: y, month: m };
}

// Current { year, month } (1-12) in the business timezone.
function currentMonth(now = new Date(), timeZone = config.sync.timezone) {
  const { y, m } = parseDateKey(todayInTimezone(now, timeZone));
  return { year: y, month: m };
}

function nextMonthOf({ year, month }) {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// UTC offset (ms) of a timezone at a given instant.
function tzOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

// Next Monday occurrence (as a Date instant) of a wall-clock time in the
// business timezone, strictly after `now`.
function nextMondayRun(
  timeHHMM,
  now = new Date(),
  timeZone = config.sync.timezone,
) {
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const today = todayInTimezone(now, timeZone);
  const { y, m, d } = parseDateKey(today);
  const weekday = utcDate(y, m, d).getUTCDay();
  const daysUntilMonday = (1 - weekday + 7) % 7;

  for (let weekOffset = 0; weekOffset <= 1; weekOffset += 1) {
    const runDate = addDays(today, daysUntilMonday + weekOffset * 7);
    const { y: runYear, m: runMonth, d: runDay } = parseDateKey(runDate);
    const guess = new Date(Date.UTC(runYear, runMonth - 1, runDay, hh, mm, 0));
    const instant = new Date(guess.getTime() - tzOffsetMs(guess, timeZone));
    if (instant > now) return instant;
  }
  return null;
}

module.exports = {
  addDays,
  diffDays,
  isValidDateKey,
  todayInTimezone,
  isWeekEnded,
  eligibleFrom,
  daysSinceEligible,
  parseMonthKey,
  currentMonth,
  nextMonthOf,
  daysInMonth,
  nextMondayRun,
};
