import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Lock,
  Wand2,
  Copy,
  Plus,
  Minus,
  Trash2,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  ChevronsRight,
} from "lucide-react";
import {
  MAX_WEEKS_PER_MONTH,
  addDays,
  addWeek,
  adjacentPrevEnd,
  buildGrid,
  canRemoveWeek,
  canMoveEnd,
  changedMonthKeys,
  clearMonth,
  copyPattern,
  lastEndOf,
  monthKey,
  nextMonthKey,
  parseMonthKey,
  prevMonthKey,
  removeWeek,
  removeLastWeek,
  setFirstStart,
  setMonthWeeks,
  setWeekEnd,
  suggestMonth,
  validateDraft,
  weekLength,
} from "../utils/calendarDraft";

// Where the admin decides how many weeks each month has and the start /
// end date of every week. The whole console and the sync scheduler run on
// what is saved here.
//
// How it works: pick a month on the strip, then either Auto-fill it
// (Monday-Sunday) or build it by hand. You never type a week's start —
// each week starts the day after the previous one ends — you just click
// the day a week should END on. Unsynced weeks can be adjusted even when
// their dates are in the past; ended and synced weeks are locked.

const MONTH_NAMES = [
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

const monthLabel = (key) => {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

const shortDate = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
};

function rowsToDraft(months) {
  const draft = {};
  months.forEach((m) => {
    draft[monthKey(m.year, m.month)] = m.weeks.map((w) => ({
      weekNumber: w.weekNumber,
      startDate: w.startDate,
      endDate: w.endDate,
      ended: w.ended,
      locked: w.locked,
    }));
  });
  return draft;
}

export default function WeekCalendarTab({
  calendarService,
  initialMonth,
  onSaved,
}) {
  const [original, setOriginal] = useState({});
  const [draft, setDraft] = useState({});
  const [today, setToday] = useState("");
  const [timezone, setTimezone] = useState("");
  const [monthKeys, setMonthKeys] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [fillCount, setFillCount] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(
    async (keepSelection) => {
      setLoading(true);
      setError(null);
      try {
        const data = await calendarService.getCalendar();
        const next = rowsToDraft(data.months);
        setOriginal(next);
        setDraft(next);
        setToday(data.today);
        setTimezone(data.timezone);
        const keys = data.months.map((m) => monthKey(m.year, m.month));
        setMonthKeys(keys);
        if (!keepSelection) {
          const currentKey = data.today.slice(0, 7);
          setSelected(
            initialMonth && keys.includes(initialMonth)
              ? initialMonth
              : keys.includes(currentKey)
                ? currentKey
                : keys[0],
          );
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [calendarService, initialMonth],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const problems = useMemo(() => validateDraft(draft, today), [draft, today]);
  const changed = useMemo(
    () => changedMonthKeys(draft, original),
    [draft, original],
  );
  const weeks = (selected && draft[selected]) || [];
  const isSet = weeks.length > 0;
  const grid = useMemo(
    () => (selected ? buildGrid(draft, selected) : []),
    [draft, selected],
  );

  // Keep the active week valid when the month/weeks change.
  useEffect(() => {
    if (activeIdx > weeks.length - 1)
      setActiveIdx(Math.max(0, weeks.length - 1));
  }, [weeks.length, activeIdx]);

  const prevEnd = selected ? adjacentPrevEnd(draft, selected) : null;
  const fromPrevMonthLabel = selected ? monthLabel(prevMonthKey(selected)) : "";

  function update(nextDraft) {
    setDraft(nextDraft);
    setNotice(null);
    setError(null);
  }

  function selectMonth(key) {
    setSelected(key);
    setActiveIdx(0);
    setNotice(null);
  }

  // ---- actions --------------------------------------------------------
  function autoFill() {
    const { year, month } = parseMonthKey(selected);
    update(setMonthWeeks(draft, selected, suggestMonth(year, month, prevEnd)));
    setActiveIdx(0);
  }

  function copyFromPrevious() {
    const source = draft[prevMonthKey(selected)];
    if (!source || source.length === 0) return;
    const { year, month } = parseMonthKey(selected);
    update(
      setMonthWeeks(draft, selected, copyPattern(source, year, month, prevEnd)),
    );
    setActiveIdx(0);
  }

  function startBlank() {
    update(addWeek(draft, selected));
    setActiveIdx(0);
  }

  // Auto-fill the next N months that aren't set yet, chaining each one
  // onto the month before it.
  function fillNext() {
    let next = draft;
    let key = selected;
    let filled = 0;
    for (let i = 0; i < fillCount; i += 1) {
      key = nextMonthKey(key);
      if (!monthKeys.includes(key)) break;
      if (next[key] && next[key].length > 0) continue;
      const { year, month } = parseMonthKey(key);
      next = setMonthWeeks(
        next,
        key,
        suggestMonth(year, month, lastEndOf(next, prevMonthKey(key))),
      );
      filled += 1;
    }
    update(next);
    setNotice(
      filled
        ? `Filled ${filled} month${filled === 1 ? "" : "s"} (Monday to Sunday). Review and save.`
        : "The next months are already set.",
    );
  }

  function clickDay(cell) {
    const week = weeks[activeIdx];
    if (!week) return;
    if (cell.date < week.startDate) return;
    if (!canMoveEnd(week, cell.date, today)) {
      setError(
        week.locked
          ? "That week has ended and been synced, so it can't be changed."
          : "That week can't be changed.",
      );
      return;
    }
    if (cell.date === week.endDate) return;
    // Don't let a click run past the next week's end.
    const nextWeek = weeks[activeIdx + 1];
    if (nextWeek && cell.date >= nextWeek.endDate) {
      setError(
        `That would swallow Week ${nextWeek.weekNumber}. Shorten Week ${nextWeek.weekNumber} first or pick an earlier day.`,
      );
      return;
    }
    update(setWeekEnd(draft, selected, activeIdx, cell.date));
  }

  function moveEndBy(index, days) {
    const week = weeks[index];
    if (!canMoveEnd(week, addDays(week.endDate, days), today)) {
      setError(
        week.locked ? "That week is locked." : "That week can't be changed.",
      );
      return;
    }
    update(setWeekEnd(draft, selected, index, addDays(week.endDate, days)));
  }

  function changeEndDate(index, value) {
    if (!value) return;
    const week = weeks[index];
    if (!canMoveEnd(week, value, today)) {
      setError(
        week.locked ? "That week is locked." : "That week can't be changed.",
      );
      return;
    }
    update(setWeekEnd(draft, selected, index, value));
  }

  function changeFirstStart(value) {
    if (!value) return;
    update(setFirstStart(draft, selected, value));
  }

  function discardWeek(index) {
    const nextDraft = removeWeek(draft, selected, index, today);
    if (nextDraft === draft) {
      setError(
        "This week can't be discarded because it or a following week is locked.",
      );
      return;
    }
    update(nextDraft);
    setActiveIdx(Math.min(index, Math.max(0, weeks.length - 2)));
  }

  async function save() {
    if (problems.length > 0 || changed.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const months = changed.map((key) => {
        const { year, month } = parseMonthKey(key);
        return {
          year,
          month,
          weeks: (draft[key] || []).map((w) => ({
            weekNumber: w.weekNumber,
            startDate: w.startDate,
            endDate: w.endDate,
          })),
        };
      });
      await calendarService.saveMonths(months);
      setNotice(
        `Saved ${months.length} month${months.length === 1 ? "" : "s"}.`,
      );
      await load(true);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDraft(original);
    setNotice(null);
    setError(null);
  }

  function chipStatus(key) {
    const w = draft[key] || [];
    if (changed.includes(key)) return "edited";
    if (w.length === 0) return "missing";
    if (w.some((x) => x.locked)) return "locked";
    return "set";
  }

  const firstStartLocked = Boolean(prevEnd) || (weeks[0] && weeks[0].locked);
  const activeWeek = weeks[activeIdx];
  const canFillFromPrev = Boolean(draft[prevMonthKey(selected || "")]?.length);

  if (loading && monthKeys.length === 0) {
    return <div className="panel">Loading the week calendar…</div>;
  }

  return (
    <div className="content-stack">
      {/* ---- explainer + save bar ---- */}
      <div className="panel cal-intro">
        <div className="cal-intro-text">
          <div className="panel-title">Week calendar</div>
          <div className="panel-sub">
            Set how many weeks each month has and where every week ends. The
            admin console and the sync scheduler run on these weeks. Nothing is
            synced for a month until its weeks are set. Today is{" "}
            {today ? shortDate(today) : "—"} ({timezone}).
          </div>
        </div>
        <div className="cal-savebar">
          {changed.length > 0 && (
            <span className="cal-dirty">
              {changed.length} month{changed.length === 1 ? "" : "s"} edited
            </span>
          )}
          <button
            className="soft-button"
            onClick={discard}
            disabled={changed.length === 0 || saving}
          >
            <RotateCcw size={13} />
            Discard
          </button>
          <button
            className="primary-btn"
            onClick={save}
            disabled={changed.length === 0 || problems.length > 0 || saving}
            title={
              problems.length ? "Fix the highlighted problems first" : undefined
            }
          >
            <Save size={13} />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="load-error-banner">
          <AlertTriangle
            size={13}
            style={{ marginRight: 6, verticalAlign: "-2px" }}
          />
          {error}
        </div>
      )}
      {notice && (
        <div className="cal-notice">
          <CheckCircle2 size={14} />
          {notice}
        </div>
      )}

      {/* ---- month strip ---- */}
      <div className="cal-strip">
        {monthKeys.map((key) => {
          const status = chipStatus(key);
          const w = draft[key] || [];
          return (
            <button
              key={key}
              className={`cal-chip cal-chip-${status} ${selected === key ? "active" : ""}`}
              onClick={() => selectMonth(key)}
            >
              <span className="cal-chip-month">{monthLabel(key)}</span>
              <span className="cal-chip-state">
                {status === "missing" && "Not set"}
                {status === "set" && `${w.length} weeks`}
                {status === "locked" && (
                  <>
                    <Lock size={10} /> {w.length} weeks
                  </>
                )}
                {status === "edited" && "Edited"}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="cal-layout">
          {/* ---- day grid ---- */}
          <div className="panel">
            <div className="section-head">
              <div>
                <div className="panel-title">{monthLabel(selected)}</div>
                <div className="panel-sub">
                  {isSet
                    ? activeWeek
                      ? `Click a day to end Week ${activeWeek.weekNumber} there.`
                      : "Pick a week on the right."
                    : "This month has no weeks yet."}
                </div>
              </div>
              {isSet && (
                <div className="cal-count">
                  <button
                    className="icon-btn"
                    aria-label="Remove last week"
                    disabled={
                      weeks.length === 0 || weeks[weeks.length - 1].locked
                    }
                    onClick={() => update(removeLastWeek(draft, selected))}
                  >
                    <Minus size={13} />
                  </button>
                  <span className="cal-count-num">{weeks.length} weeks</span>
                  <button
                    className="icon-btn"
                    aria-label="Add a week"
                    disabled={weeks.length >= MAX_WEEKS_PER_MONTH}
                    onClick={() => {
                      update(addWeek(draft, selected));
                      setActiveIdx(weeks.length);
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )}
            </div>

            {!isSet && (
              <div className="cal-empty">
                <CalendarDays size={28} />
                <div className="cal-empty-title">
                  Weeks aren't set for {monthLabel(selected)}
                </div>
                <div className="panel-sub">
                  Nothing will be synced for this month until you set them.
                </div>
                <div className="cal-empty-actions">
                  <button className="primary-btn" onClick={autoFill}>
                    <Wand2 size={13} />
                    Auto-fill Monday–Sunday
                  </button>
                  {canFillFromPrev && (
                    <button className="soft-button" onClick={copyFromPrevious}>
                      <Copy size={13} />
                      Copy {fromPrevMonthLabel}'s week lengths
                    </button>
                  )}
                  <button className="soft-button" onClick={startBlank}>
                    <Plus size={13} />
                    Start with one week
                  </button>
                </div>
              </div>
            )}

            {isSet && (
              <>
                <div className="cal-grid">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                    (d) => (
                      <div key={d} className="cal-dow">
                        {d}
                      </div>
                    ),
                  )}
                  {grid.flat().map((cell) => {
                    const mine = cell.mine;
                    const cls = [
                      "cal-day",
                      cell.inMonth ? "" : "cal-day-out",
                      cell.ownerKey === null
                        ? "cal-day-free"
                        : mine
                          ? `cal-w${(cell.weekIndex % 6) + 1}`
                          : "cal-day-other",
                      mine && cell.weekIndex === activeIdx
                        ? "cal-day-active"
                        : "",
                      cell.isEnd ? "cal-day-end" : "",
                      cell.isStart ? "cal-day-start" : "",
                      cell.date === today ? "cal-day-today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        key={cell.date}
                        className={cls}
                        onClick={() => clickDay(cell)}
                        title={
                          cell.ownerKey && !mine
                            ? `Belongs to ${monthLabel(cell.ownerKey)}`
                            : cell.date
                        }
                      >
                        <span className="cal-day-num">{cell.day}</span>
                        {cell.isStart && mine && (
                          <span className="cal-day-tag">
                            W{cell.weekIndex + 1}
                          </span>
                        )}
                        {cell.ownerKey && !mine && cell.isStart && (
                          <span className="cal-day-tag cal-day-tag-other">
                            {monthLabel(cell.ownerKey).slice(0, 3)} W
                            {cell.weekIndex + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="cal-legend">
                  <span>
                    <i className="cal-dot cal-day-today" /> Today
                  </span>
                  <span>
                    <Lock size={11} /> Locked = ended and already synced
                  </span>
                </div>
              </>
            )}
          </div>

          {/* ---- week cards + tools ---- */}
          <div className="cal-side">
            <div className="panel">
              <div className="panel-title">Weeks in {monthLabel(selected)}</div>
              {weeks.length === 0 && (
                <div className="panel-sub" style={{ marginTop: 8 }}>
                  No weeks yet.
                </div>
              )}
              <div className="cal-weeks">
                {weeks.map((w, i) => {
                  const ended = w.ended;
                  const disabled = w.locked;
                  const problem = problems.find(
                    (p) => p.key === selected && p.weekNumber === w.weekNumber,
                  );
                  return (
                    <div
                      key={w.weekNumber}
                      className={`cal-week cal-w${(i % 6) + 1}-card ${activeIdx === i ? "active" : ""} ${problem ? "cal-week-bad" : ""}`}
                      onClick={() => setActiveIdx(i)}
                    >
                      <div className="cal-week-head">
                        <span className="cal-week-name">
                          Week {w.weekNumber}
                        </span>
                        <span className="cal-week-len">
                          {w.endDate >= w.startDate
                            ? `${weekLength(w)} days`
                            : "—"}
                        </span>
                        {w.locked ? (
                          <span className="cal-tag cal-tag-locked">
                            <Lock size={10} /> Locked
                          </span>
                        ) : ended ? (
                          <span className="cal-tag">Ended, not synced</span>
                        ) : (
                          <span className="cal-tag cal-tag-open">Open</span>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Discard Week ${w.weekNumber}`}
                          title={`Discard Week ${w.weekNumber}`}
                          disabled={!canRemoveWeek(draft, selected, i)}
                          onClick={(event) => {
                            event.stopPropagation();
                            discardWeek(i);
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="cal-week-dates">
                        {i === 0 && !firstStartLocked ? (
                          <label className="cal-field">
                            <span>Starts</span>
                            <input
                              type="date"
                              value={w.startDate}
                              onChange={(e) => changeFirstStart(e.target.value)}
                            />
                          </label>
                        ) : (
                          <div className="cal-field">
                            <span>Starts</span>
                            <strong>{shortDate(w.startDate)}</strong>
                          </div>
                        )}
                        <label className="cal-field">
                          <span>Ends</span>
                          <input
                            type="date"
                            value={w.endDate}
                            disabled={disabled}
                            onChange={(e) => changeEndDate(i, e.target.value)}
                          />
                        </label>
                        <div className="cal-nudge">
                          <button
                            className="icon-btn"
                            aria-label="End one day earlier"
                            disabled={disabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveEndBy(i, -1);
                            }}
                          >
                            <Minus size={12} />
                          </button>
                          <button
                            className="icon-btn"
                            aria-label="End one day later"
                            disabled={disabled}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveEndBy(i, 1);
                            }}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                      {problem && (
                        <div className="cal-week-problem">
                          {problem.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {prevEnd && weeks.length > 0 && (
                <div className="panel-sub" style={{ marginTop: 8 }}>
                  Week 1 starts the day after {fromPrevMonthLabel} ends (
                  {shortDate(prevEnd)}).
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panel-title">Quick tools</div>
              <div className="cal-tools">
                <button className="soft-button" onClick={autoFill}>
                  <Wand2 size={13} />
                  Auto-fill this month (Mon–Sun)
                </button>
                {canFillFromPrev && (
                  <button className="soft-button" onClick={copyFromPrevious}>
                    <Copy size={13} />
                    Copy {fromPrevMonthLabel}'s week lengths
                  </button>
                )}
                <div className="cal-fill">
                  <button className="soft-button" onClick={fillNext}>
                    <ChevronsRight size={13} />
                    Auto-fill the next
                  </button>
                  <select
                    className="form-select"
                    value={fillCount}
                    onChange={(e) => setFillCount(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="panel-sub">months</span>
                </div>
                {isSet && !weeks.some((w) => w.locked) && (
                  <button
                    className="soft-button cal-danger"
                    onClick={() => update(clearMonth(draft, selected))}
                  >
                    <Trash2 size={13} />
                    Clear this month
                  </button>
                )}
              </div>
            </div>

            {problems.length > 0 && (
              <div className="cal-problems">
                <AlertTriangle size={14} />
                <ul>
                  {problems.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
