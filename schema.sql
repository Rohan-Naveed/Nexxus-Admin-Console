-- =====================================================================
-- Nexxus Admin Console — consolidated PostgreSQL schema (latest)
-- =====================================================================
-- Design notes:
--   * Weekly gross figures are the only gross data ever stored — Monthly
--     and Yearly totals are always derived via SUM(), matching how the
--     frontend already models this (see payrollHistory.js).
--   * basic_salary / fuel_allowance are stored as a single MONTHLY
--     figure only — Weekly/Yearly are derived (monthly/4.33, monthly*12)
--     the same way src/utils/salary.js does it. Storing all three would
--     let them drift out of sync with each other.
--   * usd_pkr_rates and tax_rates share the same "one row per month,
--     with audit columns" shape, per your request.
--   * salary_slips snapshots identity + settings fields at generation
--     time (see src/services/slipService.js comments) so a slip never
--     silently changes if a dispatcher's profile or a rate changes later.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Users — auth accounts. Anyone can sign up and pick a role, but at
-- most one 'admin' row may ever exist (enforced by the partial unique
-- index below rather than in application code, so it holds even under
-- concurrent signups). A 'user' account currently gets no console
-- access — see requireAdmin middleware — and just sees a "coming soon"
-- placeholder until dispatcher/driver-facing functionality is built.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'user')),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforces "only one admin account, ever" at the database level: a
-- unique index on a constant expression, filtered to admin rows, means
-- a second admin insert collides with the first no matter which row
-- gets there first.
CREATE UNIQUE INDEX idx_users_single_admin ON users ((role)) WHERE role = 'admin';


-- ---------------------------------------------------------------------
-- Dispatchers (carriers) — core profile + commission/pay rules
-- ---------------------------------------------------------------------
CREATE TABLE dispatchers (
    id                      SERIAL PRIMARY KEY,
    slug                    TEXT UNIQUE NOT NULL,        -- e.g. 'redline-freight' (human-readable, used in URLs/exports)
    name                    TEXT NOT NULL,               -- real name
    employee_type           TEXT NOT NULL DEFAULT 'dispatcher'
                            CHECK (employee_type IN ('dispatcher', 'employee')),

    -- Dispatching alias — the name this person actually dispatches under
    -- with carriers/customers (e.g. real name "Ayan", dispatches as
    -- "John"). Deliberately separate from `slug` above: `slug` is an
    -- internal URL-safe identifier auto-derived from `name`, while
    -- `dispatch_alias` is an admin-chosen, human-facing display name.
    -- Required at creation. Used as the primary display name in most of
    -- the UI; `name` and `dispatch_alias` are shown together on salary
    -- slips.
    dispatch_alias          TEXT NOT NULL,

    -- Commission & fixed pay rules (admin-editable, see DispatcherFormModal.jsx)
    commission_percentage   NUMERIC(6,4) NOT NULL DEFAULT 0,   -- stored as 0.12 = 12%
    basic_salary_monthly    NUMERIC(12,2) NOT NULL DEFAULT 0,
    fuel_allowance_monthly  NUMERIC(12,2) NOT NULL DEFAULT 0,
    default_cash_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,  -- default "paid in cash" split used when generating a slip

    -- Profile fields (DispatcherDetailModal / DispatcherFormModal)
    email                   TEXT,
    phone                   TEXT,
    address                 TEXT,
    dob                     DATE,
    gender                  TEXT,
    designation             TEXT NOT NULL DEFAULT 'Dispatcher',
    cnic                    TEXT,
    account_number          TEXT,                        -- e.g. "03011234567 (Easypaisa)"

    -- Roster status
    status                  TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'left')),
    joined_date             DATE,
    left_date               DATE,

    -- Google Sheets sync target — the sync service needs to know which
    -- sheet belongs to which dispatcher. Deliberately nullable: not
    -- required when a dispatcher is first created, but the admin console
    -- should flag any dispatcher missing either value ("not linked yet")
    -- since gross data can't sync without them.
    google_sheet_id         TEXT,                        -- Sheets file ID
    google_sheet_tab        TEXT,                        -- tab/range name if a sheet has multiple tabs

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Who created/last edited this dispatcher profile. Nullable because
    -- rows created before auth existed won't have it, and because a
    -- future automated process (e.g. a Sheets-driven sync) may also
    -- write here without a human actor. Set server-side from the
    -- authenticated session — never trust a client-supplied value.
    created_by              TEXT,
    updated_by              TEXT
);

CREATE INDEX idx_dispatchers_status ON dispatchers(status);


-- ---------------------------------------------------------------------
-- Payroll weeks — the raw synced gross data, one row per
-- dispatcher/month/week. This is what the Google Sheets sync writes to.
-- Monthly gross = SUM(gross_amount) for the weeks of that month (as defined in calendar_weeks).
-- Yearly gross  = SUM of the 12 months' totals.
-- A NULL gross_amount means that week hasn't been synced yet (matches
-- how a partially-completed current month looks today).
-- ---------------------------------------------------------------------
CREATE TABLE payroll_weeks (
    id              SERIAL PRIMARY KEY,
    dispatcher_id   INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
    period_year     SMALLINT NOT NULL,
    period_month    SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    week_number     SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 6),   -- weeks are defined by the admin in calendar_weeks
    gross_amount    NUMERIC(14,4),                       -- NULL = not synced yet; 4 decimals so month totals match the sheet exactly
    gross_percentage NUMERIC(8,4) NOT NULL,
    tracking_percentage NUMERIC(8,4) NOT NULL,
    tracking_fee_amount NUMERIC(14,4),                   -- USD, snapshot generated at sync time

    synced_at       TIMESTAMPTZ,                         -- last time the sync service wrote/updated this row
    sync_source     TEXT NOT NULL DEFAULT 'google_sheets',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (dispatcher_id, period_year, period_month, week_number)
);

CREATE INDEX idx_payroll_weeks_dispatcher_period
    ON payroll_weeks(dispatcher_id, period_year, period_month);


-- ---------------------------------------------------------------------
-- USD/PKR exchange rate — one row per month, with audit trail.
-- Stored as PKR-per-1-USD (e.g. 278.00), since that's how it's normally
-- quoted; the app's usdPerPkr (a tiny fraction) is just 1 / rate_pkr_per_usd.
-- ---------------------------------------------------------------------
CREATE TABLE usd_pkr_rates (
    id              SERIAL PRIMARY KEY,
    period_year     SMALLINT NOT NULL,
    period_month    SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    rate_pkr_per_usd NUMERIC(12,4) NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT,                                -- set server-side from the session, not the client
    updated_by      TEXT,

    UNIQUE (period_year, period_month)
);


-- ---------------------------------------------------------------------
-- Tax percentage — same shape as usd_pkr_rates, one row per month.
-- ---------------------------------------------------------------------
CREATE TABLE tax_rates (
    id              SERIAL PRIMARY KEY,
    period_year     SMALLINT NOT NULL,
    period_month    SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    tax_percent     NUMERIC(5,2) NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT,
    updated_by      TEXT,

    UNIQUE (period_year, period_month)
);

CREATE TABLE properties (
    property_key    TEXT PRIMARY KEY,
    numeric_value   NUMERIC(10,4) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      TEXT
);

INSERT INTO properties (property_key, numeric_value) VALUES
    ('gross_percentage', 2.5000),
    ('tracking_percentage', 0.5000)
ON CONFLICT (property_key) DO NOTHING;


-- ---------------------------------------------------------------------
-- Expense categories — admins manage these through Properties. Archived
-- categories remain available to historical expense records.
-- ---------------------------------------------------------------------
CREATE TABLE expense_categories (
    key             TEXT PRIMARY KEY,                    -- 'dinner', 'electricity', etc.
    label           TEXT NOT NULL,
    cadence         TEXT NOT NULL DEFAULT 'monthly' CHECK (cadence IN ('daily', 'monthly', 'flexible')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO expense_categories (key, label, cadence) VALUES
    ('dinner',        'Dinner',           'monthly'),
    ('miscellaneous', 'Miscellaneous',    'monthly'),
    ('electricity',   'Electricity Bill', 'monthly'),
    ('gas',           'Gas Bill',         'monthly'),
    ('water',         'Water Bill',       'monthly');


-- ---------------------------------------------------------------------
-- Expenses — one amount per category per calendar month.
-- ---------------------------------------------------------------------
CREATE TABLE expenses (
    id              SERIAL PRIMARY KEY,
    category_key    TEXT NOT NULL REFERENCES expense_categories(key),
    amount          NUMERIC(12,2) NOT NULL,
    expense_month   DATE NOT NULL,
    note            TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT,
    updated_by      TEXT
);

CREATE UNIQUE INDEX idx_expenses_category_month ON expenses(category_key, expense_month);


-- ---------------------------------------------------------------------
-- Deduction categories — admins manage these through Properties. Archived
-- categories remain available to historical deductions.
-- ---------------------------------------------------------------------
CREATE TABLE fine_types (
    key             TEXT PRIMARY KEY,                    -- 'late', 'violation', 'other'
    label           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO fine_types (key, label) VALUES
    ('late',      'Late'),
    ('violation', 'Violation'),
    ('other',     'Other');


-- ---------------------------------------------------------------------
-- Fines / deductions — flat list, one row per incident, tied to a
-- dispatcher. Feeds straight into salary slip generation.
-- ---------------------------------------------------------------------
CREATE TABLE fines (
    id              SERIAL PRIMARY KEY,
    dispatcher_id   INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE CASCADE,
    type_key        TEXT NOT NULL REFERENCES fine_types(key),
    amount          NUMERIC(12,2) NOT NULL,
    fine_date       DATE NOT NULL,
    reason          TEXT,
    note            TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT,
    updated_by      TEXT
);

CREATE INDEX idx_fines_dispatcher_date ON fines(dispatcher_id, fine_date);


-- ---------------------------------------------------------------------
-- Salary slips — one row per dispatcher/month. Regenerating for the
-- same dispatcher+month overwrites the existing row (UNIQUE constraint
-- below), matching the current in-memory slipService.js behavior.
--
-- Identity fields (name, designation, cnic, account_number, email) and
-- settings (usd_per_pkr, tax_percent) are SNAPSHOTTED here at generation
-- time, deliberately duplicating dispatcher/rate data, so a previously
-- issued slip stays exactly as it was even if the dispatcher's profile
-- or the admin-set rates change afterwards.
-- ---------------------------------------------------------------------
CREATE TABLE salary_slips (
    id                  SERIAL PRIMARY KEY,
    dispatcher_id       INTEGER NOT NULL REFERENCES dispatchers(id) ON DELETE RESTRICT,
    employee_type       TEXT NOT NULL DEFAULT 'dispatcher'
                        CHECK (employee_type IN ('dispatcher', 'employee')),
    period_year         SMALLINT NOT NULL,
    period_month        SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
        tracking_fee_snapshot NUMERIC(14,4),                -- weekly tracking fee snapshot
        global_tracking_percentage NUMERIC(5,2) NOT NULL DEFAULT 0, -- global tracking percentage

    -- Snapshotted identity (frozen at generation time)
    dispatcher_name     TEXT NOT NULL,
    dispatch_alias      TEXT NOT NULL,
    designation         TEXT NOT NULL,
    cnic                TEXT,
    account_number      TEXT,
    email               TEXT,

    -- Snapshotted settings (frozen at generation time)
    usd_per_pkr         NUMERIC(14,10) NOT NULL,
    tax_percent         NUMERIC(5,2) NOT NULL,

    -- Computed + admin-editable figures (see utils/slipCalc.js#computeSlipPreview)
    monthly_gross_usd   NUMERIC(14,2) NOT NULL,
    commission_percent  NUMERIC(6,2) NOT NULL,
    commission_usd      NUMERIC(14,2) NOT NULL,
    amount_in_pkr       NUMERIC(14,2) NOT NULL,
    basic_salary        NUMERIC(12,2) NOT NULL,
    fuel_allowance      NUMERIC(12,2) NOT NULL,
    total_earnings      NUMERIC(14,2) NOT NULL,
    late_fine           NUMERIC(12,2) NOT NULL DEFAULT 0,
    violation_fine      NUMERIC(12,2) NOT NULL DEFAULT 0,
    advance             NUMERIC(12,2) NOT NULL DEFAULT 0,
    income_tax          NUMERIC(14,2) NOT NULL,
    total_deductions    NUMERIC(14,2) NOT NULL,
    deductions_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    net_pay             NUMERIC(14,2) NOT NULL,
    cash_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    account_amount      NUMERIC(14,2) NOT NULL,

    email_status        TEXT NOT NULL DEFAULT 'not_sent'
                        CHECK (email_status IN ('not_sent', 'sending', 'sent', 'failed')),
    email_sent_at       TIMESTAMPTZ,
    email_sent_to       TEXT,
    email_sent_by       TEXT,
    email_last_attempt_at TIMESTAMPTZ,
    email_last_error    TEXT,

    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_by        TEXT,               -- admin who (re)generated this slip; set server-side
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (dispatcher_id, period_year, period_month)
);

CREATE INDEX idx_salary_slips_period ON salary_slips(period_year, period_month);


-- ---------------------------------------------------------------------
-- Salary slip activity — append-only audit events for each generation
-- and successful email delivery. Unlike salary_slips, this table keeps
-- prior events when a slip is regenerated or deleted.
-- ---------------------------------------------------------------------
CREATE TABLE salary_slip_history (
    id                  SERIAL PRIMARY KEY,
    salary_slip_id      INTEGER REFERENCES salary_slips(id) ON DELETE SET NULL,
    dispatcher_id       INTEGER REFERENCES dispatchers(id) ON DELETE SET NULL,
    dispatcher_name     TEXT NOT NULL,
    dispatch_alias      TEXT NOT NULL,
    period_year         SMALLINT NOT NULL,
    period_month        SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    event_type          TEXT NOT NULL CHECK (event_type IN ('generated', 'email_sent')),
    event_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor               TEXT,
    email               TEXT
);

CREATE INDEX idx_salary_slip_history_event_at
    ON salary_slip_history(event_at DESC, id DESC);
CREATE INDEX idx_salary_slip_history_dispatcher
    ON salary_slip_history(dispatcher_id, event_at DESC);


-- ---------------------------------------------------------------------
-- Sync history — one row per dispatcher, week and sync attempt (manual
-- or scheduler). payroll_weeks holds the CURRENT data; this table is the
-- log of every attempt, including failed and no-data ones, so the Sync
-- Center can show what synced, when, and by whom.
-- ---------------------------------------------------------------------
CREATE TABLE sync_history (
    id              SERIAL PRIMARY KEY,
    run_id          UUID NOT NULL,          -- groups rows from one click / one scheduler run
    dispatcher_id   INTEGER REFERENCES dispatchers(id) ON DELETE SET NULL,
    dispatcher_name TEXT NOT NULL,          -- snapshot, so history survives a deleted dispatcher
    period_year     SMALLINT NOT NULL,
    period_month    SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    week_number     SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 6),
    trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('scheduler', 'manual')),
    triggered_by    TEXT NOT NULL,          -- admin email, or 'scheduler'
    status          TEXT NOT NULL CHECK (status IN ('success', 'failed', 'no_data')),
    gross_amount    NUMERIC(14,4),
    error_message   TEXT,                   -- why a failed attempt failed
    note            TEXT,                   -- non-fatal remarks on a success (e.g. sheet total differs from row sum)
    re_rate         BOOLEAN NOT NULL DEFAULT FALSE, -- admin explicitly applied current tracking rates
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_history_week
    ON sync_history (dispatcher_id, period_year, period_month, week_number);
CREATE INDEX idx_sync_history_synced_at ON sync_history (synced_at DESC);


-- ---------------------------------------------------------------------
-- Week calendar — the admin decides how many weeks each month has and the
-- start/end date of every week. The whole console and the sync scheduler
-- read this table: a month with no rows here is "not set", and nothing is
-- synced for it. Weeks never overlap (enforced below) and the API keeps
-- them back-to-back.
-- ---------------------------------------------------------------------
CREATE TABLE calendar_weeks (
    id            SERIAL PRIMARY KEY,
    period_year   SMALLINT NOT NULL,
    period_month  SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    week_number   SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 6),
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    created_by    TEXT,
    updated_by    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT calendar_weeks_dates_check CHECK (end_date >= start_date),
    CONSTRAINT calendar_weeks_unique UNIQUE (period_year, period_month, week_number),
    CONSTRAINT calendar_weeks_no_overlap
        EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);
CREATE INDEX idx_calendar_weeks_dates ON calendar_weeks (start_date, end_date);
