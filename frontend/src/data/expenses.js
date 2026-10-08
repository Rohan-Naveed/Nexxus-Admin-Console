// Expense category metadata used by forms and period calculations.

export const EXPENSE_CATEGORIES = {
  dinner: { label: "Monthly Dinner", cadence: "monthly" },
  miscellaneous: { label: "Miscellaneous", cadence: "flexible" },
  electricity: { label: "Electricity Bill", cadence: "monthly" },
  gas: { label: "Gas Bill", cadence: "monthly" },
  water: { label: "Water Bill", cadence: "monthly" },
};

// Weekly-cadence categories get bucketed into Week 1-4 of their month.
// Only miscellaneous is dated per entry now.
export const WEEKLY_CATEGORY_KEYS = ["miscellaneous"];

// Monthly-cadence categories are entered ONCE per month (dinner + the three
// utility bills) and shown at the month level only, never split by week.
// The admin picks a month, not a date.
export const MONTHLY_BILL_KEYS = ["dinner", "electricity", "gas", "water"];
