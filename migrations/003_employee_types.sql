BEGIN;

ALTER TABLE dispatchers
    ADD COLUMN employee_type TEXT NOT NULL DEFAULT 'dispatcher'
    CHECK (employee_type IN ('dispatcher', 'employee'));

ALTER TABLE salary_slips
    ADD COLUMN employee_type TEXT NOT NULL DEFAULT 'dispatcher'
    CHECK (employee_type IN ('dispatcher', 'employee'));

COMMIT;