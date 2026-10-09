import { useEffect, useRef } from "react";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { fmtMoney } from "../utils/formatters";

export default function MonthExpenseCard({
  summary,
  categories,
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
  const labelByKey = new Map(categories.map((category) => [category.key, category.label]));

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
              {summary.entries.length} categor
              {summary.entries.length === 1 ? "y total" : "y totals"}
            </div>
          </div>
        </div>
        <div className="month-card-head-right">
          <span className="pill pill-route month-card-total">
            {fmtMoney(summary.total, currency, usdPerPkr)}
          </span>
          {(isCurrent || isOpen) && (
            <button
              type="button"
              className="primary-btn"
              disabled={!categories.some((category) => category.active)}
              onClick={(event) => {
                event.stopPropagation();
                onAdd(undefined, summary.monthKey);
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
          {summary.entries.length === 0 ? (
            <div className="empty-row">No expenses recorded for this month.</div>
          ) : (
            <div className="stack-list">
              {summary.entries.map((entry) => (
                <div className="list-card list-card-compact" key={entry.id}>
                  <div>
                    <div className="list-card-title">
                      {entry.categoryLabel || labelByKey.get(entry.category) || entry.category}
                    </div>
                    {entry.note && <div className="entry-row-note">{entry.note}</div>}
                  </div>
                  <div className="entry-row-main">
                    <span className="entry-row-amount">
                      {fmtMoney(entry.amount, currency, usdPerPkr)}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onEdit(entry)}
                      aria-label={`Edit ${entry.categoryLabel || entry.category} expense`}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
