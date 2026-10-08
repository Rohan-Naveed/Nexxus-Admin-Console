import { useMemo, useState } from "react";
import { Wallet, UtensilsCrossed, Receipt, CalendarRange } from "lucide-react";
import { fmtMoney } from "../utils/formatters";
import {
  getMonthKey,
  getAllMonthKeys,
  summarizeMonth,
} from "../utils/expenseCalc";
import KPICard from "./KPICard";
import MonthExpenseCard from "./MonthExpenseCard";
import ExpenseFormModal from "./ExpenseFormModal";

export default function ExpensesTab({
  entries,
  calendarVersion,
  currency,
  usdPerPkr,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
}) {
  const [expandedMonths, setExpandedMonths] = useState(() => new Set());
  const [formState, setFormState] = useState(null);
  // formState shape: { mode: "add" | "edit", entry?, defaultCategory?, defaultMonth? }

  const currentMonthKey = useMemo(
    () => getMonthKey(new Date()),
    [calendarVersion],
  );

  const currentSummary = useMemo(
    () => summarizeMonth(currentMonthKey, entries),
    [currentMonthKey, entries],
  );

  const historySummaries = useMemo(() => {
    const keys = getAllMonthKeys(entries).filter(
      (key) => key !== currentMonthKey,
    );
    return keys.map((key) => summarizeMonth(key, entries));
  }, [entries, currentMonthKey]);

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

  function openAddForm(defaultCategory, defaultMonth) {
    setFormState({ mode: "add", defaultCategory, defaultMonth });
  }

  function openEditForm(entry) {
    setFormState({ mode: "edit", entry });
  }

  function closeForm() {
    setFormState(null);
  }

  async function handleSubmit(payload) {
    if (formState.mode === "edit") {
      await onUpdateExpense(formState.entry.id, payload);
    } else {
      await onAddExpense(payload);
    }
    closeForm();
  }

  async function handleDelete(id) {
    await onDeleteExpense(id);
    closeForm();
  }

  return (
    <div className="content-stack">
      <div className="stats-grid">
        <KPICard
          label={`Total · ${currentSummary.label}`}
          value={fmtMoney(currentSummary.total, currency, usdPerPkr)}
          sub="This month, all categories"
          icon={Wallet}
        />
        <KPICard
          label="Miscellaneous"
          value={fmtMoney(currentSummary.weeklyTotal, currency, usdPerPkr)}
          sub="This month so far"
          icon={UtensilsCrossed}
        />
        <KPICard
          label="Monthly expenses"
          value={fmtMoney(currentSummary.billsTotal, currency, usdPerPkr)}
          sub={
            currentSummary.missingMonthly.length === 0
              ? "Dinner, electricity, gas, water"
              : `${currentSummary.missingMonthly.length} of 4 not entered yet`
          }
          icon={Receipt}
        />
        <KPICard
          label={`Total · ${currentMonthKey.slice(0, 4)}`}
          value={fmtMoney(yearTotal, currency, usdPerPkr)}
          sub="Year to date, all months"
          icon={CalendarRange}
        />
      </div>

      <MonthExpenseCard
        summary={currentSummary}
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
              Previous months are closed out automatically once a new month
              starts. Expand a month to see its miscellaneous entries, monthly
              dinner and monthly bills.
            </div>
          </div>
        </div>

        {historySummaries.length === 0 ? (
          <div className="empty-row">No previous months yet.</div>
        ) : (
          <div className="stack-list">
            {historySummaries.map((summary) => (
              <MonthExpenseCard
                key={summary.monthKey}
                summary={summary}
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
        <ExpenseFormModal
          mode={formState.mode}
          entry={formState.entry}
          defaultCategory={formState.defaultCategory}
          defaultMonth={formState.defaultMonth}
          entries={entries}
          onClose={closeForm}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
