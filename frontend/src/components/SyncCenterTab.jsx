import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// The one place for everything sync-related: scheduler health, a
// dispatcher x week grid, manual sync controls, and the full history.
//
// Weeks are Monday-Sunday and belong to the month their Sunday falls in
// (so a month has 4 or 5 of them). The UI only ever shows "Week 1..N" —
// the server owns the calendar and tells us which weeks exist and which
// have ended.

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

const STATE_LABELS = {
  synced: "Synced",
  pending: "Pending",
  failed: "Failed",
  no_data: "No data",
  not_ended: "Not ended",
  not_active: "—",
};

const STATUS_LABELS = {
  success: "Success",
  failed: "Failed",
  no_data: "No data",
};

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtShortDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

// Gross comes straight from the sheet, which is in dollars.
function fmtSheetAmount(value) {
  if (value === null || value === undefined) return "—";
  return (
    "$" +
    Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function monthOptions(count = 12) {
  const now = new Date();
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return list;
}

const monthKey = (m) => `${m.year}-${m.month}`;
const monthLabel = (m) => `${MONTH_NAMES[m.month - 1]} ${m.year}`;

function trackingFeeForGross(gross, grossPercentage, trackingPercentage) {
  const grossRate = Number(grossPercentage);
  if (grossRate <= 0) return 0;
  return (
    (Number(gross) / (grossRate / 100)) * (Number(trackingPercentage) / 100)
  );
}

function getReratePreview(status, payload, trackingProperties) {
  if (!status || !trackingProperties) {
    return { count: 0, oldTotal: 0, newTotal: 0, delta: 0 };
  }

  const dispatcherIds =
    payload.dispatcherIds === "all"
      ? null
      : new Set(payload.dispatcherIds.map(Number));
  const weekNumbers = new Set(
    payload.weeks === "all"
      ? status.weeks.filter((week) => week.ended).map((week) => week.weekNumber)
      : payload.weeks.map(Number),
  );
  let count = 0;
  let oldTotal = 0;
  let newTotal = 0;

  status.dispatchers.forEach((dispatcher) => {
    if (dispatcherIds && !dispatcherIds.has(dispatcher.dispatcherId)) return;
    dispatcher.weeks.forEach((week) => {
      if (!weekNumbers.has(week.weekNumber) || !week.canSync) return;
      if (dispatcherIds === null && week.state === "not_active") return;
      if (week.grossAmount == null) return;

      const oldFee =
        week.trackingFeeAmount == null
          ? trackingFeeForGross(
              week.grossAmount,
              week.grossPercentage,
              week.trackingPercentage,
            )
          : Number(week.trackingFeeAmount);
      count += 1;
      oldTotal += oldFee;
      newTotal += trackingFeeForGross(
        week.grossAmount,
        trackingProperties.grossPercentage,
        trackingProperties.trackingPercentage,
      );
    });
  });

  return { count, oldTotal, newTotal, delta: newTotal - oldTotal };
}

function TriggerBadge({ trigger }) {
  if (!trigger) return null;
  return (
    <span
      className={`sync-badge ${trigger === "scheduler" ? "sync-badge-auto" : "sync-badge-manual"}`}
    >
      {trigger === "scheduler" ? "Scheduler" : "Manual"}
    </span>
  );
}

function GridCell({ cell }) {
  const tip = cell.lastMessage || undefined;
  if (cell.state === "not_active") {
    return (
      <span className="sync-cell-empty" title="Not on the roster this week">
        —
      </span>
    );
  }
  return (
    <div className={`sync-cell sync-cell-${cell.state}`} title={tip}>
      <span className="sync-cell-state">{STATE_LABELS[cell.state]}</span>
      {cell.state === "synced" && (
        <>
          <span className="sync-cell-amount">
            {fmtSheetAmount(cell.grossAmount)}
          </span>
          <span className="sync-cell-meta">
            {fmtDateTime(cell.syncedAt || cell.lastAttemptAt)}
            <TriggerBadge trigger={cell.lastTrigger} />
          </span>
        </>
      )}
      {(cell.state === "failed" || cell.state === "no_data") && (
        <span className="sync-cell-meta">
          {fmtDateTime(cell.lastAttemptAt)}
          <TriggerBadge trigger={cell.lastTrigger} />
        </span>
      )}
    </div>
  );
}

export default function SyncCenterTab({
  syncService,
  calendarVersion,
  onSynced,
  onDispatcherLinkClick,
  onOpenCalendar,
  trackingProperties,
}) {
  const months = useMemo(() => monthOptions(12), []);
  const [selected, setSelected] = useState(months[0]);
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [run, setRun] = useState(null); // live progress of the current manual run
  const [runError, setRunError] = useState(null);
  const [openMenu, setOpenMenu] = useState(null); // dispatcherId whose Sync menu is open
  const [menuPosition, setMenuPosition] = useState(null);
  const [bulkWeek, setBulkWeek] = useState("all");
  const [applyCurrentTrackingRates, setApplyCurrentTrackingRates] =
    useState(false);

  const [history, setHistory] = useState({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 15,
  });
  const [historyPage, setHistoryPage] = useState(1);
  const [filters, setFilters] = useState({
    dispatcherId: "",
    scope: "selected", // "selected" month | "all"
    source: "",
    status: "",
  });
  const [historyError, setHistoryError] = useState(null);

  const pollTimer = useRef(null);
  const syncButtonRefs = useRef(new Map());
  const runActive = run?.status === "running" || run?.starting;

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const [s, sum] = await Promise.all([
        syncService.getStatus(selected.year, selected.month),
        syncService.getSummary(),
      ]);
      setStatus(s);
      setSummary(sum);
    } catch (err) {
      setStatusError(err.message);
    } finally {
      setLoadingStatus(false);
    }
  }, [syncService, selected, calendarVersion]);

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const data = await syncService.getHistory({
        dispatcherId: filters.dispatcherId,
        year: filters.scope === "selected" ? selected.year : "",
        month: filters.scope === "selected" ? selected.month : "",
        source: filters.source,
        status: filters.status,
        page: historyPage,
        pageSize: 15,
      });
      setHistory(data);
    } catch (err) {
      setHistoryError(err.message);
    }
  }, [syncService, filters, selected, historyPage]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Close the row menu on any outside click.
  useEffect(() => {
    if (openMenu === null) return undefined;
    const close = (event) => {
      if (
        event.type === "scroll" &&
        event.target instanceof Element &&
        event.target.closest(".sync-menu-list-portal")
      ) {
        return;
      }
      setOpenMenu(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMenu]);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  function toggleSyncMenu(dispatcherId, optionCount) {
    if (openMenu === dispatcherId) {
      setOpenMenu(null);
      return;
    }

    const button = syncButtonRefs.current.get(dispatcherId);
    const rect = button?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 190;
    const menuHeight = Math.min(
      (optionCount + 1) * 34 + 10,
      window.innerHeight - 24,
    );
    const left = Math.max(
      12,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12),
    );
    const top =
      rect.bottom + menuHeight + 8 <= window.innerHeight - 12
        ? rect.bottom + 4
        : Math.max(12, rect.top - menuHeight - 4);

    setMenuPosition({ left, top });
    setOpenMenu(dispatcherId);
  }

  function pollRun(runId) {
    async function tick() {
      try {
        const progress = await syncService.getRun(runId);
        setRun(progress);
        if (progress.status === "running") {
          pollTimer.current = setTimeout(tick, 1500);
        } else {
          loadStatus();
          loadHistory();
          onSynced?.(); // let the console reload payroll figures
        }
      } catch (err) {
        setRunError(err.message);
        setRun(null);
      }
    }
    tick();
  }

  async function startRun(payload) {
    if (runActive) return;
    const reRate = applyCurrentTrackingRates;
    if (reRate) {
      const preview = getReratePreview(status, payload, trackingProperties);
      if (preview.count > 0) {
        const delta = `${preview.delta >= 0 ? "+" : "-"}${fmtSheetAmount(Math.abs(preview.delta))}`;
        const confirmed = window.confirm(
          `Apply current rates (${trackingProperties.grossPercentage}% gross, ${trackingProperties.trackingPercentage}% tracking) to ${preview.count} already-synced dispatcher-week entries?\n\nTracking income: ${fmtSheetAmount(preview.oldTotal)} → ${fmtSheetAmount(preview.newTotal)} (${delta}).\n\nPreview uses saved gross. If gross in Google Sheets has changed, the final totals may differ. Continue?`,
        );
        if (!confirmed) return;
      }
    }
    setRunError(null);
    setOpenMenu(null);
    setRun({ starting: true, total: 0, done: 0, counts: {} });
    try {
      const started = await syncService.startRun({
        ...payload,
        year: selected.year,
        month: selected.month,
        reRate,
      });
      setApplyCurrentTrackingRates(false);
      setRun({
        status: "running",
        runId: started.runId,
        total: started.total,
        done: 0,
        counts: {},
        items: [],
        notRun: started.notRun,
        reRate,
      });
      pollRun(started.runId);
    } catch (err) {
      setRun(null);
      setRunError(err.message);
    }
  }

  const weeks = status?.weeks ?? [];
  const weeksSet = status ? status.weeksSet !== false : true;
  const endedWeeks = weeks.filter((w) => w.ended);
  const dispatchers = status?.dispatchers ?? [];
  const unlinked = dispatchers.filter((d) => d.active && !d.sheetLinked);
  const idx = months.findIndex((m) => monthKey(m) === monthKey(selected));

  const historyPages = Math.max(1, Math.ceil(history.total / history.pageSize));

  return (
    <div className="content-stack">
      {/* ---- summary strip ---- */}
      <div className="stats-grid sync-summary">
        <div className="panel">
          <div className="panel-title">Last scheduler sync</div>
          <div className="sync-summary-value">
            {fmtDateTime(summary?.lastSchedulerSyncAt)}
          </div>
          <div className="panel-sub">
            {summary?.lastSchedulerCheckAt
              ? `Last checked ${fmtDateTime(summary.lastSchedulerCheckAt)}`
              : "Only weeks that needed syncing are logged"}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">Next scheduled run</div>
          <div className="sync-summary-value">
            {summary?.schedulerEnabled
              ? fmtDateTime(summary.nextScheduledRunAt)
              : "Disabled"}
          </div>
          <div className="panel-sub">
            {summary
              ? `Mondays at ${summary.schedulerTime} (${summary.timezone})`
              : ""}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">Needs attention</div>
          <div
            className={`sync-summary-value ${summary?.failedCount ? "sync-danger" : ""}`}
          >
            {summary ? summary.failedCount : "—"}
          </div>
          <div className="panel-sub">Weeks whose latest sync failed</div>
        </div>
        <div className="panel">
          <div className="panel-title">Sheet not linked</div>
          <div
            className={`sync-summary-value ${unlinked.length ? "sync-danger" : ""}`}
          >
            {status ? unlinked.length : "—"}
          </div>
          <div className="panel-sub">Active dispatchers that can't sync</div>
        </div>
      </div>

      {unlinked.length > 0 && (
        <div className="sync-warning">
          <AlertTriangle size={15} />
          <span>
            No Google Sheet linked for{" "}
            <strong>{unlinked.map((d) => d.name).join(", ")}</strong>. Add the
            sheet ID and tab in the dispatcher's edit form (Dispatchers tab).{" "}
            {onDispatcherLinkClick && (
              <button className="text-link" onClick={onDispatcherLinkClick}>
                Go to Dispatchers
              </button>
            )}
          </span>
        </div>
      )}

      {/* ---- grid ---- */}
      <div className="panel">
        <div className="section-head">
          <div>
            <div className="panel-title">Sync status by week</div>
            <div className="panel-sub">
              Weeks come from the Week Calendar. A week can be synced from the
              day after its end date. Months whose weeks aren't set are never
              synced.
            </div>
          </div>
          <div className="pill-row">
            <button
              className="icon-btn"
              aria-label="Previous month"
              disabled={idx >= months.length - 1}
              onClick={() => {
                setSelected(months[idx + 1]);
                setHistoryPage(1);
              }}
            >
              <ChevronLeft size={15} />
            </button>
            <select
              className="form-select"
              style={{ minWidth: 160 }}
              value={monthKey(selected)}
              onChange={(e) => {
                setSelected(months.find((m) => monthKey(m) === e.target.value));
                setHistoryPage(1);
              }}
            >
              {months.map((m) => (
                <option key={monthKey(m)} value={monthKey(m)}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <button
              className="icon-btn"
              aria-label="Next month"
              disabled={idx <= 0}
              onClick={() => {
                setSelected(months[idx - 1]);
                setHistoryPage(1);
              }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* bulk bar */}
        <div className="sync-bulk">
          <div className="sync-bulk-label">Sync all dispatchers</div>
          <select
            className="form-select"
            style={{ maxWidth: 200 }}
            value={bulkWeek}
            onChange={(e) => setBulkWeek(e.target.value)}
            disabled={runActive || endedWeeks.length === 0 || !weeksSet}
          >
            <option value="all">All eligible weeks</option>
            {endedWeeks.map((w) => (
              <option key={w.weekNumber} value={w.weekNumber}>
                Week {w.weekNumber} only
              </option>
            ))}
          </select>
          <button
            className="primary-btn"
            disabled={
              runActive ||
              endedWeeks.length === 0 ||
              dispatchers.length === 0 ||
              !weeksSet
            }
            title={
              !weeksSet
                ? "Set this month's weeks in the Week Calendar first"
                : endedWeeks.length === 0
                  ? "No weeks have ended yet this month"
                  : undefined
            }
            onClick={() => {
              const label =
                bulkWeek === "all" ? "all eligible weeks" : `Week ${bulkWeek}`;
              if (
                window.confirm(
                  `Sync ${label} of ${monthLabel(selected)} for all dispatchers with a linked sheet?`,
                )
              ) {
                startRun({
                  dispatcherIds: "all",
                  weeks: bulkWeek === "all" ? "all" : [Number(bulkWeek)],
                });
              }
            }}
          >
            <RefreshCw size={13} className={runActive ? "spin" : ""} />
            Sync all dispatchers
          </button>
          <label className="sync-rerate-option">
            <input
              type="checkbox"
              checked={applyCurrentTrackingRates}
              disabled={runActive}
              onChange={(event) =>
                setApplyCurrentTrackingRates(event.target.checked)
              }
            />
            <span>
              <strong>Apply current rates to synced weeks</strong>
              <span className="panel-sub">
                Re-rates history for any manual sync started while selected.
              </span>
            </span>
          </label>
          {weeksSet && endedWeeks.length === 0 && (
            <span className="panel-sub">
              No weeks have ended yet this month.
            </span>
          )}
        </div>

        {/* run progress */}
        {run && (
          <div
            className={`sync-run ${run.status === "done" ? "sync-run-done" : ""}`}
          >
            {run.status === "done" ? (
              <CheckCircle2 size={15} />
            ) : (
              <RefreshCw size={15} className="spin" />
            )}
            <div>
              {run.starting
                ? "Starting sync…"
                : run.status === "done"
                  ? `Sync finished${run.reRate ? " (re-rate requested)" : ""} — ${run.counts.success || 0} synced, ${run.counts.no_data || 0} no data, ${run.counts.failed || 0} failed${run.counts.skipped ? `, ${run.counts.skipped} skipped` : ""}.`
                  : `Syncing… ${run.done} of ${run.total} done`}
              {run.notRun?.length > 0 && (
                <div className="panel-sub">
                  Not run:{" "}
                  {run.notRun
                    .map((n) => `${n.dispatcherName} (${n.reason})`)
                    .join(", ")}
                </div>
              )}
            </div>
            {run.status === "done" && (
              <button className="text-link" onClick={() => setRun(null)}>
                Dismiss
              </button>
            )}
          </div>
        )}
        {runError && <div className="load-error-banner">{runError}</div>}
        {statusError && <div className="load-error-banner">{statusError}</div>}

        {status && !weeksSet && (
          <div className="sync-warning" style={{ marginTop: 12 }}>
            <AlertTriangle size={15} />
            <span>
              <strong>Weeks aren't set for {monthLabel(selected)}.</strong>{" "}
              Nothing is synced for this month (manually or by the scheduler)
              until you set them.{" "}
              {onOpenCalendar && (
                <button
                  className="text-link"
                  onClick={() =>
                    onOpenCalendar(
                      `${selected.year}-${String(selected.month).padStart(2, "0")}`,
                    )
                  }
                >
                  Set weeks
                </button>
              )}
            </span>
          </div>
        )}

        <div className="table-shell" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th className="table-head">Dispatcher</th>
                {weeks.map((w) => (
                  <th className="table-head" key={w.weekNumber}>
                    Week {w.weekNumber}
                    {!w.ended && (
                      <div className="sync-week-hint">
                        from {fmtShortDate(w.eligibleFrom)}
                      </div>
                    )}
                  </th>
                ))}
                <th className="table-head" />
              </tr>
            </thead>
            <tbody>
              {loadingStatus && !status && (
                <tr>
                  <td className="table-cell" colSpan={weeks.length + 2}>
                    Loading…
                  </td>
                </tr>
              )}
              {dispatchers.map((d) => {
                const eligible = d.weeks.filter(
                  (c) => c.canSync && c.state !== "not_active",
                );
                return (
                  <tr key={d.dispatcherId}>
                    <td className="table-cell table-cell-strong">
                      {d.name}
                      {!d.active && (
                        <span
                          className="pill pill-muted"
                          style={{ marginLeft: 6 }}
                        >
                          Left
                        </span>
                      )}
                      {!d.sheetLinked && (
                        <div className="sync-week-hint sync-danger">
                          No sheet linked
                        </div>
                      )}
                    </td>
                    {d.weeks.map((c) => (
                      <td className="table-cell" key={c.weekNumber}>
                        <GridCell cell={c} />
                      </td>
                    ))}
                    <td className="table-cell sync-menu-cell">
                      <div
                        className="sync-menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          ref={(element) => {
                            if (element)
                              syncButtonRefs.current.set(
                                d.dispatcherId,
                                element,
                              );
                            else syncButtonRefs.current.delete(d.dispatcherId);
                          }}
                          className="soft-button"
                          aria-haspopup="menu"
                          aria-expanded={openMenu === d.dispatcherId}
                          disabled={
                            runActive ||
                            !weeksSet ||
                            !d.sheetLinked ||
                            eligible.length === 0
                          }
                          title={
                            !weeksSet
                              ? "Set this month's weeks first"
                              : !d.sheetLinked
                                ? "Link a Google Sheet first"
                                : eligible.length === 0
                                  ? "No ended weeks to sync yet"
                                  : undefined
                          }
                          onClick={() =>
                            toggleSyncMenu(d.dispatcherId, eligible.length)
                          }
                        >
                          <RefreshCw size={13} />
                          Sync
                          <ChevronDown size={13} />
                        </button>
                        {openMenu === d.dispatcherId &&
                          createPortal(
                            <div
                              className="sync-menu-list sync-menu-list-portal"
                              style={menuPosition}
                              role="menu"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {eligible.map((c) => (
                                <button
                                  key={c.weekNumber}
                                  role="menuitem"
                                  onClick={() =>
                                    startRun({
                                      dispatcherIds: [d.dispatcherId],
                                      weeks: [c.weekNumber],
                                    })
                                  }
                                >
                                  Week {c.weekNumber}
                                </button>
                              ))}
                              <button
                                className="sync-menu-all"
                                role="menuitem"
                                onClick={() =>
                                  startRun({
                                    dispatcherIds: [d.dispatcherId],
                                    weeks: "all",
                                  })
                                }
                              >
                                All eligible weeks
                              </button>
                            </div>,
                            document.body,
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {status && dispatchers.length === 0 && (
                <tr>
                  <td className="table-cell" colSpan={weeks.length + 2}>
                    No dispatchers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- history ---- */}
      <div className="panel">
        <div className="section-head">
          <div>
            <div className="panel-title">Sync history</div>
            <div className="panel-sub">
              Every sync attempt, including failed and empty ones.
            </div>
          </div>
          <div className="pill-row" style={{ flexWrap: "wrap" }}>
            <select
              className="form-select"
              value={filters.dispatcherId}
              onChange={(e) => {
                setFilters({ ...filters, dispatcherId: e.target.value });
                setHistoryPage(1);
              }}
            >
              <option value="">All dispatchers</option>
              {dispatchers.map((d) => (
                <option key={d.dispatcherId} value={d.dispatcherId}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className="form-select"
              value={filters.scope}
              onChange={(e) => {
                setFilters({ ...filters, scope: e.target.value });
                setHistoryPage(1);
              }}
            >
              <option value="selected">{monthLabel(selected)}</option>
              <option value="all">All months</option>
            </select>
            <select
              className="form-select"
              value={filters.source}
              onChange={(e) => {
                setFilters({ ...filters, source: e.target.value });
                setHistoryPage(1);
              }}
            >
              <option value="">Scheduler + manual</option>
              <option value="scheduler">Scheduler</option>
              <option value="manual">Manual</option>
            </select>
            <select
              className="form-select"
              value={filters.status}
              onChange={(e) => {
                setFilters({ ...filters, status: e.target.value });
                setHistoryPage(1);
              }}
            >
              <option value="">Any status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="no_data">No data</option>
            </select>
          </div>
        </div>

        {historyError && (
          <div className="load-error-banner">{historyError}</div>
        )}

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                {[
                  "When",
                  "Dispatcher",
                  "Period",
                  "Source",
                  "Status",
                  "Gross",
                  "Details",
                ].map((h) => (
                  <th className="table-head" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.rows.map((row) => (
                <tr key={row.id}>
                  <td className="table-cell">
                    <Clock3
                      size={12}
                      style={{ marginRight: 5, verticalAlign: "-2px" }}
                    />
                    {fmtDateTime(row.syncedAt)}
                  </td>
                  <td className="table-cell table-cell-strong">
                    {row.dispatcherName}
                  </td>
                  <td className="table-cell">
                    {MONTH_NAMES[row.periodMonth - 1].slice(0, 3)}{" "}
                    {row.periodYear} · Week {row.weekNumber}
                  </td>
                  <td className="table-cell">
                    <TriggerBadge trigger={row.triggerType} />
                    {row.reRate && (
                      <span className="sync-rerate-badge">
                        Re-rate requested
                      </span>
                    )}
                    {row.triggerType === "manual" && (
                      <div className="sync-week-hint">{row.triggeredBy}</div>
                    )}
                  </td>
                  <td className="table-cell">
                    <span className={`sync-status sync-status-${row.status}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="table-cell">
                    {fmtSheetAmount(row.grossAmount)}
                  </td>
                  <td className="table-cell sync-details">
                    {row.errorMessage || row.note || "—"}
                  </td>
                </tr>
              ))}
              {history.rows.length === 0 && (
                <tr>
                  <td className="table-cell" colSpan={7}>
                    No sync attempts match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sync-pager">
          <span className="panel-sub">
            {history.total} attempt{history.total === 1 ? "" : "s"}
          </span>
          <div className="pill-row">
            <button
              className="icon-btn"
              aria-label="Previous page"
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage(historyPage - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="panel-sub">
              Page {historyPage} of {historyPages}
            </span>
            <button
              className="icon-btn"
              aria-label="Next page"
              disabled={historyPage >= historyPages}
              onClick={() => setHistoryPage(historyPage + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
