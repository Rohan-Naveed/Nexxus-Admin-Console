# Nexxus Admin Console — Functionality Document

_Covers: current frontend build, current backend build, the Postgres schema, gaps between all three, and the design for the pieces that don't exist yet (Google Sheets sync, Settings/rates, scheduler)._

---

## 1. How the three pieces fit together today

- **Frontend** (`AC_without_modules`, React + Vite): fully built UI for every tab except Settings. All data currently comes from four in-memory "services" (`dispatcherService.js`, `expenseService.js`, `finesService.js`, `slipService.js`) that hold JS arrays seeded from `src/data/*.js`. **Not a single `fetch()` call exists in the frontend.**
- **Backend** (`backend/`, Express + `pg`, raw SQL): a clean REST API over Postgres, matching `schema.sql` table-for-table. Every table has full CRUD. **No Google Sheets sync, no scheduler, no auth exist yet** — the backend only exposes the tables a sync job / login layer would sit on top of.
- **Schema** (`schema.sql`): six tables — `dispatchers`, `payroll_weeks`, `usd_pkr_rates`, `tax_rates`, `expenses` (+ `expense_categories`), `fines` (+ `fine_types`), `salary_slips`.

The three were clearly designed together (the backend's `toApiShape()` functions and the frontend's mock data use matching field names), so the integration work is mostly "point the frontend's existing service functions at real endpoints" rather than redesigning anything.

---

## 2. Tab-by-tab: what exists, and where its data will come from

### Dashboard (Overview)
- **Frontend today:** KPI cards (total gross for the period, active dispatcher count), a gross-by-dispatcher bar chart, and an activity table with a manual "Sync" button per dispatcher.
- **Backend today:** `GET /api/dispatchers`, `GET /api/payroll-weeks/totals/monthly|yearly`.
- **Wiring needed:** `fetchDispatchers()` → `GET /api/dispatchers`; the Weekly/Monthly/Yearly gross per dispatcher needs `GET /api/payroll-weeks/dispatcher/:id` or the totals endpoints, computed client-side same as now. The per-row "Sync" button should call the real sync trigger (see §4) instead of faking a timestamp.

### Dispatchers
- **Frontend today:** roster stats (active / left / pending refresh / sheet-not-linked counts), add/edit/delete dispatcher modal (name, alias, commission %, basic salary, fuel allowance, default cash split, full profile incl. Google Sheet ID/tab).
- **Backend today:** full CRUD at `/api/dispatchers`, plus `/api/dispatchers/unlinked-sheets` which already does the "sheet not linked" filtering server-side.
- **Wiring needed:** straightforward — `dispatcherService`'s four methods map 1:1 onto `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`. The "sheet not linked" stat can switch to calling `/unlinked-sheets` directly instead of computing it client-side (either works; using the backend's version keeps the logic in one place).
- **Gap:** "Refresh all" button currently has no handler at all.

### Payroll
- **Frontend today:** dispatcher and fixed-salary employee payroll breakdowns, separated in the overview, with total salary earned shown before deductions alongside net payout, a period expense summary + profit banner, and a weekly/monthly/yearly trend breakdown table.
- **Backend today:** the raw numbers exist (`payroll_weeks` totals, `dispatchers` for rates), but there's no dedicated "payroll" endpoint — this tab's numbers are a **client-side computation** over dispatcher + payroll_weeks + expenses data, same as it is now with mock data.
- **Wiring needed:** once dispatchers, payroll-weeks totals, and expenses are all coming from real endpoints, `PayrollTab`'s existing calculation logic (`payrollHistoryCalc.js`) needs no rewrite — it just needs real arrays instead of the mock `WEEKLY_GROSS_HISTORY`/`YEARLY_GROSS_HISTORY`.
- **Gap:** the "Approved / Pending" status per payroll row (`PAYROLL_ROWS` in `data/dispatchers.js`) has no backing table at all — right now it's hardcoded mock data with no CRUD. If real approval tracking is wanted, this needs a small new table (e.g. `payroll_approvals(dispatcher_id, period_year, period_month, status)`) that doesn't exist in `schema.sql` yet.

### Expenses
- **Frontend today:** admins manage expense categories under Properties and enter one amount per category and calendar month. Monthly history supports editing and deleting amounts.
- **Backend today:** expense category CRUD is exposed at `/api/expenses/categories`; archived categories remain attached to their historical records. Expenses are stored once per category/month at `/api/expenses`.
- **Migration:** `009_monthly_expenses_and_editable_categories.sql` consolidates existing dated entries into monthly totals, using the configured Week Calendar period where possible.

### Deductions (Fines)
- **Frontend today:** admins manage deduction categories under Properties; fine entries remain attached to an employee and date, with dispatcher filtering and monthly history.
- **Backend today:** category CRUD is exposed at `/api/fines/types`; categories can be archived without deleting historical deductions. Deduction entries remain at `/api/fines`.

### Tax
- **Frontend today:** per-dispatcher taxable-pay (base + commission + fuel allowance) and tax-withheld breakdown for any month/year on file, CSV + PDF export.
- **Backend today:** `tax_rates` table + `/api/rates/tax*` endpoints exist for **storing the admin-set rate**, but the tax _calculation itself_ (`taxCalc.js`) is a frontend-only computation over dispatcher + payroll data — that's correct and doesn't need a backend endpoint of its own.
- **Gap:** the rate is hardcoded (`DEFAULT_TAX_PERCENT = 1.5` in `data/dispatchers.js`) instead of being read from `GET /api/rates/tax/latest`, and there's no UI to change it (that's the Settings tab — see §5).

### Salary Slips
- **Frontend today:** per-employee slip builder, pre-filled from payroll and monthly deduction entries, with category-level deductions in the preview and generated PDF.
- **Backend today:** `/api/salary-slips` stores a snapshot of the deduction category labels and amounts alongside each generated slip, so later category edits do not change issued slips.

### Reports
- **Frontend today:** company-wide gross, salary-earned, net-payroll-paid, expense, profit and tax summaries for any period; profit subtracts salary earned before deductions. Includes weekly/monthly breakdown and CSV + PDF export.
- **Backend today:** no dedicated endpoint — like Payroll, this is a client-side aggregation over dispatchers + payroll_weeks + expenses + fines, which is the right approach (no new backend work needed beyond the underlying data being real).

### Settings — **does not exist yet**
- Falls through to `PlaceholderTab` currently.
- This is where the USD/PKR rate and tax rate need admin-editable UI, backed by the `rates` endpoints that already exist server-side but have nothing calling them from the frontend.

---

## 3. Gap summary (things that need to be built, not just wired)

| # | Gap | Where |
|---|---|---|
| 1 | No frontend service calls the backend at all | All 4 service files |
| 2 | No Settings tab / no UI to edit USD-PKR rate | Frontend — backend endpoint already exists |
| 3 | No Settings tab / no UI to edit tax rate | Frontend — backend endpoint already exists |
| 4 | No real Google Sheets sync job | Backend — `POST /api/payroll-weeks/sync` exists as the target, nothing calls it |
| 5 | No scheduler process to run the sync periodically | Backend — doesn't exist |
| 6 | "Sync now" / per-row "Sync" buttons are fake (just flip a local timestamp) | Frontend |
| 7 | "Refresh all" button (Dispatchers tab) has no handler | Frontend |
| 8 | No payroll approval tracking table/endpoint (`Approved`/`Pending` is hardcoded mock data) | Backend + schema |
| 9 | No authentication/login anywhere | Both |

---

## 4. Design: Google Sheets sync (how it's meant to work)

This is described in the backend README and matches the schema comments, but doesn't exist as code yet. Proposed shape:

1. **Trigger:** a scheduled job (see §4a) plus a manual "Sync now" button in the UI that hits the same code path on demand.
2. **Per dispatcher:** read `google_sheet_id` + `google_sheet_tab` from the `dispatchers` table. Skip (and flag via `/unlinked-sheets`) any dispatcher missing either.
3. **Read the sheet:** using a Google service account (via `googleapis`), pull that dispatcher's sheet/tab and compute gross revenue for each week of the current (and possibly prior, for late corrections) month. The exact cell layout depends on how each dispatcher's sheet is formatted — this needs a look at a real sample sheet to nail down the parsing rules.
4. **Write to Postgres:** for each week found, call the equivalent of `payrollWeeksService.syncWeek({ dispatcherId, periodYear, periodMonth, weekNumber, grossAmount })` — this is already implemented as an **upsert** (`ON CONFLICT ... DO UPDATE`), so re-running the sync is always safe and idempotent.
5. **Never write partial/null over real data unintentionally** — only write a week's `gross_amount` when the sheet actually has a number for it; a week with nothing on the sheet yet should stay `NULL` (already the schema's convention for "not synced yet").
6. **Update `dispatchers.updated_at`** or a lightweight "last synced" marker so the frontend can show real sync-freshness (`freshness: synced/pending/stale`) instead of the current hardcoded mock values.

### 4a. Scheduler
- A small standalone script (or a `node-cron` job inside the Express process) that runs the sync described above every 15–30 minutes, as originally planned, plus exposes a `POST /api/sync/run-now` (new endpoint) that the frontend's "Sync now" button calls directly instead of faking a `setTimeout`.
- Logs each run the same way `dbQuery`/`dbExecute` already log DB calls, so sync history is auditable from the log files.

---

## 5. Design: Settings tab (new)

Needs to be built from scratch. Minimum viable version:

- **USD/PKR rate section:** shows the latest rate (`GET /api/rates/usd-pkr/latest`), a small form to set a new one for the current month (`POST /api/rates/usd-pkr`), and a history table (`GET /api/rates/usd-pkr`). Every screen currently taking `usdPerPkr` as a prop from `App.jsx` state would instead have that state populated from this endpoint on load, refreshed after a save.
- **Tax rate section:** identical shape, using `/api/rates/tax*`.
- Both rates are already modeled as "one row per month" in the schema, so the Settings UI should let the admin pick which month/year they're setting a rate for (defaulting to the current month), not just have one global number.

---

## 6. Integration plan (once this document is agreed)

1. Add a small `apiClient.js` (base URL + fetch wrapper) to the frontend.
2. Rewrite the four existing service files' method bodies to call the real endpoints — keep their exported function signatures identical so no component code needs to change.
3. Build the Settings tab and wire `usdPerPkr` / `taxPercent` to come from state populated by the `rates` endpoints instead of the hardcoded constants in `data/dispatchers.js`.
4. Replace the mock `WEEKLY_GROSS_HISTORY`/`YEARLY_GROSS_HISTORY` data source with real `payroll-weeks` calls.
5. Wire "Sync now" / per-row Sync / "Refresh all" to a real sync trigger (even a stub endpoint that just re-reads current DB state is a fine first step before the actual Google Sheets job is built).
6. Decide on and build payroll-approval tracking if that status column matters, or drop it from the UI if it doesn't.
7. Build the actual Google Sheets sync job + scheduler once a sample sheet's layout is available to parse against.
8. Add auth last, once everything else works against a single shared admin session.
