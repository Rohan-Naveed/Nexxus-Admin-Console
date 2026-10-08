BEGIN;

CREATE TABLE IF NOT EXISTS salary_slip_history (
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

CREATE INDEX IF NOT EXISTS idx_salary_slip_history_event_at
    ON salary_slip_history(event_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_salary_slip_history_dispatcher
    ON salary_slip_history(dispatcher_id, event_at DESC);

INSERT INTO salary_slip_history (
    salary_slip_id,
    dispatcher_id,
    dispatcher_name,
    dispatch_alias,
    period_year,
    period_month,
    event_type,
    event_at,
    actor
)
SELECT
    id,
    dispatcher_id,
    dispatcher_name,
    dispatch_alias,
    period_year,
    period_month,
    'generated',
    generated_at,
    generated_by
FROM salary_slips slip
WHERE NOT EXISTS (
    SELECT 1
    FROM salary_slip_history history
    WHERE history.salary_slip_id = slip.id
      AND history.event_type = 'generated'
);

INSERT INTO salary_slip_history (
    salary_slip_id,
    dispatcher_id,
    dispatcher_name,
    dispatch_alias,
    period_year,
    period_month,
    event_type,
    event_at,
    actor,
    email
)
SELECT
    id,
    dispatcher_id,
    dispatcher_name,
    dispatch_alias,
    period_year,
    period_month,
    'email_sent',
    email_sent_at,
    email_sent_by,
    email_sent_to
FROM salary_slips slip
WHERE email_status = 'sent'
  AND email_sent_at IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM salary_slip_history history
      WHERE history.salary_slip_id = slip.id
        AND history.event_type = 'email_sent'
  );

COMMIT;