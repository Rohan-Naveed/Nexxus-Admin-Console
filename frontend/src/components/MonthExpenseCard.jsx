import { useEffect, useRef } from "react";
import { ChevronRight, Plus, Pencil } from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import { EXPENSE_CATEGORIES, MONTHLY_BILL_KEYS } from "../data/expenses";

function fmtEntryDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function EntryRow({ entry, currency, usdPerPkr, onEdit }) {
  return (
    <div className="entry-row">
      <div className="entry-row-main">
        <span className="entry-row-date">{fmtEntryDate(entry.date)}</span>
        <span className="entry-row-amount">
          {fmtMoney(entry.amount, currency, usdPerPkr)}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onEdit(entry)}
          aria-label={`Edit entry from ${entry.date}`}
        >
          <Pencil size={13} />
        </button>
      </div>
      {entry.note && <div className="entry-row-note">{entry.note}</div>}
    </div>
  );
}

function WeekBlock({ week, currency, usdPerPkr, onEdit }) {
  return (
    <div className="week-block">
      <div className="week-block-head">
        <span className="week-block-title">Week {week.weekNumber}</span>
        <span className="week-block-total">
          {fmtMoney(week.total, currency, usdPerPkr)}
        </span>
      </div>
      {week.entries.length === 0 ? (
        <div className="empty-row">No entries yet</div>
      ) : (
        <div className="entry-list">
          {week.entries.map((entry) => (
            <div className="entry-row-wrap" key={entry.id}>
              <span
                className={`pill entry-category-pill ${
                  entry.category === "miscellaneous" ? "pill-route" : ""
                }`}
              >
                {EXPENSE_CATEGORIES[entry.category].label}
              </span>
              <EntryRow
                entry={entry}
                currency={currency}
                usdPerPkr={usdPerPkr}
                onEdit={onEdit}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BillsBlock({ summary, currency, usdPerPkr, onEdit, onAdd }) {
  const entriesByCategory = MONTHLY_BILL_KEYS.map((key) => ({
    key,
    entries: summary.billEntries.filter((entry) => entry.category === key),
  }));

  return (
    <div className="bills-block">
      <div className="week-block-title" style={{ marginBottom: 8 }}>
        Monthly expenses
      </div>
      <div className="stack-list">
        {entriesByCategory.map(({ key, entries }) => (
          <div className="list-card list-card-compact bills-row" key={key}>
            <span className="list-card-title">
              {EXPENSE_CATEGORIES[key].label}
            </span>
            {entries.length === 0 ? (
              <button
                type="button"
                className="text-link"
                onClick={() => onAdd(key, summary.monthKey)}
              >
                <Plus size={13} /> Add
              </button>
            ) : (
              <div className="bills-row-entries">
                {entries.map((entry) => (
                  <span className="bills-row-entry" key={entry.id}>
                    {fmtMoney(entry.amount, currency, usdPerPkr)}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onEdit(entry)}
                      aria-label={`Edit ${key} bill`}
                    >
                      <Pencil size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthDetail({ summary, currency, usdPerPkr, onEdit, onAdd }) {
  return (
    <div className="month-detail">
      <div className="week-grid">
        {summary.weeks.map((week) => (
          <WeekBlock
            key={week.weekNumber}
            week={week}
            currency={currency}
            usdPerPkr={usdPerPkr}
            onEdit={onEdit}
          />
        ))}
      </div>
      <BillsBlock
        summary={summary}
        currency={currency}
        usdPerPkr={usdPerPkr}
        onEdit={onEdit}
        onAdd={onAdd}
      />
    </div>
  );
}

export default function MonthExpenseCard({
  summary,
  currency,
  usdPerPkr,
  isCurrent,
  expanded,
  onToggleExpand,
  onEdit,
  onAdd,
}) {
  const headRef = useRef(null);
  const wasExpanded = useRef(expanded);
  const isOpen = isCurrent || expanded;

  // When a history month opens, scroll its header to the top of the
  // viewport so the newly-revealed detail appears below it — instead of
  // the page staying put and only the tail end of the detail being visible.
  useEffect(() => {
    if (!isCurrent && expanded && !wasExpanded.current) {
      const raf = requestAnimationFrame(() => {
        headRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return () => cancelAnimationFrame(raf);
    }
    wasExpanded.current = expanded;
  }, [expanded, isCurrent]);

  return (
    <div className="panel month-card">
      <div
        ref={headRef}
        className={`section-head month-card-head ${isCurrent ? "" : "month-card-head-clickable"}`}
        onClick={isCurrent ? undefined : onToggleExpand}
      >
        <div className="month-card-head-left">
          {!isCurrent && (
            <span className={`chevron-btn ${expanded ? "chevron-btn-open" : ""}`}>
              <ChevronRight size={16} />
            </span>
          )}
          <div>
            <div className="panel-title">
              {isCurrent ? `This month · ${summary.label}` : summary.label}
            </div>
            <div className="panel-sub">
              Misc {fmtMoney(summary.totals.miscellaneous, currency, usdPerPkr)} ·
              Dinner {fmtMoney(summary.totals.dinner, currency, usdPerPkr)} · Bills{" "}
              {fmtMoney(
                summary.billsTotal - summary.totals.dinner,
                currency,
                usdPerPkr,
              )}
            </div>
          </div>
        </div>
        <div className="month-card-head-right">
          {!isCurrent && summary.missingMonthly.length > 0 && (
            <span className="pill pill-muted">
              Missing:{" "}
              {summary.missingMonthly
                .map((key) => EXPENSE_CATEGORIES[key].label.replace(" Bill", "").replace("Monthly ", ""))
                .join(", ")}
            </span>
          )}
          <span className="pill pill-route month-card-total">
            {fmtMoney(summary.total, currency, usdPerPkr)}
          </span>
          {isCurrent && (
            <button
              type="button"
              className="primary-btn"
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
            >
              <Plus size={14} />
              Add expense
            </button>
          )}
        </div>
      </div>

      <div className={`month-detail-wrap ${isOpen ? "expanded" : "collapsed"}`}>
        <div className="month-detail-inner">
          <MonthDetail
            summary={summary}
            currency={currency}
            usdPerPkr={usdPerPkr}
            onEdit={onEdit}
            onAdd={onAdd}
          />
        </div>
      </div>
    </div>
  );
}
