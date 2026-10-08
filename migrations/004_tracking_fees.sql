BEGIN;

CREATE TABLE IF NOT EXISTS properties (
    property_key    TEXT PRIMARY KEY,
    numeric_value   NUMERIC(10,4) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      TEXT
);

INSERT INTO properties (property_key, numeric_value) VALUES
    ('gross_percentage', 2.5000),
    ('tracking_percentage', 0.5000)
ON CONFLICT (property_key) DO NOTHING;

ALTER TABLE payroll_weeks
    ADD COLUMN IF NOT EXISTS gross_percentage NUMERIC(8,4) NOT NULL DEFAULT 2.5000,
    ADD COLUMN IF NOT EXISTS tracking_percentage NUMERIC(8,4) NOT NULL DEFAULT 0.5000,
    ADD COLUMN IF NOT EXISTS tracking_fee_amount NUMERIC(14,4);

UPDATE payroll_weeks
SET tracking_fee_amount = CASE
    WHEN gross_amount IS NULL THEN NULL
    WHEN gross_percentage > 0 THEN
        (gross_amount / (gross_percentage / 100)) * (tracking_percentage / 100)
    ELSE 0
END
WHERE tracking_fee_amount IS NULL;

COMMIT;