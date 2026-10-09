import { useMemo, useState } from "react";
import {
  ChevronRight,
  Plus,
  Pencil,
  AlertTriangle,
  CalendarRange,
  ShieldAlert,
} from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import {
  getMonthKey,
  getAllFineMonthKeys,
  summarizeFinesMonth,
  getWeekDateLabel,
} from "../utils/finesCalc";
import KPICard from "./KPICard";
import FineFormModal from "./FineFormModal";

function FineRow({ entry, categories, currency, usdPerPkr, onEdit }) {
  const label =
    entry.typeLabel ??
    categories.find((category) => category.key === entry.type)?.label ??
    entry.type;
  return (
    <div className="list-card list-card-compact expense-row">
      <div>
        <div className="entry-row-main" style={{ marginBottom: 2 }}>
          <span className="pill entry-category-pill">{label}</span>
          <span className="list-card-title">{entry.reason}</span>
        </div>
        <div className="panel-sub">{getWeekDateLabel(entry.date)}</div>
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
          aria-label={`Edit fine from ${entry.date}`}
        >
          <Pencil size={13} />
        </button>
      </div>
    </div>
  );
}

function DispatcherFineGroup({ group, categories, currency, usdPerPkr, onEdit }) {
  return (
    <div className="week-block">
      <div className="week-block-head">
        <span className="week-block-title">{group.dispatcherName}</span>
        <span className="week-block-total">
          {fmtMoney(group.total, currency, usdPerPkr)}
        </span>
      </div>
      <div className="entry-list">
        {group.entries.map((entry) => (
          <FineRow
            key={entry.id}
            entry={entry}
            categories={categories}
            currency={currency}
            usdPerPkr={usdPerPkr}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

function MonthFinesCard({
  summary,
  currency,
  usdPerPkr,
  isCurrent,
  expanded,
  onToggleExpand,
  onEdit,
  onAdd,
  categories,
}) {
  const isOpen = isCurrent || expanded;

  return (
    <div className="panel month-card">
      <div
        className={`section-head month-card-head ${isCurrent ? "" : "month-card-head-clickable"}`}
        onClick={isCurrent ? undefined : onToggleExpand}
      >
        <div className="month-card-head-left">
          {!isCurrent && (
            <span
              className={`chevron-btn ${expanded ? "chevron-btn-open" : ""}`}
            >
              <ChevronRight size={16} />
            </span>
          )}
          <div>
            <div className="panel-title">
              {isCurrent ? `This month · ${summary.label}` : summary.label}
            </div>
            <div className="panel-sub">
              {summary.groups.length === 0
                ? "No fines recorded"
                : `${summary.groups.length} employee${summary.groups.length === 1 ? "" : "s"} · ${summary.entries.length} entr${summary.entries.length === 1 ? "y" : "ies"}`}
            </div>
          </div>
        </div>
        <div className="month-card-head-right">
          <span className="pill pill-route month-card-total">
            {fmtMoney(summary.total, currency, usdPerPkr)}
          </span>
          {isCurrent && (
            <button
              type="button"
              className="primary-btn"
              disabled={!categories.some((category) => category.active)}
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
            >
              <Plus size={14} />
              Add fine
            </button>
          )}
        </div>
      </div>

      <div className={`month-detail-wrap ${isOpen ? "expanded" : "collapsed"}`}>
        <div className="month-detail-inner">
          {summary.groups.length === 0 ? (
            <div className="empty-row">No fines for this month.</div>
          ) : (
            <div className="week-grid">
              {summary.groups.map((group) => (
                <DispatcherFineGroup
                  key={group.dispatcherId}
                  group={group}
                  categories={categories}
                  currency={currency}
                  usdPerPkr={usdPerPkr}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FinesTab({
  dispatchers,
  entries,
  categories,
  calendarVersion,
  currency,
  usdPerPkr,
  onAddFine,
  onUpdateFine,
  onDeleteFine,
}) {
  const [dispatcherFilter, setDispatcherFilter] = useState("all");
  const [expandedMonths, setExpandedMonths] = useState(() => new Set());
  const [formState, setFormState] = useState(null);
  // formState shape: { mode: "add" | "edit", entry?, defaultDispatcherId? }

  const currentMonthKey = useMemo(
    () => getMonthKey(new Date()),
    [calendarVersion],
  );

  const filteredEntries = useMemo(
    () =>
      dispatcherFilter === "all"
        ? entries
        : entries.filter(
            (entry) => String(entry.dispatcherId) === dispatcherFilter,
          ),
    [entries, dispatcherFilter],
  );

  const currentSummary = useMemo(
    () => summarizeFinesMonth(currentMonthKey, filteredEntries, dispatchers),
    [currentMonthKey, filteredEntries, dispatchers],
  );

  const historySummaries = useMemo(() => {
    const keys = getAllFineMonthKeys(filteredEntries).filter(
      (key) => key !== currentMonthKey,
    );
    return keys.map((key) =>
      summarizeFinesMonth(key, filteredEntries, dispatchers),
    );
  }, [filteredEntries, dispatchers, currentMonthKey]);

  const yearTotal = useMemo(() => {
    const year = currentMonthKey.slice(0, 4);
    return [currentSummary, ...historySummaries]
      .filter((summary) => summary.monthKey.startsWith(year))
      .reduce((sum, summary) => sum + summary.total, 0);
  }, [currentSummary, historySummaries, currentMonthKey]);

  function toggleMonth(monthKey) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  function openAddForm() {
    setFormState({
      mode: "add",
      defaultDispatcherId:
        dispatcherFilter !== "all" ? dispatcherFilter : undefined,
    });
  }

  function openEditForm(entry) {
    setFormState({ mode: "edit", entry });
  }

  function closeForm() {
    setFormState(null);
  }

  async function handleSubmit(payload) {
    if (formState.mode === "edit") {
      await onUpdateFine(formState.entry.id, payload);
    } else {
      await onAddFine(payload);
    }
    closeForm();
  }

  async function handleDelete(id) {
    await onDeleteFine(id);
    closeForm();
  }

  return (
    <div className="content-stack">
      <div className="stats-grid">
        <KPICard
          label={`Total · ${currentSummary.label}`}
          value={fmtMoney(currentSummary.total, currency, usdPerPkr)}
          sub="This month, all employees"
          icon={AlertTriangle}
        />
        <KPICard
          label="Entries this month"
          value={String(currentSummary.entries.length)}
          sub={
            currentSummary.groups.length === 0
              ? "No fines yet"
              : `Across ${currentSummary.groups.length} dispatcher${currentSummary.groups.length === 1 ? "" : "s"}`
          }
          icon={ShieldAlert}
        />
        <KPICard
          label={`Total · ${currentMonthKey.slice(0, 4)}`}
          value={fmtMoney(yearTotal, currency, usdPerPkr)}
          sub="Year to date, all months"
          icon={CalendarRange}
        />
      </div>

      {categories.every((category) => !category.active) && (
        <div className="empty-row">
          Add an active deduction category under Properties before recording
          deductions.
        </div>
      )}

      <div className="panel panel-compact">
        <div className="section-head">
          <div>
            <div className="panel-title">Filter by employee</div>
            <div className="panel-sub">
              Narrow the history below to one employee, or leave on All to see
              everyone.
            </div>
          </div>
          <select
            className="form-select"
            style={{ maxWidth: 220 }}
            value={dispatcherFilter}
            onChange={(event) => setDispatcherFilter(event.target.value)}
          >
            <option value="all">All employees</option>
            {dispatchers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MonthFinesCard
        summary={currentSummary}
        categories={categories}
        currency={currency}
        usdPerPkr={usdPerPkr}
        isCurrent
        onEdit={openEditForm}
        onAdd={openAddForm}
      />

      <div className="panel">
        <div className="section-head">
          <div>
            <div className="panel-title">History</div>
            <div className="panel-sub">
              Expand a month to see which employee was fined, the deduction
              category, reason, and date.
            </div>
          </div>
        </div>

        {historySummaries.length === 0 ? (
          <div className="empty-row">No previous months yet.</div>
        ) : (
          <div className="stack-list">
            {historySummaries.map((summary) => (
              <MonthFinesCard
                key={summary.monthKey}
                summary={summary}
                categories={categories}
                currency={currency}
                usdPerPkr={usdPerPkr}
                isCurrent={false}
                expanded={expandedMonths.has(summary.monthKey)}
                onToggleExpand={() => toggleMonth(summary.monthKey)}
                onEdit={openEditForm}
                onAdd={openAddForm}
              />
            ))}
          </div>
        )}
      </div>

      {formState && (
        <FineFormModal
          mode={formState.mode}
          entry={formState.entry}
          categories={categories}
          dispatchers={dispatchers}
          defaultDispatcherId={formState.defaultDispatcherId}
          onClose={closeForm}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
