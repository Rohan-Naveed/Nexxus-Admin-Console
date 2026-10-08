# Nexxus Admin Console — API

Backend for the dispatcher admin console frontend, built against
`schema.sql`. Node.js + Express + `pg` (raw SQL, no ORM), organized by
module with a clean separation between routing, request handling, and
data access.

## Structure

```
config/
  config.json        # server, DB connection, and logging settings
  db.json             # every SQL query used by the app, namespaced by module
logs/
  YYYY-MM-DD.log       # one file per calendar day, created automatically
src/
  db/
    pool.js            # pg connection pool (config.json)
    helpers.js          # the two DB helpers — see below
  logger/
    logger.js           # daily-file logger used everywhere
  middleware/
    requestLogger.js    # logs every HTTP request/response
    errorHandler.js      # ApiError class + centralized error responses
  modules/
    auth/                 # signup/login/logout/me — JWT in an httpOnly cookie
    dispatchers/         # each module: *.routes.js, *.controller.js, *.service.js
    payrollWeeks/
    rates/                # usd_pkr_rates + tax_rates
    expenses/
    fines/
    salarySlips/
    calendar/             # Week Calendar: admin-defined weeks (calendar_weeks)
    notifications/        # derived alerts for the bell (weeks not set, ...)
    sync/                 # Sync Center: sheet reader, sync core, routes, weekly scheduler
  middleware/
    auth.js               # requireAuth (any logged-in user), requireAdmin (admin role only)
  app.js                 # wires up middleware + routers
  server.js               # API entry point
  scheduler.js            # standalone auto-sync scheduler entry point
```

## Auth

Anyone can sign up (`POST /api/auth/signup`) and choose a role of
`admin` or `user`. Only one `admin` account may ever exist — enforced
by a partial unique index on `users.role` (see `schema.sql`), not just
application code, so it holds under concurrent signups too. A signup
attempt for `admin` after one already exists returns `409`.

Login sets a signed JWT in an httpOnly cookie (`config.auth`). Every
route under `/api/dispatchers`, `/api/payroll-weeks`, `/api/rates`,
`/api/expenses`, `/api/fines`, and `/api/salary-slips` is wrapped in
`requireAdmin` — a logged-in `user` account gets a `403` on all of
them. The frontend uses that to decide whether to show the console or
a "coming soon" placeholder. `/api/auth/me` only requires `requireAuth`
(any logged-in account, either role).

Each module follows the same three-file shape:

- **`*.routes.js`** — Express router, maps URLs to controller functions.
- **`*.controller.js`** — thin HTTP layer: reads `req`, calls the service, shapes the response.
- **`*.service.js`** — all business logic and DB calls live here, using the two helpers below. Also owns the snake_case (DB) ↔ camelCase (API) mapping for that table.

## The two DB helpers (`src/db/helpers.js`)

Per your spec, there are exactly two:

- **`dbQuery(sql, params, label)`** — for calls where you want data back:
  `SELECT`, and any `INSERT`/`UPDATE`/`DELETE` that uses `RETURNING`.
  Logs the query, its params, and the row count, then resolves with the
  **rows array**.
- **`dbExecute(sql, params, label)`** — for plain writes with no
  `RETURNING`: mainly `UPDATE`. Logs the same way, resolves with the
  **number of rows affected** (`rowCount`).

Every query string itself lives in `config/db.json` — services never
inline SQL, they just look up `queries.selectAll` etc. and pass it to
one of the two helpers.

## Logging

`src/logger/logger.js` is a small dependency-free logger. It writes to
`logs/YYYY-MM-DD.log`, re-resolving the filename on every write, so it
rolls over to a new file automatically after midnight — no restart or
cron job needed. It also echoes to the console. Every DB call (via the
two helpers) and every HTTP request (via `requestLogger` middleware) is
logged.

## Setup

```bash
cd backend
npm install
```

Set the server, database, and logging options in `config/config.json` before
starting the API. Keep that file private when it contains real database
credentials; the default password is only a local-development placeholder.

Run the `schema.sql` you already have against your Postgres database,
then:

For a fresh database, run the root `schema.sql`; it includes the latest
dispatcher, payroll, sync, calendar, and salary-slip structures. For an
existing database, apply any outstanding migrations in numeric order through
`migrations/008_salary_slip_history.sql`. That migration adds the append-only
salary-slip activity log and backfills the latest generation and successful
email-send events from existing salary slips. Do not run migrations against a
fresh database created from `schema.sql`.

Configure the SMTP connection in
`backend/config/config.json` under `mail.smtp`. The default host, port, and
sender match `mailer1.js`; enter the SMTP password in the `password` field.
Place the salary-email logo at `backend/assets/salary-slip-email-logo.png`
(or update `mail.salarySlipLogoPath` to a PNG, JPG, or GIF path relative to the
backend directory). If the image is not present, the email uses a text wordmark.
The Contact Us button URL is configured by `mail.salarySlipContactUrl`.
Because the config file contains database and mail credentials, keep your
local copy private and never commit real passwords.

```bash
npm run dev     # node --watch, restarts on file change
# or
npm start
```

The API listens on `config.json`'s `server.port` (default 4000). Run the
automatic sync scheduler separately in another terminal or process:

```bash
npm run scheduler:dev  # development; restarts on file change
# or
npm run scheduler
```

The scheduler runs only when `sync.schedulerEnabled` is `true`, every Monday
at `sync.schedulerTime` in `sync.timezone`. It performs a catch-up sync shortly
after starting. Manual sync requests continue to be handled by the API and do
not require the scheduler process. Run exactly one scheduler process for a
given database to avoid duplicate scheduled runs. Runtime settings are read
directly from `config/config.json`; no `.env` file is used.

## Google Sheets sync

The sync module reads dispatcher sheets with the configured service account,
parses their weekly blocks, and writes results through the shared sync service.
Manual sync runs are exposed by the API. Automatic runs are handled by the
standalone scheduler process described above. Configure the service account
key path, sheet columns, timezone, and run time in `config/config.json` before
enabling automatic runs.

### Read-only sync simulation

To inspect what the sheet reader would resolve and which database columns a
manual sync would write, edit `TEST_DISPATCHER_ID`, `TEST_PERIOD_YEAR`,
`TEST_PERIOD_MONTH`, and `TEST_WEEK_NUMBER` at the top of
`src/modules/sync/sync.simulator.js`, then run:

```bash
npm run sync:simulate
```

The simulator reads the selected dispatcher's sheet link from PostgreSQL and
fetches that sheet using the configured service account. It prints the
resolved sheet data and the proposed `payroll_weeks` and `sync_history` rows,
but never inserts or updates either table and does not call the admin console.
It does not enforce the manual-sync calendar/end-date eligibility checks, so
it can be used to test a sheet week before that week is eligible for a real
sync. A `no_data` result previews a `sync_history` entry and confirms that no
`payroll_weeks` upsert would occur.

## API reference

All routes are prefixed `/api`. Bodies/responses are camelCase JSON —
`dispatchers.service.js` (etc.) handle the translation to/from the
snake_case DB columns.

### Dispatchers — `/api/dispatchers`

| Method | Path               | Notes                                                |
| ------ | ------------------ | ---------------------------------------------------- |
| GET    | `/`                | list all                                             |
| GET    | `/unlinked-sheets` | dispatchers missing `googleSheetId`/`googleSheetTab` |
| GET    | `/:id`             | one dispatcher                                       |
| POST   | `/`                | create — `name` and `alias` required                 |
| PUT    | `/:id`             | update                                               |
| DELETE | `/:id`             | delete                                               |

### Payroll weeks — `/api/payroll-weeks`

| Method | Path                                     | Notes                                               |
| ------ | ---------------------------------------- | --------------------------------------------------- |
| GET    | `/dispatcher/:dispatcherId`              | all weeks for a dispatcher                          |
| GET    | `/dispatcher/:dispatcherId/:year/:month` | one month's 4 weeks                                 |
| GET    | `/totals/monthly?year=&month=`           | SUM per dispatcher for that month                   |
| GET    | `/totals/yearly?year=`                   | SUM per dispatcher for that year                    |
| POST   | `/sync`                                  | upsert one week (what a Sheets sync job would call) |
| DELETE | `/:id`                                   | delete a week                                       |

### Rates — `/api/rates`

| Method | Path              | Notes                                   |
| ------ | ----------------- | --------------------------------------- |
| GET    | `/usd-pkr`        | all months                              |
| GET    | `/usd-pkr/latest` | most recent                             |
| POST   | `/usd-pkr`        | upsert for a `periodYear`/`periodMonth` |
| GET    | `/tax`            | all months                              |
| GET    | `/tax/latest`     | most recent                             |
| POST   | `/tax`            | upsert for a `periodYear`/`periodMonth` |

### Expenses — `/api/expenses`

| Method | Path          | Notes                                  |
| ------ | ------------- | -------------------------------------- |
| GET    | `/categories` | lookup list (dinner, electricity, ...) |
| GET    | `/?from=&to=` | all, or filtered by date range         |
| POST   | `/`           | create                                 |
| PUT    | `/:id`        | update                                 |
| DELETE | `/:id`        | delete                                 |

### Fines — `/api/fines`

| Method | Path              | Notes                                |
| ------ | ----------------- | ------------------------------------ |
| GET    | `/types`          | lookup list (late, violation, other) |
| GET    | `/?dispatcherId=` | all, or filtered by dispatcher       |
| POST   | `/`               | create                               |
| PUT    | `/:id`            | update                               |
| DELETE | `/:id`            | delete                               |

### Salary slips — `/api/salary-slips`

| Method | Path                          | Notes                                                                                           |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/?dispatcherId=`             | all, or filtered by dispatcher                                                                  |
| GET    | `/:dispatcherId/:year/:month` | one slip                                                                                        |
| POST   | `/`                           | generate — snapshots identity/settings, overwrites if regenerated for the same dispatcher/month |
| DELETE | `/:id`                        | delete                                                                                          |

## Known follow-ups (not done here)

- **Frontend still uses client-generated slug-style IDs** (`redline-freight-1001`)
  as `dispatcher.id`. The DB primary key here is a numeric `SERIAL`, with
  `slug` as a separate column. `dispatcherService.js` (and everything
  downstream that references `dispatcher.id`) will need a pass to switch
  to the numeric ID the API returns — happy to do that next if useful.
- No auth/authz yet — every route is open. `updated_by` columns exist in
  the schema for `usd_pkr_rates`/`tax_rates` but nothing populates them
  yet.
- No automated tests. I verified request/response wiring by hand; worth
  adding integration tests (e.g. supertest) before this goes to production.
- I wasn't able to run `npm install` / a live DB in this environment to
  do an end-to-end smoke test — worth doing that first on your machine.

## Audit columns

`dispatchers`, `expenses`, `fines`, `usd_pkr_rates` and `tax_rates` carry
`created_by` / `updated_by` (TEXT, the acting user's email);
`salary_slips` carries `generated_by`. They are set in the service layer
from `req.user.email` (the verified session) — request-body values for
these fields are ignored. `created_by` is written once on insert and never
touched on update or upsert-conflict. Columns are nullable so pre-auth rows
and future automated writers (e.g. a Sheets sync) are valid.
