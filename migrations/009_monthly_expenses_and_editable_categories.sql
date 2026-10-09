BEGIN;

ALTER TABLE expense_categories
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE fine_types
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE expense_categories
SET cadence = 'monthly';

ALTER TABLE expenses
    ADD COLUMN expense_month DATE;

UPDATE expenses expense
SET expense_month = COALESCE(
    (
        SELECT make_date(calendar.period_year, calendar.period_month, 1)
        FROM calendar_weeks calendar
        WHERE expense.expense_date BETWEEN calendar.start_date AND calendar.end_date
        ORDER BY calendar.period_year DESC, calendar.period_month DESC, calendar.week_number
        LIMIT 1
    ),
    date_trunc('month', expense.expense_date)::date
);

WITH monthly_totals AS (
    SELECT
        category_key,
        expense_month,
        MIN(id) AS keep_id,
        SUM(amount) AS amount,
        STRING_AGG(NULLIF(note, ''), E'\n' ORDER BY id) FILTER (WHERE NULLIF(note, '') IS NOT NULL) AS note
    FROM expenses
    GROUP BY category_key, expense_month
)
UPDATE expenses expense
SET amount = monthly_totals.amount,
    note = monthly_totals.note
FROM monthly_totals
WHERE expense.id = monthly_totals.keep_id;

WITH monthly_totals AS (
    SELECT
        category_key,
        expense_month,
        MIN(id) AS keep_id
    FROM expenses
    GROUP BY category_key, expense_month
)
DELETE FROM expenses expense
USING monthly_totals
WHERE expense.category_key = monthly_totals.category_key
  AND expense.expense_month = monthly_totals.expense_month
  AND expense.id <> monthly_totals.keep_id;

ALTER TABLE expenses
    ALTER COLUMN expense_month SET NOT NULL,
    DROP COLUMN expense_date;

DROP INDEX IF EXISTS idx_expenses_date;

CREATE UNIQUE INDEX idx_expenses_category_month
    ON expenses(category_key, expense_month);

ALTER TABLE salary_slips
    ADD COLUMN deductions_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE salary_slips slip
SET deductions_breakdown =
    CASE WHEN slip.late_fine > 0 THEN
        jsonb_build_array(jsonb_build_object('key', 'late', 'label', 'Late', 'amount', slip.late_fine))
    ELSE '[]'::jsonb END
    ||
    CASE WHEN slip.violation_fine > 0 THEN
        jsonb_build_array(jsonb_build_object('key', 'violation', 'label', 'Violation / other', 'amount', slip.violation_fine))
    ELSE '[]'::jsonb END;

COMMIT;
