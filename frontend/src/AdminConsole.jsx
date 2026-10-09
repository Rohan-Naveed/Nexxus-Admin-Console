import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Wallet,
  FileText,
  BarChart3,
  Settings,
  RefreshCw,
  CalendarDays,
  Tags,
  Menu,
  Truck,
  ChevronDown,
  AlertTriangle,
  LogOut,
  Activity,
} from "lucide-react";
import ThemeToggle from "./components/ThemeToggle";
import { createDispatcherService } from "./services/dispatcherService";
import { createRateService } from "./services/rateService";
import { createExpenseService } from "./services/expenseService";
import { createSlipService } from "./services/slipService";
import { createFinesService } from "./services/finesService";
import { createSyncService } from "./services/syncService";
import { createPayrollService } from "./services/payrollService";
import { createCalendarService } from "./services/calendarService";
import { setCalendarWeeks, getPeriodMonth } from "./utils/periods";
import { setPayrollData } from "./data/payrollHistory";
import { getDispatcherGrossFigures } from "./utils/payrollHistoryCalc";
import { getEffectiveUsdRate } from "./utils/rates";
import { NAV_ITEMS, PERIODS, TAB_DEFINITIONS } from "./data/dispatchers";
import { getExpensesForPeriod } from "./utils/expenseCalc";
import { getFineTotalsForPeriod } from "./utils/finesCalc";
import {
  getWeeklyTrendBreakdown,
  getMonthlyTrendBreakdown,
  getYearlyTrendBreakdown,
  getDefaultSlipMonthKey,
  getAvailableSlipMonthKeys,
} from "./utils/payrollHistoryCalc";
import { getDefaultReportPeriodKey } from "./utils/reportsCalc";
import RateWarning from "./components/RateWarning";
import OverviewTab from "./components/OverviewTab";
import DispatchersTab from "./components/DispatchersTab";
import PayrollTab from "./components/PayrollTab";
import ExpensesTab from "./components/ExpensesTab";
import FinesTab from "./components/FinesTab";
import SalarySlipsTab from "./components/SalarySlipsTab";
import ReportsTab from "./components/ReportsTab";
import SalaryReportTab from "./components/SalaryReportTab";
import SyncCenterTab from "./components/SyncCenterTab";
import WeekCalendarTab from "./components/WeekCalendarTab";
import NotificationBell from "./components/NotificationBell";
import SettingsTab from "./components/SettingsTab";
import PlaceholderTab from "./components/PlaceholderTab";
import DispatcherDetailModal from "./components/DispatcherDetailModal";
import DispatcherFormModal from "./components/DispatcherFormModal";
import PeriodDateBanner from "./components/PeriodDateBanner";
import TrackingTab from "./components/TrackingTab";
import PropertiesTab from "./components/PropertiesTab";

const iconMap = {
  LayoutDashboard,
  Users,
  Wallet,
  FileText,
  BarChart3,
  Settings,
  AlertTriangle,
  RefreshCw,
  CalendarDays,
  Tags,
  Activity,
};

export default function AdminConsole({ user, onLogout, theme, onToggleTheme }) {
  const [activeTab, setActiveTab] = useState("overview");
  // Which child tab is selected inside the active collapsible navigation group.
  const [groupSubTab, setGroupSubTab] = useState("payroll");
  const [currency, setCurrency] = useState("PKR");
  const [period, setPeriod] = useState("Monthly");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Which sidebar nav group (if any) is expanded to show its children —
  // Collapsed by default; selecting a child keeps its group expanded.
  const [expandedNavGroup, setExpandedNavGroup] = useState(null);
  const [baseDispatchers, setDispatchers] = useState([]);
  const [latestUsdPerPkr, setUsdPerPkr] = useState(null);
  const [taxPercent, setTaxPercent] = useState(null);
  // Full rate lists (one row per month) — gross is stored in USD and
  // converted with each month's own rate, so payroll needs the lists,
  // not just the latest rate.
  const [usdRates, setUsdRates] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [trackingProperties, setTrackingProperties] = useState(null);
  const [payrollVersion, setPayrollVersion] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [openDispatcherId, setOpenDispatcherId] = useState(null);
  const [dispatcherForm, setDispatcherForm] = useState(null); // { mode: "add" } | { mode: "edit", dispatcher }
  const [dispatcherFeedback, setDispatcherFeedback] = useState(null);
  const [expenseEntries, setExpenseEntries] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [fineEntries, setFineEntries] = useState([]);
  const [deductionCategories, setDeductionCategories] = useState([]);
  const [slips, setSlips] = useState([]);
  const [slipHistory, setSlipHistory] = useState([]);
  const [slipMonthKey, setSlipMonthKey] = useState(() =>
    getDefaultSlipMonthKey(),
  );
  const [reportPeriodType, setReportPeriodType] = useState("Monthly");
  const [reportPeriodKey, setReportPeriodKey] = useState(() =>
    getDefaultReportPeriodKey("Monthly"),
  );
  const expenseService = useRef(createExpenseService()).current;
  const finesService = useRef(createFinesService()).current;
  const dispatcherService = useRef(createDispatcherService()).current;
  const rateService = useRef(createRateService()).current;
  const slipService = useRef(createSlipService()).current;
  const syncService = useRef(createSyncService()).current;
  const payrollService = useRef(createPayrollService()).current;
  const calendarService = useRef(createCalendarService()).current;

  // The admin-set weeks power every week/period calculation in the app
  // (see utils/periods.js). Load them once, and again whenever the admin
  // saves changes (bump `calendarReload`). `calendarVersion` bumps after
  // each load so everything that depends on the weeks re-renders and the
  // notification bell refreshes.
  const [calendarReload, setCalendarReload] = useState(0);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [calendarFocusMonth, setCalendarFocusMonth] = useState(null);
  useEffect(() => {
    let cancelled = false;
    calendarService
      .getWeeks()
      .then((rows) => {
        if (cancelled) return;
        setCalendarWeeks(rows);
        setCalendarVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [calendarService, calendarReload]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoadError(null);
      try {
        const [
          nextDispatchers,
          rate,
          latestTaxRate,
          allExpenses,
          allExpenseCategories,
          allFines,
          allDeductionCategories,
          allSlips,
          allSlipHistory,
          payrollWeeks,
          allUsdRates,
          allTaxRates,
          nextTrackingProperties,
        ] = await Promise.all([
          dispatcherService.fetchDispatchers(),
          rateService.fetchUsdPerPkr(),
          rateService.fetchTaxPercent(),
          expenseService.fetchAllExpenses(),
          expenseService.fetchAllCategories(),
          finesService.fetchAllFines(),
          finesService.fetchAllCategories(),
          slipService.fetchAllSlips(),
          slipService.fetchSlipHistory(),
          payrollService.fetchAllWeeks(),
          rateService.fetchUsdRates(),
          rateService.fetchTaxRates(),
          rateService.fetchTrackingProperties(),
        ]);

        if (cancelled) return;
        // Fill the payroll store BEFORE the state updates below, so the
        // first render that has dispatchers already has their gross.
        setPayrollData({ weeks: payrollWeeks, usdRates: allUsdRates });
        setUsdRates(allUsdRates);
        setTaxRates(allTaxRates);
        setTrackingProperties(nextTrackingProperties);
        setPayrollVersion((v) => v + 1);
        setDispatchers(nextDispatchers);
        setUsdPerPkr(rate);
        setTaxPercent(latestTaxRate);
        setExpenseEntries(allExpenses);
        setExpenseCategories(allExpenseCategories);
        setFineEntries(allFines);
        setDeductionCategories(allDeductionCategories);
        setSlips(allSlips);
        setSlipHistory(allSlipHistory);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          "Couldn't load data from the backend. Check the connection and try again.",
        );
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  // The default slip month and report period come from which months have
  // synced data — unknown until the weeks load. Fill them in once, the first
  // time data shows up (never override the admin's pick).
  useEffect(() => {
    if (payrollVersion === 0) return;
    setSlipMonthKey(
      (current) =>
        current ??
        getAvailableSlipMonthKeys(employees, slips)[0] ??
        getDefaultSlipMonthKey(),
    );
    setReportPeriodKey(
      (current) =>
        current ??
        getDefaultReportPeriodKey(reportPeriodType, new Date(), employees),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payrollVersion]);

  // Re-read synced weeks and both rate lists — after a sync run finishes
  // or the admin saves a rate — and rebuild every payroll figure from them.
  async function reloadPayrollData() {
    try {
      const [weeks, nextUsd, nextTax, latestRate, latestTax] =
        await Promise.all([
          payrollService.fetchAllWeeks(),
          rateService.fetchUsdRates(),
          rateService.fetchTaxRates(),
          rateService.fetchUsdPerPkr(),
          rateService.fetchTaxPercent(),
        ]);
      setPayrollData({ weeks, usdRates: nextUsd });
      setUsdRates(nextUsd);
      setTaxRates(nextTax);
      setUsdPerPkr(latestRate);
      setTaxPercent(latestTax);
      setPayrollVersion((v) => v + 1);
    } catch {
      // Keep showing what we already have; the next reload will retry.
    }
  }

  // Dispatcher records + their gross, worked out from the synced weeks
  // (stored in USD, converted to PKR per month). Recomputed whenever the
  // dispatchers, the payroll data or the admin-set weeks change.
  const employees = useMemo(
    () =>
      baseDispatchers.map((employee) => ({
        ...employee,
        ...(employee.employeeType === "dispatcher"
          ? getDispatcherGrossFigures(employee.id)
          : {
              gross: { Weekly: 0, Monthly: 0, Yearly: 0 },
              lastGross: { Weekly: null, Monthly: null, Yearly: null },
            }),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseDispatchers, payrollVersion, calendarVersion],
  );
  const dispatchers = useMemo(
    () =>
      employees.filter((employee) => employee.employeeType === "dispatcher"),
    [employees],
  );

  // USD display: PKR amounts are shown in USD with the rate of the month
  // the console is working on (the month today's week belongs to), so
  // that month's dollar gross round-trips exactly. Falls back to the
  // latest rate when that month has none at or before it.
  const usdPerPkr = useMemo(() => {
    const period = getPeriodMonth(new Date());
    const key = `${period.year}-${String(period.monthIndex + 1).padStart(2, "0")}`;
    const effective = getEffectiveUsdRate(usdRates, key);
    return effective ? 1 / effective.ratePkrPerUsd : latestUsdPerPkr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdRates, latestUsdPerPkr, calendarVersion]);

  // Loads (load-count) figures aren't available from the current Google
  // Sheets sync, so loads-derived totals (total loads, avg/load) have been
  // removed. Re-enable once dispatcher.loads is populated again — see
  // src/data/dispatchers.js.
  const totals = useMemo(() => {
    const gross = dispatchers.reduce(
      (sum, dispatcher) => sum + (dispatcher.gross?.[period] ?? 0),
      0,
    );
    const trackingFees = dispatchers.reduce(
      (sum, dispatcher) => sum + (dispatcher.trackingFee?.[period] ?? 0),
      0,
    );

    return {
      gross,
      trackingFees,
      active: dispatchers.filter(
        (dispatcher) => dispatcher.profile?.status !== "left",
      ).length,
    };
  }, [dispatchers, period]);

  const chartData = useMemo(
    () =>
      dispatchers.map((dispatcher) => {
        const grossForPeriod = dispatcher.gross?.[period] ?? 0;
        return {
          name: dispatcher.name.split(" ")[0],
          gross:
            currency === "USD"
              ? Math.round(grossForPeriod * usdPerPkr)
              : grossForPeriod,
        };
      }),
    [dispatchers, currency, usdPerPkr, period],
  );

  // Payroll rows use real dispatcher records. There is no payroll approval
  // Sent status is tracked by each saved salary slip for the current month.
  const fineTotals = useMemo(
    () => getFineTotalsForPeriod(period, fineEntries),
    [period, fineEntries, calendarVersion],
  );

  const payrollRows = useMemo(() => {
    const currentMonth = getPeriodMonth(new Date());
    const currentMonthKey = `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}`;
    const currentMonthSlips = new Map(
      slips
        .filter((slip) => slip.monthKey === currentMonthKey)
        .map((slip) => [String(slip.dispatcherId), slip]),
    );

    return employees.map((employee) => {
      const isDispatcher = employee.employeeType === "dispatcher";
      const gross = isDispatcher ? (employee.gross?.[period] ?? 0) : 0;
      const baseSalary = employee.basicSalary?.[period] ?? 0;
      const commission = isDispatcher ? gross * (employee.percentage ?? 0) : 0;
      const total = baseSalary + commission;
      const deductions = fineTotals.get(String(employee.id)) ?? 0;
      const salarySlip =
        period === "Monthly"
          ? currentMonthSlips.get(String(employee.id))
          : null;
      const status =
        period !== "Monthly"
          ? "—"
          : salarySlip?.emailStatus === "sent"
            ? "Salary slip sent"
            : salarySlip?.emailStatus === "failed"
              ? "Email failed"
              : salarySlip?.emailStatus === "sending"
                ? "Sending"
                : salarySlip
                  ? "Not sent"
                  : "Not generated";
      return {
        id: employee.id,
        dispatcherId: employee.id,
        employeeType: employee.employeeType,
        dispatcher: employee.name,
        commissionRate: employee.percentage ?? 0,
        status,
        gross,
        baseSalary,
        commission,
        trackingFee: isDispatcher ? (employee.trackingFee?.[period] ?? 0) : 0,
        total,
        deductions,
        netPayout: total - deductions,
      };
    });
  }, [employees, period, fineTotals, slips]);

  const expensesForPeriod = useMemo(
    () => getExpensesForPeriod(period, expenseEntries),
    [period, expenseEntries, calendarVersion],
  );

  async function handleAddExpense(payload) {
    await expenseService.addExpense(payload);
    setExpenseEntries(await expenseService.fetchAllExpenses());
  }

  async function handleUpdateExpense(id, patch) {
    await expenseService.updateExpense(id, patch);
    setExpenseEntries(await expenseService.fetchAllExpenses());
  }

  async function handleDeleteExpense(id) {
    await expenseService.deleteExpense(id);
    setExpenseEntries(await expenseService.fetchAllExpenses());
  }

  async function reloadExpenseCategories() {
    setExpenseCategories(await expenseService.fetchAllCategories());
  }

  async function createExpenseCategory(payload) {
    await expenseService.createCategory(payload);
    await reloadExpenseCategories();
  }

  async function updateExpenseCategory(key, patch) {
    await expenseService.updateCategory(key, patch);
    await reloadExpenseCategories();
  }

  async function archiveExpenseCategory(key) {
    await expenseService.archiveCategory(key);
    await reloadExpenseCategories();
  }

  async function deleteExpenseCategory(key) {
    await expenseService.deleteCategory(key);
    await reloadExpenseCategories();
  }

  async function handleAddFine(payload) {
    await finesService.addFine(payload);
    setFineEntries(await finesService.fetchAllFines());
  }

  async function handleUpdateFine(id, patch) {
    await finesService.updateFine(id, patch);
    setFineEntries(await finesService.fetchAllFines());
  }

  async function handleDeleteFine(id) {
    await finesService.deleteFine(id);
    setFineEntries(await finesService.fetchAllFines());
  }

  async function reloadDeductionCategories() {
    setDeductionCategories(await finesService.fetchAllCategories());
  }

  async function createDeductionCategory(payload) {
    await finesService.createCategory(payload);
    await reloadDeductionCategories();
  }

  async function updateDeductionCategory(key, patch) {
    await finesService.updateCategory(key, patch);
    await reloadDeductionCategories();
  }

  async function archiveDeductionCategory(key) {
    await finesService.archiveCategory(key);
    await reloadDeductionCategories();
  }

  async function deleteDeductionCategory(key) {
    await finesService.deleteCategory(key);
    await reloadDeductionCategories();
  }

  async function handleGenerateSlip(payload) {
    const saved = await slipService.generateSlip(payload);
    const [nextSlips, nextHistory] = await Promise.all([
      slipService.fetchAllSlips(),
      slipService.fetchSlipHistory(),
    ]);
    setSlips(nextSlips);
    setSlipHistory(nextHistory);
    return saved;
  }

  async function handleSendSlip(slipId, pdfBase64) {
    const sentSlip = await slipService.sendSlipEmail(slipId, pdfBase64);
    const [nextSlips, nextHistory] = await Promise.all([
      slipService.fetchAllSlips(),
      slipService.fetchSlipHistory(),
    ]);
    setSlips(nextSlips);
    setSlipHistory(nextHistory);
    return sentSlip;
  }

  // Switching Reports between Monthly/Yearly re-picks a sensible default
  // period for the new type, same as Salary Slips defaults to the most
  // recently closed month — see getDefaultReportPeriodKey in
  // src/utils/reportsCalc.js.
  function handleReportPeriodTypeChange(type) {
    setReportPeriodType(type);
    setReportPeriodKey(getDefaultReportPeriodKey(type, new Date(), employees));
  }

  async function handleAddDispatcher(payload) {
    await dispatcherService.addDispatcher(payload);
    setDispatchers(await dispatcherService.fetchDispatchers());
  }

  async function handleUpdateDispatcher(id, patch) {
    await dispatcherService.updateDispatcher(id, patch);
    setDispatchers(await dispatcherService.fetchDispatchers());
  }

  async function handleDeleteDispatcher(id) {
    await dispatcherService.deleteDispatcher(id);
    setDispatchers(await dispatcherService.fetchDispatchers());
    setOpenDispatcherId((current) => (current === id ? null : current));
  }

  const payrollSummary = useMemo(() => {
    const totalSalaryEarned = payrollRows.reduce(
      (sum, row) => sum + row.total,
      0,
    );
    const totalExpenses = expensesForPeriod.total;
    return {
      gross: totals.gross,
      trackingFees: totals.trackingFees,
      salaryEarned: totalSalaryEarned,
      expenses: totalExpenses,
      profit:
        totals.gross + totals.trackingFees - totalSalaryEarned - totalExpenses,
    };
  }, [payrollRows, expensesForPeriod, totals.gross, totals.trackingFees]);

  // Payroll's breakdown table is always a TREND of the last N same-length
  // periods (last 4 weeks / last 6 months / last 5 years), sourced from
  // the weekly sync history in src/data/payrollHistory.js — see
  // src/utils/payrollHistoryCalc.js for how each is derived.
  const payrollBreakdown = useMemo(() => {
    if (period === "Weekly") {
      return {
        kind: "weekly",
        rows: getWeeklyTrendBreakdown({
          dispatchers: employees,
          expenseEntries,
        }),
      };
    }
    if (period === "Yearly") {
      return {
        kind: "yearly",
        rows: getYearlyTrendBreakdown({
          dispatchers: employees,
          expenseEntries,
        }),
      };
    }
    return {
      kind: "monthly",
      rows: getMonthlyTrendBreakdown({
        dispatchers: employees,
        expenseEntries,
      }),
    };
  }, [period, dispatchers, expenseEntries, payrollVersion, calendarVersion]);

  const openDispatcher = employees.find(
    (employee) => employee.id === openDispatcherId,
  );

  // Group navigation entries are not pages themselves; content and active
  // controls use the selected child tab via `effectiveTab`.
  const effectiveTab =
    activeTab === "payroll-overview" ||
    activeTab === "reports-overview" ||
    activeTab === "properties-overview"
      ? groupSubTab
      : activeTab;

  const activeSection =
    TAB_DEFINITIONS.find((item) => item.key === effectiveTab) ||
    TAB_DEFINITIONS[0];
  // Tabs that show their own full history instead of a Weekly/Monthly/
  // Yearly slice, so the period pill-group and date banner don't apply.
  const periodlessTabs = new Set([
    "expenses",
    "deductions",
    "slips",
    "reports",
    "salary-report",
    "tracking",
    "calendar",
    "sync",
    "expense-categories",
    "deduction-categories",
  ]);
  const showPeriodControls = !periodlessTabs.has(effectiveTab);
  const currentPeriodKey = (() => {
    const p = getPeriodMonth(new Date());
    return `${p.year}-${String(p.monthIndex + 1).padStart(2, "0")}`;
  })();
  const periodLabel = {
    Weekly: "This Week",
    Monthly: "This Month",
    Yearly: "This Year",
  }[period];

  return (
    <div className="page-shell">
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div>
          <div className="sidebar-logo">
            <Truck size={22} color="var(--route)" strokeWidth={2.2} />
            <span className="sidebar-logo-text">NEXXUS</span>
          </div>
          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => {
              const Icon = iconMap[item.icon];

              if (item.children) {
                const isOpen = expandedNavGroup === item.key;
                const groupActive = activeTab === item.key;
                return (
                  <div className="sidebar-group" key={item.key}>
                    <button
                      className={`sidebar-btn ${groupActive ? "active" : ""}`}
                      aria-expanded={isOpen}
                      onClick={() =>
                        setExpandedNavGroup((prev) =>
                          prev === item.key ? null : item.key,
                        )
                      }
                    >
                      <Icon size={17} strokeWidth={2} />
                      {item.label}
                      <ChevronDown
                        size={15}
                        className={`sidebar-caret ${isOpen ? "open" : ""}`}
                      />
                    </button>
                    <div className={`sidebar-subnav ${isOpen ? "open" : ""}`}>
                      <div className="sidebar-subnav-inner">
                        {item.children.map((child) => {
                          const childActive =
                            activeTab === item.key && groupSubTab === child.key;
                          return (
                            <button
                              key={child.key}
                              className={`sidebar-subbtn ${childActive ? "active" : ""}`}
                              onClick={() => {
                                setActiveTab(item.key);
                                setGroupSubTab(child.key);
                                setExpandedNavGroup(item.key);
                                setSidebarOpen(false);
                              }}
                            >
                              {child.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              const active = item.key === activeTab;
              return (
                <button
                  key={item.key}
                  className={`sidebar-btn ${active ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab(item.key);
                    setSidebarOpen(false);
                  }}
                >
                  <Icon size={17} strokeWidth={2} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="sidebar-card">
          <span className="rounded-full flex items-center justify-center flex-shrink-0 sidebar-avatar">
            {(user?.email || "A").slice(0, 2).toUpperCase()}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sidebar-user-name">Admin</div>
            <div
              className="sidebar-user-sub"
              style={{ overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {user?.email}
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-shell">
        <div className="topbar">
          <div>
            <h1>{activeSection.label}</h1>
            <p>{activeSection.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            {showPeriodControls && (
              <div className="pill-group">
                {PERIODS.map((item) => (
                  <button
                    key={item}
                    className={period === item ? "active" : ""}
                    onClick={() => setPeriod(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
            {effectiveTab !== "slips" && effectiveTab !== "salary-report" && (
              <button
                className="toolbar-btn"
                onClick={() => setCurrency(currency === "PKR" ? "USD" : "PKR")}
                disabled={!usdPerPkr && currency === "PKR"}
                title={
                  !usdPerPkr && currency === "PKR"
                    ? "USD conversion rate is not available"
                    : undefined
                }
              >
                {currency}
                <ChevronDown size={13} />
              </button>
            )}
            {/* The top-bar "Sync now" button was removed — all syncing lives in
                the Sync Center tab now. */}
            <NotificationBell
              calendarService={calendarService}
              refreshKey={
                calendarVersion + payrollVersion + expenseEntries.length
              }
              onAction={(action) => {
                setCalendarFocusMonth(action.month || null);
                setActiveTab(action.tab || "calendar");
              }}
            />
            <button
              className="toolbar-btn mobile-menu-btn"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={14} />
              Menu
            </button>
          </div>
        </div>

        <div className="content-area">
          {loadError && <div className="load-error-banner">{loadError}</div>}

          {showPeriodControls && (
            <PeriodDateBanner
              period={period}
              onOpenCalendar={() => {
                setCalendarFocusMonth(null);
                setActiveTab("calendar");
              }}
            />
          )}

          {/* The per-dispatcher "last synced" chip row was removed — sync
              status now lives only in the Sync Center tab. */}

          {effectiveTab === "expense-categories" ? (
            <PropertiesTab
              type="expense"
              categories={expenseCategories}
              onCreate={createExpenseCategory}
              onUpdate={updateExpenseCategory}
              onArchive={archiveExpenseCategory}
              onDelete={deleteExpenseCategory}
            />
          ) : effectiveTab === "deduction-categories" ? (
            <PropertiesTab
              type="deduction"
              categories={deductionCategories}
              onCreate={createDeductionCategory}
              onUpdate={updateDeductionCategory}
              onArchive={archiveDeductionCategory}
              onDelete={deleteDeductionCategory}
            />
          ) : effectiveTab === "overview" ? (
            <OverviewTab
              dispatchers={dispatchers}
              employees={employees}
              currency={currency}
              usdPerPkr={usdPerPkr}
              period={period}
              periodLabel={periodLabel}
              totals={totals}
              chartData={chartData}
              syncService={syncService}
              onOpenSyncCenter={() => setActiveTab("sync")}
            />
          ) : effectiveTab === "dispatchers" ? (
            <DispatchersTab
              dispatchers={employees}
              currency={currency}
              usdPerPkr={usdPerPkr}
              period={period}
              feedback={dispatcherFeedback}
              onDismissFeedback={() => setDispatcherFeedback(null)}
              onOpenDispatcher={setOpenDispatcherId}
              onAddDispatcher={() => {
                setDispatcherFeedback(null);
                setDispatcherForm({ mode: "add" });
              }}
              onEditDispatcher={(dispatcher) => {
                setDispatcherFeedback(null);
                setDispatcherForm({ mode: "edit", dispatcher });
              }}
            />
          ) : effectiveTab === "payroll" ? (
            <>
              <RateWarning
                monthKey={currentPeriodKey}
                usdRates={usdRates}
                taxRates={taxRates}
                onOpenSettings={() => setActiveTab("settings")}
              />
              <PayrollTab
                payrollRows={payrollRows}
                currency={currency}
                usdPerPkr={usdPerPkr}
                period={period}
                periodLabel={periodLabel}
                expenses={expensesForPeriod}
                expenseCategories={expenseCategories}
                summary={payrollSummary}
                breakdown={payrollBreakdown}
              />
            </>
          ) : effectiveTab === "expenses" ? (
            <ExpensesTab
              entries={expenseEntries}
              categories={expenseCategories}
              calendarVersion={calendarVersion}
              currency={currency}
              usdPerPkr={usdPerPkr}
              onAddExpense={handleAddExpense}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
            />
          ) : effectiveTab === "deductions" ? (
            <FinesTab
              dispatchers={employees}
              entries={fineEntries}
              categories={deductionCategories}
              calendarVersion={calendarVersion}
              currency={currency}
              usdPerPkr={usdPerPkr}
              onAddFine={handleAddFine}
              onUpdateFine={handleUpdateFine}
              onDeleteFine={handleDeleteFine}
            />
          ) : effectiveTab === "slips" ? (
            <SalarySlipsTab
              dispatchers={employees}
              slips={slips}
              slipHistory={slipHistory}
              monthKey={slipMonthKey}
              onMonthKeyChange={setSlipMonthKey}
              usdRates={usdRates}
              taxRates={taxRates}
              fallbackUsdPerPkr={latestUsdPerPkr}
              fallbackTaxPercent={taxPercent}
              dataVersion={payrollVersion}
              fineEntries={fineEntries}
              deductionCategories={deductionCategories}
              onGenerateSlip={handleGenerateSlip}
              onSendSlip={handleSendSlip}
              onOpenSettings={() => setActiveTab("settings")}
            />
          ) : effectiveTab === "reports" ? (
            <ReportsTab
              dispatchers={employees}
              slips={slips}
              expenseEntries={expenseEntries}
              fineEntries={fineEntries}
              currency={currency}
              usdPerPkr={usdPerPkr}
              taxPercent={taxPercent}
              taxRates={taxRates}
              usdRates={usdRates}
              dataVersion={payrollVersion}
              onOpenSettings={() => setActiveTab("settings")}
              periodType={reportPeriodType}
              periodKey={reportPeriodKey}
              onPeriodTypeChange={handleReportPeriodTypeChange}
              onPeriodKeyChange={setReportPeriodKey}
            />
          ) : effectiveTab === "salary-report" ? (
            <SalaryReportTab slips={slips} dataVersion={payrollVersion} />
          ) : effectiveTab === "tracking" ? (
            <TrackingTab
              dispatchers={dispatchers}
              currency={currency}
              usdPerPkr={usdPerPkr}
              trackingProperties={trackingProperties}
              dataVersion={payrollVersion}
            />
          ) : effectiveTab === "calendar" ? (
            <WeekCalendarTab
              key={calendarFocusMonth || "default"}
              calendarService={calendarService}
              initialMonth={calendarFocusMonth}
              onSaved={() => setCalendarReload((v) => v + 1)}
            />
          ) : effectiveTab === "sync" ? (
            <SyncCenterTab
              syncService={syncService}
              calendarVersion={calendarVersion}
              onSynced={reloadPayrollData}
              trackingProperties={trackingProperties}
              onDispatcherLinkClick={() => setActiveTab("dispatchers")}
              onOpenCalendar={(monthKey) => {
                setCalendarFocusMonth(monthKey || null);
                setActiveTab("calendar");
              }}
            />
          ) : effectiveTab === "settings" ? (
            <SettingsTab
              rateService={rateService}
              onTrackingPropertiesChange={setTrackingProperties}
              onUsdRateChange={(value) => {
                setUsdPerPkr(value);
                reloadPayrollData();
              }}
              onTaxRateChange={(value) => {
                setTaxPercent(value);
                reloadPayrollData();
              }}
            />
          ) : (
            <PlaceholderTab
              title={activeSection.label}
              subtitle={activeSection.subtitle}
              description={activeSection.description}
              bullets={activeSection.bullets}
            />
          )}
        </div>
      </main>

      {openDispatcher && (
        <DispatcherDetailModal
          dispatcher={openDispatcher}
          currency={currency}
          usdPerPkr={usdPerPkr}
          period={period}
          onClose={() => setOpenDispatcherId(null)}
          onEdit={(dispatcher) => {
            setOpenDispatcherId(null);
            setDispatcherForm({ mode: "edit", dispatcher });
          }}
        />
      )}

      {dispatcherForm && (
        <DispatcherFormModal
          mode={dispatcherForm.mode}
          dispatcher={dispatcherForm.dispatcher}
          onClose={() => setDispatcherForm(null)}
          onSubmit={async (payload) => {
            if (dispatcherForm.mode === "edit") {
              await handleUpdateDispatcher(
                dispatcherForm.dispatcher.id,
                payload,
              );
              setDispatcherFeedback({
                type: "success",
                message: `Updated ${payload.alias} successfully.`,
              });
            } else {
              await handleAddDispatcher(payload);
              setDispatcherFeedback({
                type: "success",
                message: `Added ${payload.alias} successfully.`,
              });
            }
            setDispatcherForm(null);
          }}
          onDelete={async (id) => {
            await handleDeleteDispatcher(id);
            setDispatcherForm(null);
          }}
        />
      )}
    </div>
  );
}
