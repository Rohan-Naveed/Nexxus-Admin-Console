# Google Sheets integration — revisit once we know the sheet structure

> **UPDATE:** the sync job, scheduler and the Sync Center tab now exist —
> see `/SYNC_CENTER.md` (weeks now come from the admin-set Week Calendar). Items 1, 2, 5 and 6 below are done (the top-bar
> "Sync now", Dashboard Sync button and Dispatchers "Refresh all" were
> removed; sync lives only in the Sync Center). Items 3 and 4 are now done too: Payroll,
> Reports, Tax and Salary Slips read the synced weeks (`GET /api/payroll-weeks`,
> stored in USD and converted per month) instead of mock data.


This tracks everything that was deliberately left mocked/stubbed/disabled
during the backend-wiring pass (dispatchers, expenses, fines, salary
slips) because it depends on the Google Sheets sync job, which itself
depends on knowing how each dispatcher's sheet is actually laid out
(which columns/tabs hold gross revenue, how weeks are marked, etc.).

Everything else in the app — dispatcher CRUD, expenses, fines,
salary slips, the USD rate lookup — is wired to the real backend already
and does **not** need anything from this list.

## What's blocked, and where

1. **The sync job itself.** Doesn't exist in the backend at all yet.
   Needs: a sample sheet to see the real column/tab layout, then a
   Node script (using `googleapis` + a service account) that reads each
   dispatcher's sheet and calls `POST /api/payroll-weeks/sync` per
   week found. That endpoint already exists and is a safe upsert — see
   `backend/src/modules/payrollWeeks/payrollWeeks.service.js#syncWeek`.

2. **A scheduler to run it periodically.** Also doesn't exist. Once the
   sync job above exists, wrap it in `node-cron` (or similar) running
   every 15–30 min, plus expose a `POST /api/sync/run-now`-style endpoint
   the frontend's "Sync now" button can call directly.

3. **`src/data/payrollHistory.js`** — `WEEKLY_GROSS_HISTORY` and
   `YEARLY_GROSS_HISTORY` are entirely fabricated mock data standing in
   for the `payroll_weeks` table. Once the sync job is writing real rows,
   delete this file's mock exports and point
   `src/utils/payrollHistoryCalc.js`'s two imports at real
   `GET /api/payroll-weeks/...` calls instead — nothing else needs to
   change, every screen already goes through that util.

4. **`src/services/dispatcherService.js`** — `fetchDispatchers()` now
   calls the real `/api/dispatchers` endpoint, but `gross`, `lastGross`,
   `freshness`, and `lastSynced` are stubbed to zero/"pending" in
   `buildPendingSyncFields()` (search for that function name) because
   those aren't dispatcher-table columns — they come from
   `payroll_weeks`. Once real payroll-weeks data exists, compute these
   from it in that same function instead of returning the stub.

5. **`src/App.jsx`** — `syncDispatchers()` (per-row "Sync" button on the
   Overview tab) and `handleSyncNow()` ("Sync now" button in the top
   bar) both just flip local React state (`lastSynced: "Just now"`)
   instead of triggering anything real. Swap both for a call to the
   sync-trigger endpoint from item 2 above.

6. **Dispatchers tab "Refresh all" button** (`src/components/
   DispatchersTab.jsx`) — currently disabled with a "Coming soon" tooltip
   rather than wired to a fake handler. Enable it once item 2 exists.

## Also noted, but NOT Google-Sheets-related

These were flagged during the wiring pass but don't need sheet
structure — just separate follow-up work whenever it's prioritized:

- **Settings tab doesn't exist yet.** The USD/PKR rate is now read from
  `GET /api/rates/usd-pkr/latest` (falls back to the old hardcoded
  default if nothing's been set), and the backend already has full
  CRUD for both `usd-pkr` and `tax` rates — but there's no UI anywhere
  to actually set them. `DEFAULT_TAX_PERCENT` in `src/data/
  dispatchers.js` is still a hardcoded constant.
- **Payroll approval status** ("Approved"/"Pending" in the Payroll tab)
  has no backing table in `schema.sql`. `App.jsx`'s `payrollRows` now
  defaults every dispatcher to `"Pending"` since the old hardcoded
  `PAYROLL_ROWS` mock (keyed by fake dispatcher ids) no longer lines up
  with real DB-assigned ids. Needs a small new table if real approval
  tracking is wanted.
- **No authentication** anywhere yet, frontend or backend.
