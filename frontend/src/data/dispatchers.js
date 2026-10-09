// Group entries render their children as nested navigation tabs. The group
// key is only for navigation; child keys select the content rendered by the
// console. Add/remove/rename group members here only.
export const NAV_ITEMS = [
  { key: "overview", label: "Dashboard", icon: "LayoutDashboard" },
  { key: "dispatchers", label: "Employees", icon: "Users" },
  {
    key: "payroll-overview",
    label: "Payroll Center",
    icon: "Wallet",
    children: [
      { key: "payroll", label: "Payroll" },
      { key: "expenses", label: "Expense" },
      { key: "deductions", label: "Deductions" },
      { key: "slips", label: "Salary Slips" },
    ],
  },
  {
    key: "reports-overview",
    label: "Reports",
    icon: "BarChart3",
    children: [
      { key: "reports", label: "Payroll Report" },
      { key: "salary-report", label: "Salary Report" },
    ],
  },
  {
    key: "properties-overview",
    label: "Categories",
    icon: "Tags",
    children: [
      { key: "expense-categories", label: "Expense Categories" },
      { key: "deduction-categories", label: "Deduction Categories" },
    ],
  },
  { key: "tracking", label: "Tracking", icon: "Activity" },
  { key: "calendar", label: "Week Calendar", icon: "CalendarDays" },
  { key: "sync", label: "Sync Center", icon: "RefreshCw" },
  { key: "settings", label: "Settings", icon: "Settings" },
];

export const PERIODS = ["Weekly", "Monthly", "Yearly"];

export const TAB_DEFINITIONS = [
  {
    key: "overview",
    label: "Dashboard",
    subtitle:
      "Dispatcher activity synced from Google Sheets and ready for deeper reporting.",
    description:
      "This view gives the team a clean high-level snapshot of dispatcher performance, gross value, and sync health.",
    bullets: [
      "Google Sheets sync health",
      "Weekly, monthly and yearly gross summaries",
      "Live dispatcher table",
    ],
  },
  {
    key: "dispatchers",
    label: "Employees",
    subtitle: "Manage dispatchers and fixed-salary employees in one roster.",
    description:
      "Dispatcher records include gross and Google Sheets settings; other employees have a fixed monthly base salary.",
    bullets: [
      "Employee profiles and salary rules",
      "Dispatcher commission and Sheets settings",
      "Roster status tracking",
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    subtitle:
      "Commission and salary totals are prepared for the next payroll engine step.",
    description:
      "Payroll is separated from the overview so rules can be changed independently of the reporting view.",
    bullets: [
      "Base salary calculations",
      "Commission totals",
      "Approval-ready rows",
    ],
  },
  {
    key: "slips",
    label: "Salary Slips",
    subtitle:
      "Review employee pay for the month, then generate a PDF slip on demand.",
    description:
      "Monthly slips for dispatchers and fixed-salary employees, with a running history of everything issued so far.",
    bullets: [
      "PDF-ready slip layout",
      "Month-based runs, including past months",
      "Employee-specific payouts and history",
    ],
  },
  {
    key: "deductions",
    label: "Deductions",
    subtitle:
      "Late marks, violations and other fines, logged per employee and fed straight into salary slips.",
  },
  {
    key: "expenses",
    label: "Expenses",
    subtitle: "Miscellaneous costs, monthly dinner, and monthly utility bills.",
  },
  {
    key: "reports",
    label: "Payroll Report",
    subtitle:
      "Monthly and yearly summaries of dispatcher payroll, expenses and profit.",
    description:
      "Review gross, payroll, expenses and profit across dispatcher and fixed-salary employee records.",
    bullets: [
      "Weekly, monthly and yearly exports",
      "Trend charts",
      "Audit-ready summaries",
    ],
  },
  {
    key: "salary-report",
    label: "Salary Report",
    subtitle:
      "Review employee salary payouts and tax across generated salary slips.",
  },
  {
    key: "expense-categories",
    label: "Expense Categories",
    subtitle: "Manage the categories available for monthly expense totals.",
  },
  {
    key: "deduction-categories",
    label: "Deduction Categories",
    subtitle: "Manage the deduction categories recorded against employees.",
  },
  {
    key: "tracking",
    label: "Tracking",
    subtitle: "Audit tracking income generated from dispatcher gross.",
    description:
      "Review weekly fee calculations and monthly totals using the percentage snapshots stored with each synced week.",
    bullets: [
      "Weekly gross and tracking-fee detail",
      "Monthly dispatcher totals",
      "Historical percentage snapshots",
    ],
  },
  {
    key: "calendar",
    label: "Week Calendar",
    subtitle:
      "Set how many weeks each month has and where every week ends. The console and the sync scheduler run on these weeks.",
  },
  {
    key: "sync",
    label: "Sync Center",
    subtitle:
      "Everything about Google Sheets syncing in one place: status, manual sync and history.",
  },
  {
    // Fallback only — App.jsx always resolves the active *sub*-tab
    // (payroll/expenses/deductions/slips) for this group, so this
    // entry is never shown in normal use.
    key: "payroll-overview",
    label: "Payroll Overview",
    subtitle: "Payroll, expenses, deductions and salary slips in one place.",
  },
  {
    key: "settings",
    label: "Settings",
    subtitle: "Manage the rates used by financial calculations.",
    description:
      "Configure monthly USD-to-PKR exchange rates and income tax percentages.",
    bullets: [
      "USD-to-PKR rates",
      "Income tax rates",
      "Effective-month history",
    ],
  },
];
