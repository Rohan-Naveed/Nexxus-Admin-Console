# Week Calendar, Sync Center and notifications

## 1. Database

Run **one** file: `migrations/002_sync_center_and_week_calendar.sql`
(after your users/audit migration). It:

- allows week numbers 1-6 and 4-decimal gross on `payroll_weeks`,
- creates `calendar_weeks` (the admin-defined weeks; no two weeks may overlap),
- creates `sync_history` (every sync attempt).

`schema.sql` already reflects the result.

## 2. Google access

1. Create a Google Cloud service account, enable the **Google Sheets API**,
   download its JSON key.
2. Save it as `backend/config/google-service-account.json`
   (`config.sync.google.serviceAccountKeyFile`). Do not commit it.
3. Share every dispatcher's sheet with the service account email (**Viewer**).
4. `cd backend && npm install` (adds `googleapis`, `node-cron`).

## 3. Week Calendar (admin sets the weeks)

- Tab **Week Calendar**: use the arrows beside the month strip to move one
  month at a time, including to previous months; pick a month, Auto-fill
  Monday-Sunday (or build by hand), and click the day a week should END on.
  Each week starts the day after the previous one ends. Several months can be
  set and saved at once.
- Rules enforced by the API (and mirrored in the UI):
  - weeks are numbered 1..n (max 6 per month), 1-14 days each,
    back-to-back, never overlapping (also a DB constraint);
  - a week that has **ended and been synced is locked**;
  - a week that hasn't ended can have its end date moved (not into the past);
  - ended-but-unsynced weeks can still be edited.
- A month with no weeks is **not set**: the scheduler and manual sync skip it,
  the Sync Center shows "Weeks not set", and the bell warns the admin.
- Week N in the calendar is matched to the sheet's `WEEK 0N` block. If the
  sheet has a WEEK block the calendar doesn't, the sync history says so.

## 4. Syncing

- A week can be synced from the day after its end date (`config.sync.timezone`).
- Scheduler: every Monday at `config.sync.schedulerTime` in
  `config.sync.timezone`; syncs every ended week in the calendar that hasn't
  synced (failed weeks retried; empty weeks retried for `noDataRetryDays`). It
  also runs once shortly after server start.
- Manual: Sync Center per dispatcher, or all dispatchers; specific weeks or all
  eligible weeks. Ended weeks only (checked by the API).
- Old months you never set in the calendar are simply ignored.

## 5. Notification bell

Derived on each request (nothing stored): "Weeks not set" for the current
month and the next month (red for the current month, or the next one in its
last week), and "Today isn't inside any week".

## 6. API (all admin only)

`GET /api/calendar?from=YYYY-MM&to=YYYY-MM` · `GET /api/calendar/weeks` ·
`PUT /api/calendar` · `GET /api/notifications` ·
`GET /api/sync/status|summary|history` · `POST /api/sync/run` ·
`GET /api/sync/runs/:id`. The old public `POST /api/payroll-weeks/sync` is gone.

## 7. Config (`backend/config/config.json`)

`sync.timezone`, `sync.schedulerEnabled`, `sync.schedulerTime`,
`sync.noDataRetryDays`, `sync.concurrency`, `sync.sheet.*Column`,
`calendar.maxWeeksPerMonth`, `calendar.maxWeekDays`.
