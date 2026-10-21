BEGIN;

ALTER TABLE salary_slips
    ADD COLUMN bonus NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (bonus >= 0);

COMMIT;
