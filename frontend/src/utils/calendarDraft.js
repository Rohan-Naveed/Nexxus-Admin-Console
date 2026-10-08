// Pure helpers behind the Week Calendar screen. Nothing here touches the
// DOM or the network, so the rules are easy to reason about.
//
// A "draft" is an object keyed by "YYYY-MM":
//   { "2026-10": [{ weekNumber, startDate, endDate, ended, locked }, ...], ... }
// Dates are plain "YYYY-MM-DD" strings (no timezone surprises).
//
// Editing model: inside a month the weeks are back-to-back by
// construction — you only ever choose where a week ENDS, and the next
// week starts the day after. Moving the last week of a month also moves
// the first week of the next (already set) month so nothing gaps or
// overlaps. The server re-checks everything.

export const MAX_WEEKS_PER_MONTH = 6;
export const MAX_WEEK_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

export const monthKey = (year, month) => `${year}-${pad(month)}`;

export function parseMonthKey(key) {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

export function nextMonthKey(key) {
  const { year, month } = parseMonthKey(key);
  return month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
}

export function prevMonthKey(key) {
  const { year, month } = parseMonthKey(key);
  return month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
}

function toUtc(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(dateStr, days) {
  return fromUtc(toUtc(dateStr) + days * DAY_MS);
}

export function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

// 0 = Monday ... 6 = Sunday
export function weekdayIndex(dateStr) {
  return (new Date(toUtc(dateStr)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekLength(week) {
  return diffDays(week.startDate, week.endDate) + 1;
}

export function lastEndOf(draft, key) {
  const weeks = draft[key];
  return weeks && weeks.length ? weeks[weeks.length - 1].endDate : null;
}

// The end date of the closest EARLIER set month, if it is the month
// right before `key` (so this month must continue from it).
export function adjacentPrevEnd(draft, key) {
  return lastEndOf(draft, prevMonthKey(key));
}

// ---- suggestions -------------------------------------------------------

// Monday-Sunday weeks, one per Sunday that falls in the month (so a week
// belongs to the month it ends in). Starts the day after `prevEnd` when
// given, so it slots in right after the previous month.
export function suggestMonth(year, month, prevEnd = null) {
  const total = daysInMonth(year, month);
  const sundays = [];
  for (let d = 1; d <= total; d += 1) {
    const ds = `${year}-${pad(month)}-${pad(d)}`;
    if (weekdayIndex(ds) === 6) sundays.push(ds);
  }
  const first = sundays[0];
  let start = prevEnd ? addDays(prevEnd, 1) : addDays(first, -6);
  const weeks = [];
  for (const sunday of sundays) {
    if (sunday < start) continue;
    weeks.push({
      weekNumber: weeks.length + 1,
      startDate: start,
      endDate: sunday,
      ended: false,
      locked: false,
    });
    start = addDays(sunday, 1);
  }
  return weeks;
}

// Same week lengths as `fromWeeks`, laid out after `prevEnd` (or from the
// first Monday-based start when there is no previous month).
export function copyPattern(fromWeeks, year, month, prevEnd = null) {
  let start = prevEnd
    ? addDays(prevEnd, 1)
    : suggestMonth(year, month)[0].startDate;
  return fromWeeks.map((w, i) => {
    const end = addDays(start, weekLength(w) - 1);
    const week = {
      weekNumber: i + 1,
      startDate: start,
      endDate: end,
      ended: false,
      locked: false,
    };
    start = addDays(end, 1);
    return week;
  });
}

// ---- edits -------------------------------------------------------------

function clone(draft) {
  const out = {};
  Object.keys(draft).forEach((k) => {
    out[k] = draft[k].map((w) => ({ ...w }));
  });
  return out;
}

// Re-lay the weeks of `key` so each starts the day after the previous
// ends; then pull the next adjacent set month's first week along.
function relayMonth(draft, key) {
  const weeks = draft[key];
  for (let i = 1; i < weeks.length; i += 1) {
    if (!weeks[i].locked) weeks[i].startDate = addDays(weeks[i - 1].endDate, 1);
  }
  const nextKey = nextMonthKey(key);
  const next = draft[nextKey];
  if (next && next.length && weeks.length && !next[0].locked) {
    next[0].startDate = addDays(weeks[weeks.length - 1].endDate, 1);
    relayMonth(draft, nextKey);
  }
}

// Move where week `index` of `key` ends.
export function setWeekEnd(draft, key, index, endDate) {
  const out = clone(draft);
  out[key][index].endDate = endDate;
  relayMonth(out, key);
  return out;
}

// Move the first day of a month's first week (only when the month before
// it isn't set; otherwise it is derived from that month's last week).
export function setFirstStart(draft, key, startDate) {
  const out = clone(draft);
  out[key][0].startDate = startDate;
  relayMonth(out, key);
  return out;
}

export function addWeek(draft, key) {
  const out = clone(draft);
  const weeks = out[key] || [];
  const lastEnd = weeks.length ? weeks[weeks.length - 1].endDate : null;
  const previousMonthEnd = weeks.length
    ? null
    : adjacentPrevEnd(draft, key);
  const start =
    lastEnd || previousMonthEnd
      ? addDays(lastEnd || previousMonthEnd, 1)
      : suggestMonth(...Object.values(parseMonthKey(key)))[0].startDate;
  weeks.push({
    weekNumber: weeks.length + 1,
    startDate: start,
    endDate: addDays(start, 6),
    ended: false,
    locked: false,
  });
  out[key] = weeks;
  relayMonth(out, key);
  return out;
}

export function removeLastWeek(draft, key) {
  const out = clone(draft);
  const weeks = out[key];
  if (!weeks || weeks.length === 0 || weeks[weeks.length - 1].locked)
    return draft;
  weeks.pop();
  return out;
}

export function canRemoveWeek(draft, key, index) {
  const currentWeeks = draft[key];
  if (!currentWeeks || !currentWeeks[index] || currentWeeks[index].locked)
    return false;

  let nextKey = nextMonthKey(key);
  while (draft[nextKey]?.length) {
    if (draft[nextKey].some((week) => week.locked)) return false;
    nextKey = nextMonthKey(nextKey);
  }
  return !currentWeeks.slice(index + 1).some((week) => week.locked);
}

export function removeWeek(draft, key, index, today) {
  if (!canRemoveWeek(draft, key, index)) return draft;

  const out = clone(draft);
  const weeks = out[key];
  const firstStart = weeks[0].startDate;
  weeks.splice(index, 1);

  for (let i = index; i < weeks.length; i += 1) {
    const duration = weekLength(weeks[i]);
    weeks[i].weekNumber = i + 1;
    weeks[i].startDate =
      i === 0 ? firstStart : addDays(weeks[i - 1].endDate, 1);
    weeks[i].endDate = addDays(weeks[i].startDate, duration - 1);
    weeks[i].ended = weeks[i].endDate < today;
  }

  relayMonth(out, key);
  return out;
}

export function setMonthWeeks(draft, key, weeks) {
  const out = clone(draft);
  out[key] = weeks.map((w, i) => ({ ...w, weekNumber: i + 1 }));
  relayMonth(out, key);
  return out;
}

export function clearMonth(draft, key) {
  const out = clone(draft);
  out[key] = [];
  return out;
}

// ---- validation (mirrors the server rules) ----------------------------

export function validateDraft(draft, today) {
  const problems = [];
  const keys = Object.keys(draft).sort();
  const label = (key) => {
    const { year, month } = parseMonthKey(key);
    return `${new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${year}`;
  };

  keys.forEach((key) => {
    const weeks = draft[key];
    if (weeks.length > MAX_WEEKS_PER_MONTH) {
      problems.push({
        key,
        message: `${label(key)}: at most ${MAX_WEEKS_PER_MONTH} weeks.`,
      });
    }
    weeks.forEach((w, i) => {
      if (w.endDate < w.startDate) {
        problems.push({
          key,
          weekNumber: w.weekNumber,
          message: `${label(key)}, Week ${w.weekNumber}: has no days. Shorten the week before it.`,
        });
      } else if (weekLength(w) > MAX_WEEK_DAYS) {
        problems.push({
          key,
          weekNumber: w.weekNumber,
          message: `${label(key)}, Week ${w.weekNumber}: longer than ${MAX_WEEK_DAYS} days.`,
        });
      }
      if (i > 0 && w.startDate !== addDays(weeks[i - 1].endDate, 1)) {
        problems.push({
          key,
          weekNumber: w.weekNumber,
          message: `${label(key)}, Week ${w.weekNumber}: must start the day after Week ${i} ends.`,
        });
      }
    });
  });

  const setKeys = keys.filter((k) => draft[k].length > 0);
  for (let i = 1; i < setKeys.length; i += 1) {
    const prevKey = setKeys[i - 1];
    const key = setKeys[i];
    const prevEnd = lastEndOf(draft, prevKey);
    const start = draft[key][0].startDate;
    if (start <= prevEnd) {
      problems.push({
        key,
        weekNumber: 1,
        message: `${label(key)}, Week 1 overlaps ${label(prevKey)}.`,
      });
    } else if (nextMonthKey(prevKey) === key && start !== addDays(prevEnd, 1)) {
      problems.push({
        key,
        weekNumber: 1,
        message: `${label(key)}, Week 1 must start the day after ${label(prevKey)} ends.`,
      });
    }
  }
  return problems;
}

// End dates for any unsynced week can be adjusted, including in the past.
// Full-calendar validation prevents overlaps; synced weeks remain locked.
export function canMoveEnd(week, endDate, today) {
  return Boolean(week) && !week.locked;
}

// ---- change detection ---------------------------------------------------

const sig = (weeks) =>
  JSON.stringify(
    (weeks || []).map((w) => [w.weekNumber, w.startDate, w.endDate]),
  );

export function changedMonthKeys(draft, original) {
  const keys = new Set([...Object.keys(draft), ...Object.keys(original)]);
  return [...keys].filter((k) => sig(draft[k]) !== sig(original[k])).sort();
}

// ---- the day grid for one month ----------------------------------------

// Rows of 7 days (Mon-Sun) covering the month and any weeks that spill
// over its edges. Each day knows which draft week (of any month) owns it.
export function buildGrid(draft, key) {
  const { year, month } = parseMonthKey(key);
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
  const own = draft[key] || [];

  let from = monthStart;
  let to = monthEnd;
  if (own.length) {
    if (own[0].startDate < from) from = own[0].startDate;
    if (own[own.length - 1].endDate > to) to = own[own.length - 1].endDate;
  }
  from = addDays(from, -weekdayIndex(from));
  to = addDays(to, 6 - weekdayIndex(to));

  const owners = [];
  Object.keys(draft).forEach((k) => {
    draft[k].forEach((w, i) => owners.push({ key: k, index: i, week: w }));
  });

  const rows = [];
  let cursor = from;
  while (cursor <= to) {
    const row = [];
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(cursor, i);
      const owner =
        owners.find(
          (o) => o.week.startDate <= date && date <= o.week.endDate,
        ) || null;
      row.push({
        date,
        day: Number(date.slice(8, 10)),
        inMonth: date >= monthStart && date <= monthEnd,
        ownerKey: owner ? owner.key : null,
        weekIndex: owner ? owner.index : null,
        mine: owner ? owner.key === key : false,
        isStart: owner ? owner.week.startDate === date : false,
        isEnd: owner ? owner.week.endDate === date : false,
      });
    }
    rows.push(row);
    cursor = addDays(cursor, 7);
  }
  return rows;
}
