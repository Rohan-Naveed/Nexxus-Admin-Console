-- Sync Center + Week Calendar — ONE migration to run.
-- Run it AFTER your users/audit-columns migration (already applied).
-- You have NOT run the earlier sync-center SQL, so this file contains all of it.
--
--   1. payroll_weeks: allow week numbers 1-6, store gross with 4 decimals
--   2. calendar_weeks: the admin-defined weeks (start/end date per week)
--   3. sync_history: one row per dispatcher / week / sync attempt
BEGIN;

-- 1. payroll_weeks -----------------------------------------------------
ALTER TABLE payroll_weeks DROP CONSTRAINT IF EXISTS payroll_weeks_week_number_check;
ALTER TABLE payroll_weeks ADD CONSTRAINT payroll_weeks_week_number_check
    CHECK (week_number BETWEEN 1 AND 6);

-- 4 decimals so monthly totals match the sheet (which sums unrounded values)
ALTER TABLE payroll_weeks ALTER COLUMN gross_amount TYPE NUMERIC(14,4);
COMMENT ON COLUMN payroll_weeks.gross_amount IS
    'USD, exactly as in the Google Sheet. Convert to PKR with that month''s usd_pkr_rates row.';

-- 2. calendar_weeks ----------------------------------------------------
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
    -- No two weeks may share a day, across all months.
    CONSTRAINT calendar_weeks_no_overlap
        EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

CREATE INDEX idx_calendar_weeks_dates ON calendar_weeks (start_date, end_date);

-- 3. sync_history ------------------------------------------------------
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
    note            TEXT,                   -- non-fatal remarks (e.g. sheet total differs from row sum)
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_history_week
    ON sync_history (dispatcher_id, period_year, period_month, week_number);
CREATE INDEX idx_sync_history_synced_at ON sync_history (synced_at DESC);

COMMIT;
